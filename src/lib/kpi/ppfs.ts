import "server-only";

import type { RowDataPacket } from "mysql2";
import { cacheLife, cacheTag, io } from "next/cache";

import { query } from "@/lib/db/his";
import { fiscalYearRange, todayIsoDate } from "@/lib/kpi/fiscal-year";
import {
  buildItem,
  computeTotals,
  type Counts,
  failedItem,
  loadOneRow,
  logItemError,
  type Num,
  num,
  rowOf,
  service,
} from "@/lib/kpi/ppfs-common";
import {
  PPFS_HOSPITAL_ITEMS,
  PPFS_RATE_YEAR,
  type PpfsItemDef,
} from "@/lib/kpi/ppfs-rates";
import type {
  PpfsItem,
  PpfsPotential,
  PpfsSummary,
  PpfsVillageRow,
} from "@/lib/kpi/ppfs-types";
import {
  isCatchmentCode,
  PPFS_ANC_SQL,
  PPFS_CATCHMENT_SQL,
  PPFS_DELIVERY_SQL,
  PPFS_FLU_SQL,
  PPFS_FP_SQL,
  PPFS_PP_MAX_VISITS,
  PPFS_UPT_SQL,
  ppfsAncParams,
  ppfsDeliveryParams,
  ppfsFluParams,
  ppfsFpParams,
  ppfsUptParams,
} from "@/lib/kpi/sql/ppfs-hosxp";
import type { ScreeningSqlContext } from "@/lib/kpi/sql/screening-common";

/**
 * "PP / รายได้ สปสช." — PPFS revenue (target vs earned vs gap), HOSxP only,
 * aggregates only: Phase 1 items + hospital-only mother-and-child and
 * family-planning / influenza-vaccine items (PPFS_HOSPITAL_ITEMS).
 * Definitions: docs/kpi/ppfs-revenue-feasibility.md ("Implemented").
 * SQL: ./sql/ppfs-hosxp.ts. Rates (applied here, not in SQL): ./ppfs-rates.ts.
 * Other (non-PP) NHSO revenue: ./nhso-other.ts (/pp/other).
 */

export const PPFS_CACHE_TAG = "kpi:ppfs";

/**
 * Rendering contract (Cache Components), same as getServiceOverview:
 * `await io()` first so nothing runs during prerender; render the caller
 * inside <Suspense>. Cached per fiscal year: "hours" for the running year,
 * "days" once it has ended (late entries still trickle in, so not "max");
 * "minutes" when an item failed. Invalidate with
 * revalidateTag(PPFS_CACHE_TAG).
 * Throws when every item query failed.
 */
export async function getPpfsSummary(fiscalYear: number): Promise<PpfsSummary> {
  await io();
  const closed = todayIsoDate() > fiscalYearRange(fiscalYear).end;
  return loadPpfsSummary(fiscalYear, closed);
}

// --- rows -------------------------------------------------------------------

interface VillageRow extends RowDataPacket {
  village_id: Num;
  village_moo: string | null;
  village_name: string | null;
  eligible: number | string;
  numerator: number | string;
  billed: Num;
}

interface AncRow extends RowDataPacket {
  pregnancies: number | string;
  target_visits: Num;
  done_visits: Num;
  extra_visits: Num;
  extra_pregnancies: Num;
  target_lab1: Num;
  done_lab1: Num;
  target_lab2: Num;
  done_lab2: Num;
  target_us: Num;
  done_us: Num;
  target_dental: Num;
  done_dental: Num;
  billed_visits: Num;
  billed_lab1: Num;
  billed_lab2: Num;
  billed_us: Num;
  billed_dental: Num;
}

interface DeliveryRow extends RowDataPacket {
  deliveries: Num;
  done_pp: Num;
  billed_pp: Num;
  done_iodine: Num;
  billed_iodine: Num;
}

interface UptRow extends RowDataPacket {
  done_upt: Num;
  billed_upt: Num;
}

interface FpRow extends RowDataPacket {
  done_dmpa: Num;
  billed_dmpa: Num;
  done_pill: Num;
  billed_pill: Num;
}

interface FluRow extends RowDataPacket {
  done_flu: Num;
}

const emptyToNull = (s: string | null): string | null =>
  s === null || s.trim() === "" ? null : s.trim();

async function loadCatchment(
  def: PpfsItemDef,
  ctx: ScreeningSqlContext,
): Promise<Counts> {
  if (!isCatchmentCode(def.code)) throw new Error(`not a catchment item: ${def.code}`);
  const sql = PPFS_CATCHMENT_SQL[def.code];
  const rows = await query<VillageRow>(sql.village, sql.buildParams(ctx));
  const villages: PpfsVillageRow[] = rows.map((r) => ({
    villageId: num(r.village_id),
    moo: emptyToNull(r.village_moo),
    villageName: emptyToNull(r.village_name),
    target: num(r.eligible),
    done: num(r.numerator),
    billed: sql.hasBilled ? num(r.billed) : null,
  }));
  villages.sort(
    (a, b) =>
      (Number(a.moo) || Number.MAX_SAFE_INTEGER) -
        (Number(b.moo) || Number.MAX_SAFE_INTEGER) || a.villageId - b.villageId,
  );
  let target = 0;
  let done = 0;
  let billed = 0;
  for (const v of villages) {
    target += v.target;
    done += v.done;
    billed += v.billed ?? 0;
  }
  return { target, done, billed: sql.hasBilled ? billed : null, villages };
}

const ANC_VISIT_9_PLUS_LABEL = "ครั้งที่ 9+ (ต้องส่งหลักฐาน)";

/**
 * ANC visit 9+ per pregnancy: NHSO pays visits 1-8 without extra
 * documents; 9+ only when medically necessary and supported by evidence
 * reviewed by NHSO. Shown beside the ANC row, never in earned / target.
 */
function ancVisit9Plus(rate: number, r: AncRow): PpfsPotential {
  const units = num(r.extra_visits);
  return {
    label: ANC_VISIT_9_PLUS_LABEL,
    shortLabel: "ครั้งที่ 9+",
    units,
    persons: num(r.extra_pregnancies),
    personsUnit: "ครรภ์",
    baht: units * rate,
    note:
      "เบิกได้เมื่อจำเป็นทางการแพทย์และส่งหลักฐานให้ สปสช. พิจารณา ไม่รวมในยอดได้แล้วและเป้าหมาย · ลำดับครั้งนับเฉพาะที่มาในปีงบฯ นี้ (ไม่นับครั้งที่มาก่อน 1 ต.ค.) ตัวเลขจริงอาจสูงกว่านี้",
  };
}

/** Settled results of the service-based queries (one row each). */
interface ServiceResults {
  anc: PromiseSettledResult<AncRow>;
  delivery: PromiseSettledResult<DeliveryRow>;
  upt: PromiseSettledResult<UptRow>;
  fp: PromiseSettledResult<FpRow>;
  flu: PromiseSettledResult<FluRow>;
}

/** Counts of a service-based item; throws when its query failed. */
function serviceCounts(def: PpfsItemDef, res: ServiceResults): Counts {
  switch (def.code) {
    case "ANC_VISIT": {
      const r = rowOf(res.anc);
      return {
        ...service(num(r.target_visits), num(r.done_visits), num(r.billed_visits)),
        potential: ancVisit9Plus(def.rate, r),
      };
    }
    case "ANC_LAB1": {
      const r = rowOf(res.anc);
      return service(num(r.target_lab1), num(r.done_lab1), num(r.billed_lab1));
    }
    case "ANC_LAB2": {
      const r = rowOf(res.anc);
      return service(num(r.target_lab2), num(r.done_lab2), num(r.billed_lab2));
    }
    case "ANC_US": {
      const r = rowOf(res.anc);
      return service(num(r.target_us), num(r.done_us), num(r.billed_us));
    }
    case "ANC_DENTAL": {
      const r = rowOf(res.anc);
      return service(num(r.target_dental), num(r.done_dental), num(r.billed_dental));
    }
    case "PP_VISIT": {
      // target = women who gave birth × visits paid per woman
      const r = rowOf(res.delivery);
      return service(num(r.deliveries) * PPFS_PP_MAX_VISITS, num(r.done_pp), num(r.billed_pp));
    }
    case "MCH_IODINE": {
      const r = rowOf(res.delivery);
      return service(num(r.deliveries), num(r.done_iodine), num(r.billed_iodine));
    }
    case "MCH_UPT": {
      const r = rowOf(res.upt);
      return service(null, num(r.done_upt), num(r.billed_upt));
    }
    case "FP_DMPA": {
      const r = rowOf(res.fp);
      return service(null, num(r.done_dmpa), num(r.billed_dmpa));
    }
    case "FP_PILL": {
      const r = rowOf(res.fp);
      return service(null, num(r.done_pill), num(r.billed_pill));
    }
    case "FLU_VACCINE": {
      // claimed outside HOSxP (KTB / MOPH IC): no billed figure
      const r = rowOf(res.flu);
      return service(null, num(r.done_flu), null);
    }
    default:
      throw new Error(`not a service item: ${def.code}`);
  }
}

async function loadPpfsSummary(
  fiscalYear: number,
  closed: boolean,
): Promise<PpfsSummary> {
  "use cache";
  cacheTag(PPFS_CACHE_TAG);

  const range = fiscalYearRange(fiscalYear);
  const ctx: ScreeningSqlContext = {
    periodStart: range.start,
    countFrom: range.start,
    dataAsOf: range.end,
  };

  const catchmentDefs = PPFS_HOSPITAL_ITEMS.filter(
    (d) => d.population === "catchment",
  );
  // Service items share five queries: ANC (5 items), delivery (PP visit
  // + iodine), pregnancy test, family planning (DMPA + pill) and influenza
  // vaccine. A failed query fails only its items.
  const [anc, delivery, upt, fp, flu, ...catchmentSettled] = await Promise.allSettled([
    loadOneRow<AncRow>("ANC", PPFS_ANC_SQL, ppfsAncParams(ctx)),
    loadOneRow<DeliveryRow>("delivery", PPFS_DELIVERY_SQL, ppfsDeliveryParams(ctx)),
    loadOneRow<UptRow>("UPT", PPFS_UPT_SQL, ppfsUptParams(ctx)),
    loadOneRow<FpRow>("FP", PPFS_FP_SQL, ppfsFpParams(ctx)),
    loadOneRow<FluRow>("flu", PPFS_FLU_SQL, ppfsFluParams(ctx)),
    ...catchmentDefs.map((d) => loadCatchment(d, ctx)),
  ] as const);
  const serviceResults: ServiceResults = { anc, delivery, upt, fp, flu };

  const byCode = new Map<string, PpfsItem>();
  catchmentDefs.forEach((def, i) => {
    const s = catchmentSettled[i];
    if (s.status === "fulfilled") {
      byCode.set(def.code, buildItem(def, s.value as Counts));
    } else {
      logItemError("kpi/ppfs", def.code, s.reason);
      byCode.set(def.code, failedItem(def));
    }
  });

  for (const def of PPFS_HOSPITAL_ITEMS) {
    if (def.population !== "service") continue;
    try {
      byCode.set(def.code, buildItem(def, serviceCounts(def, serviceResults)));
    } catch (err) {
      logItemError("kpi/ppfs", def.code, err);
      byCode.set(def.code, failedItem(def));
    }
  }

  const items = PPFS_HOSPITAL_ITEMS.map((d) => byCode.get(d.code)).filter(
    (x): x is PpfsItem => x !== undefined,
  );
  const failed = items.filter((it) => it.error !== undefined).length;
  if (failed === items.length) {
    throw new Error("all PPFS item queries failed");
  }

  // Exactly one cacheLife call per invocation (see cacheLife docs).
  if (failed > 0) {
    cacheLife("minutes");
  } else if (closed) {
    cacheLife("days");
  } else {
    cacheLife("hours");
  }

  return {
    fiscalYear,
    rateYear: PPFS_RATE_YEAR,
    periodStart: range.start,
    periodEnd: range.end,
    closed,
    items,
    totals: computeTotals(items),
    updatedAt: new Date().toISOString(),
    source: "hosxp",
  };
}
