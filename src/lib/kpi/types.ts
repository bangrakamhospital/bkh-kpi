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
 * STEMI = KPI 11 STEMI mortality (hospital level, A = deaths, B = STEMI
 * episodes, LOWER is better, target < 9%).
 * Display order: SCREENING_CODES in `@/lib/kpi/screening-indicators`.
 */
export type RatioCode =
  | "DM"
  | "HT"
  | "CX"
  | "BR"
  | "RLU_HBA1C"
  | "RLU_LDL"
  | "RLU_CR"
  | "DMC"
  | "HTC"
  | "STEMI";

/**
 * CKD5 = KPI 10: % reduction of new CKD stage 5 patients vs the previous
 * fiscal year (lower is better, no A/B population). See ReductionIndicator.
 */
export type ReductionCode = "CKD5";

/** Every indicator code (home table rows, department filter, detail APIs). */
export type ScreeningCode = RatioCode | ReductionCode;

/** ">=" / ">" = higher is better; "<" / "<=" = lower is better (STEMI). */
export type TargetOperator = ">=" | ">" | "<" | "<=";

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
   * STEMI only: B (episodes) starting in this month; absent for the other
   * indicators.
   */
  eligible?: number;
  /**
   * (priorNumerator + screened from Oct through this month) / B * 100
   * (2 decimals). For fiscal-year indicators priorNumerator is 0.
   */
  cumulativePercent: number;
}

export interface ScreeningIndicator {
  code: RatioCode;
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
  /** Indicators of the "reduction" kind (KPI 10 CKD5); a failed one carries `error`. */
  reduction: ReductionIndicator[];
}

export interface ReductionMonthly {
  /** Calendar month "YYYY-MM" of the selected fiscal year. */
  month: string;
  /** New cases in this month of the selected fiscal year. */
  currentCases: number;
  /** New cases in the same fiscal month of the previous fiscal year. */
  previousCases: number;
}

/**
 * "Lower is better" indicator: reduction% = (B - A) / B x 100 with A = new
 * cases this fiscal year, B = new cases in the whole previous fiscal year.
 */
export interface ReductionIndicator {
  code: ReductionCode;
  /** KPI number on the dashboard (10). */
  no: number;
  name: string;
  /** A: new cases in the selected fiscal year (up to dataAsOf). */
  currentCases: number;
  /** B: new cases in the whole previous fiscal year. */
  previousCases: number;
  /** New cases of the previous fiscal year up to the same day (year-to-date comparison). */
  previousSamePeriod: number;
  /** (B - A) / B x 100 (2 decimals); null when B is 0. Negative = increased. */
  reductionPercent: number | null;
  targetPercent: number;
  targetOperator: TargetOperator;
  /** Ordered by fiscal year (Oct -> Sep), only months up to dataAsOf. */
  monthly: ReductionMonthly[];
  periodLabel: string;
  population: string;
  note?: string;
  /** Set only when this indicator could not be loaded (generic Thai message). */
  error?: string;
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
  /**
   * CKD5 only: new cases of the previous fiscal year in this village.
   * Then numerator = new cases of the selected fiscal year; eligible,
   * denominator and percent are 0 (no percentage per village).
   */
  previousCases?: number;
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
  /**
   * STEMI only: "YYYY-MM-DD" the episode started (screenDate is then the
   * death date at this hospital, null = survived). One row per episode: the
   * same hn may appear more than once.
   */
  eventDate?: string | null;
}

/* ---------------- district level (อ.บางระกำ, aggregates only) ---------------- */

/**
 * Ratio indicators of the district page (HDC only, per sub-district):
 * DM / HT = KPI 1–2, CX / BR = KPI 3–4, DMC / HTC = HDC 2.1 / 2.2,
 * RLU_* = HDC 11.3–11.5. CKD5 / STEMI have their own result shapes
 * (DistrictCkd5Result / DistrictStemiResult), see DistrictKpiCode.
 */
export type DistrictCode =
  | "DM"
  | "HT"
  | "CX"
  | "BR"
  | "DMC"
  | "HTC"
  | "RLU_HBA1C"
  | "RLU_LDL"
  | "RLU_CR";

/** Raw counts + derived B / percent of one area (same maths as the headline). */
export interface AreaCounts {
  /** People in the target group. */
  eligible: number;
  /** B (= eligible for DM / HT). */
  denominator: number;
  /** A: screened in the fiscal year up to the data cutoff. */
  numerator: number;
  /** A / B * 100 (2 decimals); 0 when B is 0. */
  percent: number;
}

export interface DistrictVillageRow extends AreaCounts {
  /** Stable key: 8-digit HDC village code (vid), e.g. "65040203". */
  key: string;
  /** Village number as text ("3"); "-" when unknown. */
  moo: string;
  /** Always null: the 43 files have no village names -> show "หมู่ {moo}". */
  villageName: string | null;
}

/** Last data received from one health unit (HDC lag differs per unit). */
export interface DistrictUnitStatus {
  hospcode: string;
  name: string;
  /** "YYYY-MM-DD" latest SERVICE date sent (<= dataAsOf); null = none. */
  lastServiceDate: string | null;
  /** "YYYY-MM-DD" latest NCDSCREEN date sent; null = none. */
  lastScreenDate: string | null;
}

export interface DistrictTambonRow extends AreaCounts {
  /** 6-digit sub-district code, e.g. "650402". */
  tambonCode: string;
  tambonName: string;
  /**
   * "YYYY-MM-DD" data is complete up to (at least) this day: the OLDEST
   * lastServiceDate among the sub-district's units (null when no unit has
   * sent data).
   */
  dataAsOf: string | null;
  units: DistrictUnitStatus[];
  /** Ordered by village number (unknown last). */
  villages: DistrictVillageRow[];
  /** Set when loading failed (generic Thai text); counts are then 0. */
  error?: string;
}

/**
 * GET /api/kpi/district/screening?code=<DistrictCode>&fy=<BE>
 * Source: district HDC database only (all 11 sub-districts). District
 * total = sum of the raw counts of the sub-districts, percent computed
 * once from the sums. May differ from the hospital (HOSxP) page.
 */
export interface DistrictScreeningResult {
  kind: "ratio";
  code: DistrictCode;
  /** Thai indicator name (SCREENING_INDICATORS[code].name). */
  name: string;
  /** Short Thai name for buttons / headings (SCREENING_INDICATORS[code].shortName). */
  shortName: string;
  /** Target group as display text (district definition, see note). */
  population: string;
  /** District-level remarks (definition differences between sources). */
  note?: string;
  targetPercent: number;
  targetOperator: TargetOperator;
  fiscalYear: number;
  periodStart: string;
  periodEnd: string;
  /** "YYYY-MM-DD" KPI cutoff (today for the current FY, else 30 Sep). */
  dataAsOf: string;
  /** ISO timestamp of this response. */
  updatedAt: string;
  district: AreaCounts & {
    code: string;
    name: string;
    /** Always true (HDC is the only source; a load failure is an HTTP 500). Kept for compatibility. */
    complete: boolean;
  };
  /** Always 11 rows in sub-district code order (650401 first). */
  tambons: DistrictTambonRow[];
}

/** Every indicator of the district page (ratio + CKD5 + STEMI). */
export type DistrictKpiCode = DistrictCode | "CKD5" | "STEMI";

/** Fields shared by every district result. */
interface DistrictResultBase {
  name: string;
  shortName: string;
  population: string;
  note: string;
  targetPercent: number;
  targetOperator: TargetOperator;
  fiscalYear: number;
  periodStart: string;
  periodEnd: string;
  dataAsOf: string;
  updatedAt: string;
}

export interface DistrictCkd5Village {
  /** 8-digit HDC vid. */
  key: string;
  moo: string;
  /** New cases in the selected fiscal year. */
  currentCases: number;
  /** New cases in the whole previous fiscal year. */
  previousCases: number;
}

export interface DistrictCkd5TambonRow {
  tambonCode: string;
  tambonName: string;
  currentCases: number;
  previousCases: number;
  previousSamePeriod: number;
  dataAsOf: string | null;
  units: DistrictUnitStatus[];
  /** Only villages with at least one case. */
  villages: DistrictCkd5Village[];
}

/**
 * KPI 10 CKD5 (lower is better): reduction% = (B − A) / B × 100 with
 * A = new cases this FY, B = new cases of the previous FY.
 * When previousYearComparable is false (FY 2569: HDC has no FY 2568
 * diagnoses) previous counts are 0 and reductionPercent is null — show
 * "ข้อมูลปีก่อนไม่พอ" instead of a number.
 */
export interface DistrictCkd5Result extends DistrictResultBase {
  kind: "reduction";
  code: "CKD5";
  previousYearComparable: boolean;
  district: {
    code: string;
    name: string;
    currentCases: number;
    previousCases: number;
    previousSamePeriod: number;
    /** null when previous FY is 0 or not comparable. Negative = increased. */
    reductionPercent: number | null;
  };
  tambons: DistrictCkd5TambonRow[];
}

/**
 * KPI 11 STEMI mortality (lower is better), district total only — small
 * numbers, the API requires login (401 otherwise).
 */
export interface DistrictStemiResult extends DistrictResultBase {
  kind: "mortality";
  code: "STEMI";
  district: {
    code: string;
    name: string;
    /** B: STEMI episodes. */
    episodes: number;
    /** A: deaths at a district unit within 28 days. */
    deaths: number;
    /** A / B × 100 (2 decimals); 0 when B is 0. */
    percent: number;
  };
}

/** GET /api/kpi/district/screening response, discriminated by `kind`. */
export type DistrictKpiResult =
  | DistrictScreeningResult
  | DistrictCkd5Result
  | DistrictStemiResult;

/* ---------------- district person list (HDC, login required) ---------------- */

/**
 * One person of a district indicator's target group (HDC 43 files).
 * Patient-identifiable: only returned by GET /api/kpi/district/persons
 * (login required, `Cache-Control: private, no-store`) and the district
 * Excel export. Never embed in pages, shared caches, or logs.
 * Deliberately excludes CID (hashed or not), pid, phone, address.
 * Ratio codes only (DistrictCode) — no person list for CKD5 / STEMI.
 */
export interface DistrictPerson {
  /** Opaque row key, stable within one response (React key); not an identifier. */
  key: string;
  /** prename + name + lname as in HDC PERSON. */
  fullName: string;
  sex: "ชาย" | "หญิง" | "ไม่ระบุ";
  /** Age in full years on 1 Oct of the fiscal year. */
  age: number;
  /** 8-digit village code (changwat+ampur+tambon+moo). */
  vid: string;
  /** Village number as text ("1".."27"). */
  moo: string;
  /** Name of the responsible unit (hospcode of the chosen PERSON record). */
  unitName: string;
  /** true when counted in A. */
  screened: boolean;
  /** "YYYY-MM-DD" of the first valid service counted in A; null if not. */
  screenDate: string | null;
  /** Name of the unit that provided that service; null if not screened. */
  screenUnitName: string | null;
  /** DMC / HTC only: "YYYY-MM-DD" of the first suspect screening. */
  suspectDate?: string | null;
}

/** GET /api/kpi/district/persons response. */
export interface DistrictPersonsResponse {
  code: DistrictCode;
  fiscalYear: number;
  /** Filter echoed back: one village (vid) or one tambon (6 digits). */
  scope: { kind: "village"; vid: string } | { kind: "tambon"; tambonCode: string };
  /** HDC data cutoff of this tambon (oldest unit's last service date). */
  dataAsOf: string | null;
  persons: DistrictPerson[];
  /** true when more rows exist than the server limit returned. */
  truncated: boolean;
}
