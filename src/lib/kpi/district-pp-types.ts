/**
 * District PP revenue (/district/pp) — PPFS + P&P Basic Services for the
 * whole อ.บางระกำ from the HDC 43-file database ONLY (never HOSxP; see
 * src/lib/kpi/district-areas.ts). Same NHSO rates as the hospital PP
 * pages (src/lib/kpi/ppfs-rates.ts, src/lib/kpi/ppbasic-rates.ts).
 *
 * The server returns aggregates per VILLAGE UNIT (หมู่ × responsible unit)
 * × item once per fiscal year; the client filters รพ.สต. → ตำบล → หมู่ and
 * sums. No person rows. Rules and FY2569 figures: docs/kpi/district-pp.md.
 *
 * Attribution: a person counts in the village of their HOME address and
 * under the unit responsible for them (PERSON TYPEAREA 1/3 of that
 * hospcode). Revenue = done units × rate, attributed to that unit
 * (an estimate — NHSO pays the unit that served and claimed).
 */

export type DistrictPpPage = "ppfs" | "basic";

/** "nhso" = real NHSO rate; "reference" = hospital-set value (not NHSO money); "unset" = no baht. */
export type DistrictPpRateBasis = "nhso" | "reference" | "unset";

export interface DistrictPpItemDef {
  /** Same codes as the hospital pages (PpfsRateCode / PpBasicCode). */
  code: string;
  page: DistrictPpPage;
  /** Display order within its page. */
  order: number;
  name: string;
  /** Thai group, e.g. "มะเร็ง", "เด็กเล็กอายุ 0-5 ปี". */
  group: string;
  /** Thai definition of target / done as counted in HDC. */
  condition: string;
  /** Thai unit of target/done, e.g. "คน", "เข็ม", "ครั้ง". */
  unit: string;
  basis: DistrictPpRateBasis;
  /** Baht per unit; null when unset. */
  rate: number | null;
  /** e.g. "ต่อคน". */
  rateUnit: string;
  /** Short Thai note on proxies / HDC data limits; null when none. */
  caveat: string | null;
  /** Set when this item's query failed (no cells for it). */
  error?: string;
}

/**
 * One village unit = (village, responsible unit). Most villages have one
 * unit; 650404 หมู่ 01, 06, 09, 10, 11 are served by both 07529 and 11803
 * and appear twice (one entry per unit). A รพ.สต. filter therefore picks
 * exact entries; a ตำบล / หมู่ filter sums every unit of the village.
 */
export interface DistrictPpVillage {
  /** Unique id `${vid}:${hospcode}`; DistrictPpCell.key refers to it. */
  key: string;
  /** HDC village id (VID, 8 digits: changwat+amphur+tambon+moo). */
  vid: string;
  /** 6-digit tambon code, e.g. "650402". */
  tambon: string;
  tambonName: string;
  /** 5-digit responsible hospcode (normalised, no GA00 prefix). */
  hospcode: string;
  hospName: string;
  /** หมู่ number as text, e.g. "3". */
  moo: string;
  villageName: string | null;
}

/** Aggregate of one item in one village unit. Missing cell = 0/0. */
export interface DistrictPpCell {
  /** DistrictPpVillage.key. */
  key: string;
  code: string;
  target: number;
  done: number;
}

/** See DistrictPpSummary.unitExtras. */
export interface DistrictPpUnitExtra {
  /** 5-digit giving unit. */
  hospcode: string;
  /** Item code (currently only "EPI"). */
  code: string;
  done: number;
}

/** See DistrictPpSummary.unitDataAsOf. */
export interface DistrictPpUnitDataAsOf {
  hospcode: string;
  hospName: string;
  /** 'YYYY-MM-DD' last service date in the period; null = none sent yet. */
  lastDate: string | null;
}

export interface DistrictPpSummary {
  fiscalYear: number;
  periodStart: string;
  periodEnd: string;
  /** Inclusive end of counted data (periodEnd when closed, else today). */
  dataAsOf: string;
  closed: boolean;
  items: DistrictPpItemDef[];
  villages: DistrictPpVillage[];
  cells: DistrictPpCell[];
  /**
   * Work with no village: EPI doses given by a district unit to UC
   * children who are NOT residents of a district village (out of district,
   * TYPEAREA 4, no valid HOME), per giving unit. Counted as done AND
   * target (never a gap), only when no ตำบล / หมู่ filter is active (whole
   * district or one unit). FY2569: 1,706 doses.
   */
  unitExtras: DistrictPpUnitExtra[];
  /**
   * Data completeness: last SERVICE date in HDC of every district unit in
   * [periodStart, dataAsOf]. null when that query failed.
   */
  unitDataAsOf: DistrictPpUnitDataAsOf[] | null;
  /** ISO timestamp the figures were computed. */
  updatedAt: string;
}
