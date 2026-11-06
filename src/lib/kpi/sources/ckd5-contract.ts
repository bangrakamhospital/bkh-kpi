import "server-only";

import type {
  ScreeningPersonFilter,
  ScreeningPersonRaw,
} from "./screening-contract";

/**
 * Contract of the CKD5 (KPI 10) data sources (mock, HIS). Raw counts only;
 * the reduction percent is derived centrally in `@/lib/kpi/screening`.
 */
export interface Ckd5SourceQuery {
  /** "YYYY-MM-DD" 1 Oct of the selected fiscal year. */
  periodStart: string;
  /** "YYYY-MM-DD" inclusive data cutoff (<= fiscal year end). */
  dataAsOf: string;
  /** "YYYY-MM" months of the selected fiscal year, Oct -> month of dataAsOf. */
  months: string[];
}

export interface Ckd5Raw {
  /** A: new cases of the selected fiscal year. */
  currentCases: number;
  /** B: new cases of the whole previous fiscal year. */
  previousCases: number;
  /** New cases of the previous fiscal year up to the same day last year. */
  previousSamePeriod: number;
  /** One entry per query month (0 allowed). */
  monthly: { month: string; currentCases: number; previousCases: number }[];
}

export type Ckd5Source = (q: Ckd5SourceQuery) => Promise<Ckd5Raw>;

export interface Ckd5VillageRaw {
  /** person.village_id; 0 = outside the catchment / unknown. */
  villageId: number;
  moo: string | null;
  villageName: string | null;
  currentCases: number;
  previousCases: number;
}

export interface Ckd5DetailSource {
  villages(q: Ckd5SourceQuery): Promise<Ckd5VillageRaw[]>;
  /**
   * New cases of the selected fiscal year. May return at most `limit + 1`
   * rows so the caller can detect truncation. `screenDate` = date the
   * patient became a new stage 5 case.
   */
  persons(
    q: Ckd5SourceQuery,
    filter: ScreeningPersonFilter,
    limit: number,
  ): Promise<ScreeningPersonRaw[]>;
}
