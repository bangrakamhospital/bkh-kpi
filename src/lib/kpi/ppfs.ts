import "server-only";

import type { RowDataPacket } from "mysql2";
import { cacheLife, cacheTag, io } from "next/cache";

import { HisQueryError, query, type QueryParams } from "@/lib/db/his";
import { fiscalYearRange, todayIsoDate } from "@/lib/kpi/fiscal-year";
import {
  PPFS_HOSPITAL_ITEMS,
  PPFS_RATE_YEAR,
  type PpfsItemDef,
} from "@/lib/kpi/ppfs-rates";
import type {
  PpfsItem,
  PpfsPotential,
  PpfsSummary,
  PpfsTotals,
  PpfsVillageRow,
} from "@/lib/kpi/ppfs-types";
import {
  isCatchmentCode,
  PPFS_ANC_SQL,
  PPFS_CATCHMENT_SQL,
  PPFS_DELIVERY_SQL,
  PPFS_PP_MAX_VISITS,
  PPFS_UPT_SQL,
  ppfsAncParams,
  ppfsDeliveryParams,
  ppfsUptParams,
} from "@/lib/kpi/sql/ppfs-hosxp";
import type { ScreeningSqlContext } from "@/lib/kpi/sql/screening-common";

/**
 * "PP / รายได้คัดกรอง" — PPFS screening revenue (target vs earned vs gap),
 * HOSxP only, aggregates only: Phase 1 items + hospital-only
 * mother-and-child items (PPFS_HOSPITAL_ITEMS).
 * Definitions: docs/kpi/ppfs-revenue-feasibility.md ("Implemented").
 * SQL: ./sql/ppfs-hosxp.ts. Rates (applied here, not in SQL): ./ppfs-rates.ts.
 */

export const PPFS_CACHE_TAG = "kpi:ppfs";

export function computeTotals(items: readonly PpfsItem[]): PpfsTotals {
  let targetBaht = 0;
  let gapBaht = 0;
  let earnedAgainstTarget = 0;
  let earnedBaht = 0;
  for (const it of items) {
    earnedBaht += it.earnedBaht;
    if (it.targetBaht !== null) {
      targetBaht += it.targetBaht;
      earnedAgainstTarget += it.earnedBaht;
      gapBaht += it.gapBaht ?? 0;
    }
  }
  const coveragePercent =
    targetBaht > 0 ? Math.min(100, (earnedAgainstTarget / targetBaht) * 100) : 0;
  return { targetBaht, earnedBaht, gapBaht, coveragePercent };
}

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

type Num = number | string | null;

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

const num = (v: Num | undefined): number => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

const emptyToNull = (s: string | null): string | null =>
  s === null || s.trim() === "" ? null : s.trim();

interface Counts {
  /** null = no target population (grade C). */
  target: number | null;
  done: number;
  billed: number | null;
  villages: PpfsVillageRow[] | null;
  potential?: PpfsPotential | null;
}

function buildItem(def: PpfsItemDef, c: Counts): PpfsItem {
  const targetBaht = c.target === null ? null : c.target * def.rate;
  const earnedBaht = c.done * def.rate;
  return {
    ...def,
    target: c.target,
    done: c.done,
    billed: c.billed,
    targetBaht,
    earnedBaht,
    gapBaht: targetBaht === null ? null : Math.max(0, targetBaht - earnedBaht),
    potential: c.potential ?? null,
    villages: c.villages,
  };
}

function failedItem(def: PpfsItemDef): PpfsItem {
  return {
    ...def,
    target: null,
    done: 0,
    billed: null,
    targetBaht: null,
    earnedBaht: 0,
    gapBaht: null,
    potential: null,
    villages: def.population === "catchment" ? [] : null,
    error: "ไม่สามารถดึงข้อมูลรายการนี้ได้",
  };
}

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

/** Runs a one-row aggregate query; throws when it returns no row. */
async function loadOneRow<T extends RowDataPacket>(
  label: string,
  sql: string,
  params: QueryParams,
): Promise<T> {
  const rows = await query<T>(sql, params);
  const row = rows[0];
  if (!row) throw new Error(`${label} query returned no row`);
  return row;
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
}

/** The row of a settled query; rethrows its error when it failed. */
function rowOf<T>(s: PromiseSettledResult<T>): T {
  if (s.status === "rejected") throw s.reason;
  return s.value;
}

const service = (target: number | null, done: number, billed: number): Counts => ({
  target,
  done,
  billed,
  villages: null,
});

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
    default:
      throw new Error(`not a service item: ${def.code}`);
  }
}

function logItemError(code: string, err: unknown): void {
  const name = err instanceof Error ? err.name : "UnknownError";
  const driverCode = err instanceof HisQueryError ? (err.code ?? "") : "";
  console.error(
    `[kpi/ppfs] item ${code} failed: ${name}${driverCode ? ` (${driverCode})` : ""}`,
  );
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
  // Service items share three queries: ANC (5 items), delivery (PP visit
  // + iodine) and pregnancy test. A failed query fails only its items.
  const [anc, delivery, upt, ...catchmentSettled] = await Promise.allSettled([
    loadOneRow<AncRow>("ANC", PPFS_ANC_SQL, ppfsAncParams(ctx)),
    loadOneRow<DeliveryRow>("delivery", PPFS_DELIVERY_SQL, ppfsDeliveryParams(ctx)),
    loadOneRow<UptRow>("UPT", PPFS_UPT_SQL, ppfsUptParams(ctx)),
    ...catchmentDefs.map((d) => loadCatchment(d, ctx)),
  ] as const);
  const serviceResults: ServiceResults = { anc, delivery, upt };

  const byCode = new Map<string, PpfsItem>();
  catchmentDefs.forEach((def, i) => {
    const s = catchmentSettled[i];
    if (s.status === "fulfilled") {
      byCode.set(def.code, buildItem(def, s.value as Counts));
    } else {
      logItemError(def.code, s.reason);
      byCode.set(def.code, failedItem(def));
    }
  });

  for (const def of PPFS_HOSPITAL_ITEMS) {
    if (def.population !== "service") continue;
    try {
      byCode.set(def.code, buildItem(def, serviceCounts(def, serviceResults)));
    } catch (err) {
      logItemError(def.code, err);
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
