import "server-only";

import { cacheLife, cacheTag, io } from "next/cache";
import { connection } from "next/server";

import {
  buildCkd5Query,
  buildSourceQuery,
  resolveDataSourceKind,
  resolveScreeningPeriod,
  SCREENING_CACHE_TAG,
  toPercent,
  type ScreeningPeriod,
} from "@/lib/kpi/screening";
import {
  apportionTargetShare,
  CKD5_INDICATOR,
  isLowerBetter,
  isReductionCode,
  SCREENING_INDICATORS,
  screeningCountWindow,
  screeningIndicatorNote,
} from "@/lib/kpi/screening-indicators";
import {
  PERSONS_EXPORT_LIMIT,
  PERSONS_PER_VILLAGE_LIMIT,
} from "@/lib/kpi/sql/screening-common";
import type {
  RatioCode,
  ScreeningCode,
  ScreeningPerson,
  VillageBreakdown,
} from "@/lib/kpi/types";
import type { Ckd5DetailSource } from "./sources/ckd5-contract";
import { hisCkd5DetailSource } from "./sources/ckd5-his";
import { mockCkd5DetailSource } from "./sources/ckd5-mock";
import type {
  ScreeningDetailSource,
  ScreeningPersonFilter,
  ScreeningPersonRaw,
  ScreeningVillageRaw,
} from "./sources/screening-contract";
import { hisScreeningDetailSource } from "./sources/screening-his";
import { mockScreeningDetailSource } from "./sources/screening-mock";

/**
 * Screening detail (KPI 1–9, 11): breakdown by village and the person list
 * behind it. Uses the same period / cutoff / counting window / B / A
 * definitions as `getScreeningKpi`.
 *
 * B per village: eligible × denominatorFactor. When the factor is < 1 (CX)
 * the headline B (= round(factor × total eligible)) is apportioned to the
 * villages by largest remainder, so village B values add up exactly to the
 * headline B and each is within 1 of round(factor × village eligible).
 *
 * Caching:
 *  - getScreeningVillages: aggregates only -> "use cache" (hours), shared,
 *    tagged SCREENING_CACHE_TAG like the headline.
 *  - getScreeningPersons / getScreeningExport: patient-identifiable ->
 *    NEVER cached (no "use cache"); `connection()` forces request time.
 */

function detailSource(): ScreeningDetailSource {
  return resolveDataSourceKind() === "mock"
    ? mockScreeningDetailSource
    : hisScreeningDetailSource;
}

function ckd5DetailSource(): Ckd5DetailSource {
  return resolveDataSourceKind() === "mock"
    ? mockCkd5DetailSource
    : hisCkd5DetailSource;
}

const UNKNOWN_VILLAGE_NAME = "ไม่ระบุหมู่บ้าน";

function mooSortKey(v: VillageBreakdown): number {
  if (v.villageId === 0) return Number.POSITIVE_INFINITY;
  const n = Number.parseInt(v.moo, 10);
  return Number.isFinite(n) ? n : Number.MAX_SAFE_INTEGER;
}

function compareVillages(a: VillageBreakdown, b: VillageBreakdown): number {
  const ka = mooSortKey(a);
  const kb = mooSortKey(b);
  if (ka !== kb) return ka < kb ? -1 : 1;
  return a.villageId - b.villageId;
}

function toVillageBreakdown(
  code: RatioCode,
  raw: ScreeningVillageRaw,
  denominator: number,
): VillageBreakdown {
  return {
    villageId: raw.villageId,
    moo: raw.moo ?? "-",
    villageName:
      raw.villageName ??
      (raw.villageId === 0
        ? (SCREENING_INDICATORS[code].unknownVillageName ??
          UNKNOWN_VILLAGE_NAME)
        : `หมู่บ้านรหัส ${raw.villageId}`),
    eligible: raw.eligible,
    denominator,
    numerator: raw.numerator,
    // Mortality: per-village rate is not exposed (tiny numbers).
    percent: isLowerBetter(SCREENING_INDICATORS[code].targetOperator ?? ">=")
      ? 0
      : toPercent(raw.numerator, denominator),
  };
}

/**
 * CKD5: numerator = new cases of the selected FY, previousCases = previous
 * FY; no B / percent per village (counts per village are too small).
 */
async function computeCkd5Villages(
  period: ScreeningPeriod,
): Promise<VillageBreakdown[]> {
  const raw = await ckd5DetailSource().villages(buildCkd5Query(period));
  return raw
    .map(
      (r): VillageBreakdown => ({
        villageId: r.villageId,
        moo: r.moo ?? "-",
        villageName:
          r.villageName ??
          (r.villageId === 0
            ? CKD5_INDICATOR.unknownVillageName
            : `หมู่บ้านรหัส ${r.villageId}`),
        eligible: 0,
        denominator: 0,
        numerator: r.currentCases,
        percent: 0,
        previousCases: r.previousCases,
      }),
    )
    .sort(compareVillages);
}

async function computeVillages(
  code: ScreeningCode,
  period: ScreeningPeriod,
): Promise<VillageBreakdown[]> {
  if (isReductionCode(code)) return computeCkd5Villages(period);
  const raw = await detailSource().villages(
    code,
    buildSourceQuery(code, period),
  );
  const denominators = apportionTargetShare(
    raw.map((r) => r.eligible),
    SCREENING_INDICATORS[code].denominatorFactor,
  );
  return raw
    .map((r, i) => toVillageBreakdown(code, r, denominators[i]))
    .sort(compareVillages);
}

/**
 * B / A per village, ordered by village number (unknown village last).
 * Must be called at request time (route handler / inside <Suspense>).
 * @throws RangeError for an out-of-range fiscal year.
 * @throws HisConfigError / HisQueryError.
 */
export async function getScreeningVillages(
  code: ScreeningCode,
  fiscalYear: number,
): Promise<VillageBreakdown[]> {
  await io();
  return loadVillages(code, fiscalYear);
}

async function loadVillages(
  code: ScreeningCode,
  fiscalYear: number,
): Promise<VillageBreakdown[]> {
  "use cache";
  cacheLife("hours");
  cacheTag(SCREENING_CACHE_TAG);
  // new Date() is captured with the cache entry (same as the headline).
  return computeVillages(code, resolveScreeningPeriod(fiscalYear, new Date()));
}

/* ------------------------------ persons -------------------------------- */

const thaiCollator = new Intl.Collator("th", {
  sensitivity: "base",
  numeric: true,
});

function compareStatusThenName(
  a: ScreeningPersonRaw,
  b: ScreeningPersonRaw,
): number {
  // Mortality rows carry eventDate: deaths first, then by event date.
  if (a.eventDate !== undefined || b.eventDate !== undefined) {
    return (
      (a.screenDate ? 0 : 1) - (b.screenDate ? 0 : 1) ||
      (a.eventDate ?? "").localeCompare(b.eventDate ?? "") ||
      thaiCollator.compare(a.sortName, b.sortName) ||
      a.personId - b.personId
    );
  }
  const sa = a.screenDate ? 1 : 0;
  const sb = b.screenDate ? 1 : 0;
  return (
    sa - sb ||
    thaiCollator.compare(a.sortName, b.sortName) ||
    a.personId - b.personId ||
    (a.eventDate ?? "").localeCompare(b.eventDate ?? "")
  );
}

function mapSex(sex: string | null): ScreeningPerson["sex"] {
  if (sex === "1" || sex === "ชาย") return "ชาย";
  if (sex === "2" || sex === "หญิง") return "หญิง";
  return "ไม่ระบุ";
}

/** Copies only the contract fields, so internal fields never leave the server. */
function toScreeningPerson(raw: ScreeningPersonRaw): ScreeningPerson {
  return {
    personId: raw.personId,
    hn: raw.hn,
    fullName: raw.fullName,
    sex: mapSex(raw.sex),
    age: raw.age,
    screened: raw.screenDate !== null,
    screenDate: raw.screenDate,
    ...(raw.suspectDate !== undefined ? { suspectDate: raw.suspectDate } : {}),
    ...(raw.eventDate !== undefined ? { eventDate: raw.eventDate } : {}),
  };
}

async function loadPersonsRaw(
  code: ScreeningCode,
  period: ScreeningPeriod,
  filter: ScreeningPersonFilter,
  limit: number,
): Promise<{ rows: ScreeningPersonRaw[]; truncated: boolean }> {
  const rows = isReductionCode(code)
    ? await ckd5DetailSource().persons(buildCkd5Query(period), filter, limit)
    : await detailSource().persons(
        code,
        buildSourceQuery(code, period),
        filter,
        limit,
      );
  const truncated = rows.length > limit;
  return { rows: truncated ? rows.slice(0, limit) : rows, truncated };
}

export interface ScreeningPersonsResult {
  persons: ScreeningPerson[];
  /** true when the village had more than PERSONS_PER_VILLAGE_LIMIT people. */
  truncated: boolean;
}

/**
 * Whole target group (eligible, not only B) of one village with status,
 * unscreened first, then Thai name order (without title).
 * At most PERSONS_PER_VILLAGE_LIMIT rows. Never cached.
 * @throws RangeError for an out-of-range fiscal year.
 */
export async function getScreeningPersons(
  code: ScreeningCode,
  fiscalYear: number,
  villageId: number,
): Promise<ScreeningPersonsResult> {
  await connection();
  const period = resolveScreeningPeriod(fiscalYear, new Date());
  const { rows, truncated } = await loadPersonsRaw(
    code,
    period,
    { kind: "village", villageId },
    PERSONS_PER_VILLAGE_LIMIT,
  );
  rows.sort(compareStatusThenName);
  return { persons: rows.map(toScreeningPerson), truncated };
}

/* ------------------------------ export --------------------------------- */

export interface ScreeningExportPerson extends ScreeningPerson {
  moo: string;
}

export interface ScreeningExportData {
  code: ScreeningCode;
  fiscalYear: number;
  dataAsOf: string;
  /** e.g. "สะสม ปีงบ 2568–2570". */
  periodLabel: string;
  /** "YYYY-MM-DD" first day A is counted from. */
  countFrom: string;
  note: string | undefined;
  generatedAt: string;
  villages: VillageBreakdown[];
  persons: ScreeningExportPerson[];
  truncated: boolean;
  personLimit: number;
}

/**
 * Data for the Excel export. Computed fresh (not from the shared cache) so
 * the summary sheet and the person sheet come from the same moment.
 * With villageId: only that village. Never cached.
 * @throws RangeError for an out-of-range fiscal year.
 */
export async function getScreeningExport(
  code: ScreeningCode,
  fiscalYear: number,
  villageId: number | null,
): Promise<ScreeningExportData> {
  await connection();
  const now = new Date();
  const period = resolveScreeningPeriod(fiscalYear, now);
  const filter: ScreeningPersonFilter =
    villageId === null ? { kind: "all" } : { kind: "village", villageId };
  const limit =
    villageId === null ? PERSONS_EXPORT_LIMIT : PERSONS_PER_VILLAGE_LIMIT;

  const [allVillages, { rows, truncated }] = await Promise.all([
    computeVillages(code, period),
    loadPersonsRaw(code, period, filter, limit),
  ]);

  const villages =
    villageId === null
      ? allVillages
      : allVillages.filter((v) => v.villageId === villageId);

  const villageOrder = new Map(allVillages.map((v, i) => [v.villageId, i]));
  const mooById = new Map(allVillages.map((v) => [v.villageId, v.moo]));
  const orderOf = (id: number) =>
    villageOrder.get(id) ?? Number.MAX_SAFE_INTEGER;
  rows.sort(
    (a, b) =>
      orderOf(a.villageId) - orderOf(b.villageId) ||
      compareStatusThenName(a, b),
  );

  return {
    code,
    fiscalYear: period.fy,
    dataAsOf: period.dataAsOf,
    ...(isReductionCode(code)
      ? {
          periodLabel: `ปีงบประมาณ ${period.fy} เทียบปีงบประมาณ ${period.fy - 1}`,
          countFrom: period.range.start,
          note: CKD5_INDICATOR.note,
        }
      : {
          periodLabel: screeningCountWindow(code, period.fy).periodLabel,
          countFrom: screeningCountWindow(code, period.fy).countFrom,
          note: screeningIndicatorNote(code, period.fy),
        }),
    generatedAt: now.toISOString(),
    villages,
    persons: rows.map((r) => ({
      moo: mooById.get(r.villageId) ?? "-",
      ...toScreeningPerson(r),
    })),
    truncated,
    personLimit: limit,
  };
}
