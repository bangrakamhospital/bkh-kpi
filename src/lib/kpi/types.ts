/**
 * Shared KPI types. Safe to import from both server and client code
 * (type-only). All types are aggregates except `ScreeningPerson`, which is
 * patient-identifiable and only used by the persons API / Excel export.
 */

/**
 * DM / HT = KPI 1–2 (age >= 35), CX = KPI 3 cervical cancer screening
 * (Thai women 30–60, cumulative over a 5-year phase), BR = KPI 4 clinical
 * breast examination (women 40–70, per fiscal year).
 * RLU_* = HDC 11.3 / 11.4 / 11.5 (hospital level): % of diabetes clinic
 * patients with >= 1 HbA1c / LDL / creatinine result per fiscal year.
 * DMC / HTC = HDC 2.1 / 2.2: % of suspected DM / HT (from screening) with a
 * confirmation test after the suspect screening.
 * Display order: SCREENING_CODES in `@/lib/kpi/screening-indicators`.
 */
export type ScreeningCode =
  | "DM"
  | "HT"
  | "CX"
  | "BR"
  | "RLU_HBA1C"
  | "RLU_LDL"
  | "RLU_CR"
  | "DMC"
  | "HTC";

export type TargetOperator = ">=" | ">";

export type KpiDataSource = "mock" | "his";

export interface ScreeningMonthly {
  /** Calendar month in Gregorian "YYYY-MM" (e.g. "2026-10"). */
  month: string;
  /**
   * Number of people (A) first screened in this month (first screening
   * within the counting window, see ScreeningIndicator.countFrom).
   */
  screened: number;
  /**
   * (priorNumerator + screened from Oct through this month) / B * 100
   * (2 decimals). For fiscal-year indicators priorNumerator is 0.
   */
  cumulativePercent: number;
}

export interface ScreeningIndicator {
  code: ScreeningCode;
  /** Thai display name of the indicator. */
  name: string;
  /** Target in percent for the selected fiscal year (e.g. 90 means >= 90%). */
  targetPercent: number;
  /** ">=" or ">" (strictly above targetPercent, HDC RLU). */
  targetOperator: TargetOperator;
  /**
   * B: target. Equals `eligible` except when denominatorFactor < 1
   * (CX: B = round(0.7 × eligible), the 5-year phase target).
   */
  denominator: number;
  /** A: people screened within the counting window (countFrom .. dataAsOf). */
  numerator: number;
  /**
   * A / B * 100 (2 decimals). 0 when denominator is 0. May exceed 100 when
   * denominatorFactor < 1 (A is counted among `eligible`, not only B).
   */
  percent: number;
  /** Ordered by fiscal year (Oct -> Sep), only months up to dataAsOf. */
  monthly: ScreeningMonthly[];

  /**
   * Target age range as display text, e.g. "35 ปีขึ้นไป", "30–60 ปี".
   * Age is always taken on 1 Oct of the selected fiscal year.
   */
  ageRange: string;
  /** Target population as display text, e.g. "ประชาชน", "หญิงไทย", "หญิง". */
  population: string;
  /** Counting period as display text, e.g. "ปีงบประมาณ 2570" or "สะสม ปีงบ 2568–2570". */
  periodLabel: string;
  /** Extra remarks for display (target definition, unconfirmed criteria, ...). */
  note?: string;
  /** People in the target group (before applying denominatorFactor). */
  eligible: number;
  /** B = round(eligible × denominatorFactor). 1 except CX (0.7). */
  denominatorFactor: number;
  /** ISO "YYYY-MM-DD": first day A is counted from (fiscal year start, or phase start for CX). */
  countFrom: string;
  /**
   * Part of A first screened before the selected fiscal year (earlier years
   * of the phase). Always 0 for fiscal-year indicators.
   * numerator = priorNumerator + sum(monthly[].screened).
   */
  priorNumerator: number;
  /**
   * Set only when this indicator could not be loaded (generic Thai message,
   * no technical details). Then all counts are 0 and `monthly` is empty;
   * the other indicators are still valid.
   */
  error?: string;
}

export interface ScreeningKpiResult {
  /** Fiscal year in Buddhist Era (e.g. 2570 = 2026-10-01 .. 2027-09-30). */
  fiscalYear: number;
  /** ISO date "YYYY-MM-DD" — fiscal year start (1 Oct). */
  periodStart: string;
  /** ISO date "YYYY-MM-DD" — fiscal year end (30 Sep). */
  periodEnd: string;
  /**
   * ISO date "YYYY-MM-DD" — last day covered by the data.
   * Equals periodEnd for past fiscal years, or today (Asia/Bangkok) for the current one.
   */
  dataAsOf: string;
  /** ISO timestamp when this result was generated (cache fill time). */
  updatedAt: string;
  source: KpiDataSource;
  /** One per SCREENING_CODES entry, in that order (failed ones carry `error`). */
  indicators: ScreeningIndicator[];
}

/**
 * Screening breakdown by village (aggregates only).
 * Sums of eligible / denominator / numerator over all rows equal the
 * indicator totals for the same fiscal year (same data snapshot).
 * For CX the village B values are the headline B apportioned by largest
 * remainder, so each is within 1 of round(0.7 × village eligible).
 */
export interface VillageBreakdown {
  /**
   * HOSxP village id (person.village_id). 0 = people without a valid village
   * ("ไม่ระบุหมู่บ้าน"); this row exists only so totals still add up, and
   * cannot be used with the persons endpoint (village must be > 0).
   */
  villageId: number;
  /** Village number as text, e.g. "3". "-" when unknown. */
  moo: string;
  villageName: string;
  /** People of the target group in this village (before denominatorFactor). */
  eligible: number;
  /** B in this village. */
  denominator: number;
  /** A in this village. */
  numerator: number;
  /** A / B * 100 (2 decimals). 0 when denominator is 0. */
  percent: number;
}

/**
 * One person of the target group (eligible population) of a village.
 * For CX this is every eligible woman, not 70% of them.
 *
 * !!! Contains patient-identifiable data (HN, name). !!!
 * Only returned by the persons API (`Cache-Control: private, no-store`) and
 * the Excel export. Never embed in pages, shared caches, or logs.
 * Deliberately excludes CID, phone, detailed address, lab / BP values.
 */
export interface ScreeningPerson {
  personId: number;
  hn: string | null;
  fullName: string;
  sex: "ชาย" | "หญิง" | "ไม่ระบุ";
  /** Age in full years on 1 Oct of the fiscal year (the KPI's age reference date). */
  age: number;
  /** true when the person is counted in A. */
  screened: boolean;
  /**
   * "YYYY-MM-DD" (Gregorian) of the first valid screening in the counting
   * window (the whole phase so far for CX), null if not screened.
   */
  screenDate: string | null;
  /**
   * HDC 2.1 / 2.2 only: "YYYY-MM-DD" of the first suspect screening (screenDate
   * is then the confirmation date). Absent for the other indicators.
   */
  suspectDate?: string | null;
}
