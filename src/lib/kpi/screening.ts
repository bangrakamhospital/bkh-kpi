import "server-only";

import { cacheLife, cacheTag, io } from "next/cache";

import { HisQueryError } from "@/lib/db/his";
import {
  fiscalYearOf,
  fiscalYearRange,
  todayIsoDate,
  type FiscalYearRange,
} from "@/lib/kpi/fiscal-year";
import {
  applyTargetShare,
  SCREENING_CODES,
  SCREENING_INDICATORS,
  screeningCountWindow,
  screeningIndicatorNote,
  screeningTargetPercent,
} from "@/lib/kpi/screening-indicators";
import type {
  KpiDataSource,
  ScreeningCode,
  ScreeningIndicator,
  ScreeningKpiResult,
} from "@/lib/kpi/types";
import type {
  ScreeningRawIndicator,
  ScreeningSource,
  ScreeningSourceQuery,
} from "./sources/screening-contract";
import { hisScreeningSource } from "./sources/screening-his";
import { mockScreeningSource } from "./sources/screening-mock";

/**
 * Screening KPIs (SCREENING_CODES: DM, HT, CX, BR, HDC 2.1/2.2, 11.3–11.5). Definitions:
 * docs/kpi/01-screening-dm-ht.md, 03-screening-cervical.md, 04-screening-breast.md
 */

export const SCREENING_CACHE_TAG = "kpi:screening";

/** Earliest fiscal year (BE) we accept. */
export const MIN_FISCAL_YEAR = 2560;

/**
 * Indicator metadata (name, target, ...). Kept for backward compatibility;
 * the source of truth is SCREENING_INDICATORS.
 */
export const INDICATOR_META = SCREENING_INDICATORS;

/** Generic per-indicator error text sent to the client (no technical details). */
export const INDICATOR_LOAD_ERROR = "ไม่สามารถดึงข้อมูลตัวชี้วัดนี้ได้";

/**
 * Which data source to use. Server-only env var (never NEXT_PUBLIC_).
 * Default is the real HIS DB. Mock is opt-in only (KPI_DATA_SOURCE=mock);
 * DB errors are never silently replaced by mock data.
 */
export function resolveDataSourceKind(): KpiDataSource {
  const raw = process.env.KPI_DATA_SOURCE?.trim().toLowerCase();
  if (raw === "mock") return "mock";
  if (raw === undefined || raw === "" || raw === "his") return "his";
  throw new Error("KPI_DATA_SOURCE must be \"his\" or \"mock\"");
}

function resolveSource(): { kind: KpiDataSource; source: ScreeningSource } {
  const kind = resolveDataSourceKind();
  return {
    kind,
    source: kind === "mock" ? mockScreeningSource : hisScreeningSource,
  };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export interface ScreeningPeriod {
  /** Fiscal year (BE). */
  fy: number;
  range: FiscalYearRange;
  /** "YYYY-MM-DD" data cutoff: today for the current FY, else 30 Sep. */
  dataAsOf: string;
  /** "YYYY-MM" months Oct -> month of dataAsOf. */
  months: string[];
}

/** Current fiscal year (BE) in Asia/Bangkok. */
export function currentFiscalYear(now: Date): number {
  return fiscalYearOf(todayIsoDate(now));
}

/**
 * Validates the fiscal year and derives the reporting period. Shared by the
 * headline KPI and the village / person detail so all use the same cutoff.
 * @throws RangeError when fiscalYear is not an integer in [2560, current FY].
 */
export function resolveScreeningPeriod(
  fiscalYear: number | undefined,
  now: Date,
): ScreeningPeriod {
  const today = todayIsoDate(now);
  const currentFy = fiscalYearOf(today);
  const fy = fiscalYear ?? currentFy;

  if (!Number.isInteger(fy) || fy < MIN_FISCAL_YEAR || fy > currentFy) {
    throw new RangeError(
      `fiscalYear must be an integer BE year between ${MIN_FISCAL_YEAR} and ${currentFy}`,
    );
  }

  const range = fiscalYearRange(fy);
  const dataAsOf = fy === currentFy ? today : range.end;
  const asOfMonth = dataAsOf.slice(0, 7);
  const months = range.months.filter((m) => m <= asOfMonth);
  return { fy, range, dataAsOf, months };
}

/** Source query for one indicator (the counting window depends on the indicator). */
export function buildSourceQuery(
  code: ScreeningCode,
  period: ScreeningPeriod,
): ScreeningSourceQuery {
  return {
    fiscalYear: period.fy,
    periodStart: period.range.start,
    countFrom: screeningCountWindow(code, period.fy).countFrom,
    dataAsOf: period.dataAsOf,
    months: period.months,
  };
}

export function toPercent(numerator: number, denominator: number): number {
  return denominator > 0 ? round2((numerator / denominator) * 100) : 0;
}

/** Fields that depend only on the indicator and the fiscal year. */
function describeIndicator(code: ScreeningCode, fy: number) {
  const meta = SCREENING_INDICATORS[code];
  const window = screeningCountWindow(code, fy);
  const note = screeningIndicatorNote(code, fy);
  return {
    code,
    name: meta.name,
    targetPercent: screeningTargetPercent(code, fy),
    targetOperator: meta.targetOperator ?? ">=",
    ageRange: meta.ageRange,
    population: meta.population,
    periodLabel: window.periodLabel,
    ...(note ? { note } : {}),
    denominatorFactor: meta.denominatorFactor,
    countFrom: window.countFrom,
  };
}

function deriveIndicator(
  raw: ScreeningRawIndicator,
  fy: number,
): ScreeningIndicator {
  const meta = SCREENING_INDICATORS[raw.code];
  const denominator = applyTargetShare(raw.eligible, meta.denominatorFactor);
  let cumulative = raw.priorScreened;
  const monthly = raw.monthlyScreened.map(({ month, screened }) => {
    cumulative += screened;
    return {
      month,
      screened,
      cumulativePercent: toPercent(cumulative, denominator),
    };
  });
  return {
    ...describeIndicator(raw.code, fy),
    denominator,
    numerator: cumulative,
    percent: toPercent(cumulative, denominator),
    monthly,
    eligible: raw.eligible,
    priorNumerator: raw.priorScreened,
  };
}

function failedIndicator(code: ScreeningCode, fy: number): ScreeningIndicator {
  return {
    ...describeIndicator(code, fy),
    denominator: 0,
    numerator: 0,
    percent: 0,
    monthly: [],
    eligible: 0,
    priorNumerator: 0,
    error: INDICATOR_LOAD_ERROR,
  };
}

/** Logs class + driver code only (no SQL, parameters, credentials, patient data). */
function logIndicatorError(code: ScreeningCode, err: unknown): void {
  const name = err instanceof Error ? err.name : "UnknownError";
  const driverCode = err instanceof HisQueryError ? (err.code ?? "") : "";
  console.error(
    `[kpi/screening] indicator ${code} failed: ${name}${driverCode ? ` (${driverCode})` : ""}`,
  );
}

/**
 * Returns the screening KPIs (SCREENING_CODES order) for a fiscal
 * year (BE). Defaults to the current fiscal year (Asia/Bangkok).
 *
 * Rendering contract (Cache Components):
 *  - `await io()` runs first, OUTSIDE the cache, so the HIS database is never
 *    queried during prerender / `next build` (build succeeds even when the
 *    build machine cannot reach HIS). Callers must therefore render inside a
 *    `<Suspense>` boundary.
 *  - The actual work is in a `"use cache"` scope shared by all users.
 *    cacheLife "hours" when every indicator loaded; "minutes" when some
 *    failed, so a partial result is retried soon. Invalidate with
 *    `revalidateTag(SCREENING_CACHE_TAG)`.
 *
 * Errors:
 *  - Each indicator is loaded independently. If one fails it is returned
 *    with `error` set and zero counts; the others are unaffected.
 *  - If ALL indicators fail (e.g. HIS unreachable / misconfigured) the
 *    first error is thrown (not cached) so the page shows its error state.
 *  - Invalid year / KPI_DATA_SOURCE: thrown. Never replaced by mock data.
 *
 * @throws RangeError when fiscalYear is not an integer in [2560, current FY].
 * @throws HisConfigError / HisQueryError when every indicator failed.
 */
export async function getScreeningKpi(
  fiscalYear?: number,
): Promise<ScreeningKpiResult> {
  await io();
  return loadScreeningKpi(fiscalYear);
}

async function loadScreeningKpi(
  fiscalYear: number | undefined,
): Promise<ScreeningKpiResult> {
  "use cache";
  cacheTag(SCREENING_CACHE_TAG);

  // new Date() is allowed here: inside "use cache" the value is captured
  // with the cache entry and refreshed on revalidation.
  const now = new Date();
  const period = resolveScreeningPeriod(fiscalYear, now);
  const { kind, source } = resolveSource();

  const settled = await Promise.allSettled(
    SCREENING_CODES.map((code) => source(code, buildSourceQuery(code, period))),
  );

  const failureCount = settled.filter((s) => s.status === "rejected").length;
  if (failureCount === settled.length) {
    const first = settled[0];
    throw first.status === "rejected" ? first.reason : new Error("unreachable");
  }

  const indicators = settled.map((s, i): ScreeningIndicator => {
    const code = SCREENING_CODES[i];
    if (s.status === "fulfilled") return deriveIndicator(s.value, period.fy);
    logIndicatorError(code, s.reason);
    return failedIndicator(code, period.fy);
  });

  // Exactly one cacheLife call per invocation (see cacheLife docs).
  if (failureCount > 0) {
    cacheLife("minutes");
  } else {
    cacheLife("hours");
  }

  return {
    fiscalYear: period.fy,
    periodStart: period.range.start,
    periodEnd: period.range.end,
    dataAsOf: period.dataAsOf,
    updatedAt: now.toISOString(),
    source: kind,
    indicators,
  };
}
