/**
 * Contract for the "ผู้รับบริการ" (hospital service overview) tab at "/".
 * Data layer: src/lib/kpi/overview.ts (getServiceOverview) — HOSxP only.
 * UI: src/components/kpi/overview/*.
 *
 * Dates are ISO "YYYY-MM-DD" (Gregorian, Asia/Bangkok). `from`..`to` inclusive.
 * `prev*` values are for the previous period of the same length
 * (e.g. range = today → prev = yesterday).
 */

export type OverviewPreset = "today" | "yesterday" | "7d" | "month" | "fiscal" | "custom";

export interface OverviewRange {
  preset: OverviewPreset;
  from: string;
  to: string;
  prevFrom: string;
  prevTo: string;
}

export interface CountWithPrev {
  value: number;
  prev: number;
}

export interface OverviewCards {
  /** distinct patients (hn) with an OPD visit in range — unit คน */
  patients: CountWithPrev;
  /** OPD visits (vn) in range — unit ครั้ง */
  opdVisits: CountWithPrev;
  /** ER visits in range — unit ครั้ง */
  er: CountWithPrev;
  /** new admissions (regdate in range) — unit คน */
  admitNew: CountWithPrev;
  /** current inpatients right now (not discharged), excluding home ward */
  inpatientNow: number;
  /** total beds of the wards counted in inpatientNow */
  bedTotal: number;
  /** current home-ward patients (not counted in occupancy) */
  homeWardNow: number;
}

export interface HourlyVisit {
  hour: number; // 0-23
  visits: number;
}

export interface WardOccupancy {
  ward: string; // ward code
  name: string;
  patients: number;
  beds: number; // 0 if unknown
}

export interface NamedCount {
  code: string;
  name: string; // display label, e.g. "062-จุดซักประวัติ..." or "สิทธิ UC"
  visits: number;
}

export interface AgeSexBand {
  band: string; // "0-4", "5-14", "15-24", "25-34", "35-44", "45-54", "55-64", "65-74", "75+"
  male: number;
  female: number;
}

export interface DiseaseGroupCount {
  /** MOPH group number as text: "1".."21" (รง.504) or "1".."75" (รง.505) */
  code: string;
  /** Thai group name */
  name: string;
  /** ICD-10 ranges of the group, e.g. "J00-J99" or "O00-O79, O85-O99" */
  icd: string;
  /** OPD: visits (ครั้ง); IPD: discharged admissions (ครั้ง) */
  count: number;
}

export interface DiseaseGroupRanking {
  /** every group with count > 0, sorted by count desc (UI shows top 10) */
  groups: DiseaseGroupCount[];
  /** sum of `groups` — the denominator of the UI's ร้อยละ */
  classified: number;
  /** visits/discharges with a principal dx that fits no group (Z, U, ...) */
  unclassified: number;
  /** visits/discharges with no principal dx yet (not yet coded) */
  uncoded: number;
}

export interface DiseaseGroups {
  /** OPD visits (ovst.vstdate in range) by รง.504 group */
  opd: DiseaseGroupRanking;
  /** discharges (ipt.dchdate in range) by รง.505 group */
  ipd: DiseaseGroupRanking;
  /**
   * new admissions (ipt.regdate in range — same universe as cards.admit_new)
   * by รง.505 group of the ADMITTING diagnosis: principal dx (ovstdiag
   * diagtype '1') of the OPD visit that sent the patient in (ipt.vn).
   * Available at once (no coding lag) but provisional — ~53 % agree with the
   * final pdx at 3 characters. `uncoded` = admissions whose admitting visit
   * has no principal dx.
   */
  ipdAdmit: DiseaseGroupRanking;
}

export interface ServiceOverview {
  range: OverviewRange;
  cards: OverviewCards;
  hourly: HourlyVisit[]; // always 24 entries, hour 0..23
  wards: WardOccupancy[]; // sorted by patients desc
  departments: NamedCount[]; // all departments, sorted by visits desc (UI groups top 15 + "อื่นๆ")
  pttypes: NamedCount[]; // insurance/right groups, sorted by visits desc
  ageSex: AgeSexBand[]; // distinct patients in range, bands young→old
  diseaseGroups: DiseaseGroups;
}
