import "server-only";

import type { RatioCode } from "@/lib/kpi/types";

/**
 * Contract every screening data source (mock, HIS) must implement.
 * Sources return raw counts only; B (target share), percentages and
 * cumulative values are derived centrally in `@/lib/kpi/screening` /
 * `@/lib/kpi/screening-detail` so all sources are computed the same way.
 */
export interface ScreeningSourceQuery {
  /** Fiscal year in BE. */
  fiscalYear: number;
  /** "YYYY-MM-DD" fiscal year start (1 Oct) — also the age reference date. */
  periodStart: string;
  /**
   * "YYYY-MM-DD" inclusive start of the counting window for A.
   * = periodStart for fiscal-year indicators, phase start for CX.
   */
  countFrom: string;
  /** "YYYY-MM-DD" inclusive — data cutoff (<= fiscal year end). */
  dataAsOf: string;
  /** "YYYY-MM" months to report, ordered Oct -> Sep, ending at dataAsOf's month. */
  months: string[];
}

export interface ScreeningRawIndicator {
  code: RatioCode;
  /** Target group size (before any target share). */
  eligible: number;
  /**
   * People of the target group whose first screening in the window falls
   * before periodStart (earlier fiscal years of the phase). 0 when
   * countFrom == periodStart.
   */
  priorScreened: number;
  /** A broken down by month of first screening; one entry per query month (0 allowed). */
  monthlyScreened: { month: string; screened: number }[];
}

/** Loads one indicator. Rejects on any error (handled per indicator by the caller). */
export type ScreeningSource = (
  code: RatioCode,
  query: ScreeningSourceQuery,
) => Promise<ScreeningRawIndicator>;

/* --------------- detail: village breakdown + person list ----------------- */

/** Eligible / A for one village. B and percent are derived centrally. */
export interface ScreeningVillageRaw {
  /** person.village_id; 0 = no / unknown village. */
  villageId: number;
  /** Village number as text; null when unknown. */
  moo: string | null;
  villageName: string | null;
  /** Target group size in this village (before any target share). */
  eligible: number;
  /** People of the target group screened in the counting window. */
  numerator: number;
}

/**
 * One person of the target group. Patient-identifiable — server-side only
 * until it is mapped to `ScreeningPerson` in a no-store response / Excel file.
 */
export interface ScreeningPersonRaw {
  personId: number;
  /** 0 = no / unknown village. */
  villageId: number;
  hn: string | null;
  /** Display name incl. title (pname + fname + lname). */
  fullName: string;
  /** fname + lname without title — used only for sorting. */
  sortName: string;
  /** Raw HOSxP sex code ("1" male, "2" female) or already-mapped label. */
  sex: string | null;
  age: number;
  /** "YYYY-MM-DD" of first valid screening in the counting window; null if not screened. */
  screenDate: string | null;
  /** HDC 2.1 / 2.2 only: "YYYY-MM-DD" of the first suspect screening. */
  suspectDate?: string | null;
}

export type ScreeningPersonFilter =
  | { kind: "village"; villageId: number }
  | { kind: "all" };

export interface ScreeningDetailSource {
  /** One row per village that has at least one person in the target group. */
  villages(
    code: RatioCode,
    query: ScreeningSourceQuery,
  ): Promise<ScreeningVillageRaw[]>;
  /**
   * People of the target group. May return at most `limit + 1` rows so the
   * caller can detect truncation; order is not significant (sorted centrally).
   */
  persons(
    code: RatioCode,
    query: ScreeningSourceQuery,
    filter: ScreeningPersonFilter,
    limit: number,
  ): Promise<ScreeningPersonRaw[]>;
}
