import "server-only";

import type { RowDataPacket } from "mysql2";
import { cacheLife, cacheTag, io } from "next/cache";

import { HisQueryError, query } from "@/lib/db/his";
import { fiscalYearRange, todayIsoDate } from "@/lib/kpi/fiscal-year";
import {
  PPFS_PHASE1_ITEMS,
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
  ppfsAncParams,
} from "@/lib/kpi/sql/ppfs-hosxp";
import type { ScreeningSqlContext } from "@/lib/kpi/sql/screening-common";

/**
 * "PP / รายได้คัดกรอง" — PPFS screening revenue (target vs earned vs gap),
 * Phase 1, HOSxP only, aggregates only.
 * Definitions: docs/kpi/ppfs-revenue-feasibility.md ("Implemented Phase 1").
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

interface VillageRow extends RowDataPacket {
  village_id: number | string | null;
  village_moo: string | null;
  village_name: string | null;
  eligible: number | string;
  numerator: number | string;
  billed: number | string | null;
}

interface AncRow extends RowDataPacket {
  pregnancies: number | string;
  target_visits: number | string | null;
  done_visits: number | string | null;
  extra_visits: number | string | null;
  extra_pregnancies: number | string | null;
  target_lab1: number | string | null;
  done_lab1: number | string | null;
  billed_visits: number | string | null;
  billed_lab1: number | string | null;
}

const num = (v: number | string | null | undefined): number => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

const emptyToNull = (s: string | null): string | null =>
  s === null || s.trim() === "" ? null : s.trim();

interface Counts {
  target: number;
  done: number;
  billed: number | null;
  villages: PpfsVillageRow[] | null;
  potential?: PpfsPotential | null;
}

function buildItem(def: PpfsItemDef, c: Counts): PpfsItem {
  const targetBaht = c.target * def.rate;
  const earnedBaht = c.done * def.rate;
  return {
    ...def,
    target: c.target,
    done: c.done,
    billed: c.billed,
    targetBaht,
    earnedBaht,
    gapBaht: Math.max(0, targetBaht - earnedBaht),
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

async function loadAnc(ctx: ScreeningSqlContext): Promise<AncRow> {
  const rows = await query<AncRow>(PPFS_ANC_SQL, ppfsAncParams(ctx));
  const row = rows[0];
  if (!row) throw new Error("ANC query returned no row");
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

  const catchmentDefs = PPFS_PHASE1_ITEMS.filter(
    (d) => d.population === "catchment",
  );
  // ANC visit + lab set 1 share one query.
  const [ancSettled, ...catchmentSettled] = await Promise.allSettled([
    loadAnc(ctx),
    ...catchmentDefs.map((d) => loadCatchment(d, ctx)),
  ] as const);

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

  for (const def of PPFS_PHASE1_ITEMS) {
    if (def.population !== "service") continue;
    if (ancSettled.status === "rejected") {
      logItemError(def.code, ancSettled.reason);
      byCode.set(def.code, failedItem(def));
      continue;
    }
    const r = ancSettled.value;
    const counts: Counts =
      def.code === "ANC_LAB1"
        ? {
            target: num(r.target_lab1),
            done: num(r.done_lab1),
            billed: num(r.billed_lab1),
            villages: null,
          }
        : {
            target: num(r.target_visits),
            done: num(r.done_visits),
            billed: num(r.billed_visits),
            villages: null,
            potential: ancVisit9Plus(def.rate, r),
          };
    byCode.set(def.code, buildItem(def, counts));
  }

  const items = PPFS_PHASE1_ITEMS.map((d) => byCode.get(d.code)).filter(
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
