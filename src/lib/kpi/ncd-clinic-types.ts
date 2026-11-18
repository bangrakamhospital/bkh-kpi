/**
 * Types of the "NCD Clinic" report (/ncd). Pure module (no server-only),
 * shared by the loader (./ncd-clinic.ts) and the UI. Aggregates only: no
 * patient-level data. Definitions: docs/kpi/ncd-clinic.md.
 */

/** Payment groups of the infographic. */
export type NcdPayGroupCode =
  /** "สิทธิเกิดรายได้เต็มจำนวน": billed fee-for-service. */
  | "FULL"
  /** "รายรับเรียกเก็บไม่เต็มจำนวน": capitation, the hospital is the main unit. */
  | "CAPITATION";

/** Scheme rows, in display order (capitation first, then fee-for-service). */
export type NcdSchemeCode =
  | "UC_OWN"
  | "SSS_OWN"
  | "NRH_OWN"
  | "OFC"
  | "LGO"
  | "GOV"
  | "SSS_OTHER"
  | "UC_OTHER"
  | "CSH"
  | "OTHER";

/** Disease groups (ICD-10 on any clinic visit of the year). */
export type NcdDiseaseCode = "DM" | "HT" | "DLP" | "ASTHMA" | "OTHER";

/** Charges of a set of visits (baht = everything charged on the visit). */
export interface NcdMoney {
  /** vn_stat.income: every item charged on the visits (all departments of the vn). */
  baht: number;
  /** Drugs (income group 12: income 03/04/17/20). */
  drugBaht: number;
  /** Laboratory (income group 03: income 07). */
  labBaht: number;
  /** Radiology (income group 04: income 08). */
  xrayBaht: number;
  /** baht − drugBaht − labBaht − xrayBaht (service fee, nursing, supplies, …). */
  otherBaht: number;
  /** vn_stat.paid_money: part paid by the patient at the cashier. */
  paidBaht: number;
}

export interface NcdSchemeRow extends NcdMoney {
  code: NcdSchemeCode;
  /** Thai label, e.g. "UC ลงทะเบียน รพ.บางระกำ (เหมาจ่ายรายหัว)". */
  name: string;
  payGroup: NcdPayGroupCode;
  /** pttype.hipdata_code values of the rule (reference; not needed in the UI). */
  hipdata: readonly string[];
  /** Rule on vn_stat.hospmain: "own" = this hospital, "other" = elsewhere, "any". */
  hospmain: "own" | "other" | "any";
  /** Distinct people with a visit under this scheme (a person can be in several). */
  persons: number;
  visits: number;
  /** baht / visits (0 when no visit). */
  bahtPerVisit: number;
}

export interface NcdPayGroupRow extends NcdMoney {
  code: NcdPayGroupCode;
  name: string;
  /** One-line rule of the group (Thai). */
  rule: string;
  /** Distinct people with a visit in the group (a person can be in both groups). */
  persons: number;
  visits: number;
  bahtPerVisit: number;
  /** Scheme rows of the group, display order, zero rows included. */
  schemes: NcdSchemeRow[];
}

export interface NcdMonthRow extends NcdMoney {
  /** "YYYY-MM" (Gregorian). */
  month: string;
  /** Distinct people with a visit in the month. */
  persons: number;
  visits: number;
  /** Visits charged under a FULL-group scheme / CAPITATION-group scheme. */
  fullVisits: number;
  capitationVisits: number;
  fullBaht: number;
  capitationBaht: number;
  /** Clinic days (dates with >= 1 visit) in the month. */
  clinicDays: number;
  /** visits / clinicDays (0 when no day). */
  visitsPerDay: number;
  /** Highest visits on one day of the month. */
  maxVisitsPerDay: number;
}

export interface NcdDiseaseRow {
  code: NcdDiseaseCode;
  name: string;
  /** ICD-10 range label, e.g. "E10–E14" ("" for OTHER). */
  icd10: string;
  /** Distinct people with the group on any clinic visit of the year (groups overlap). */
  persons: number;
  /** Visits carrying the group. */
  visits: number;
}

/** A quality indicator with its target. */
export interface NcdIndicator {
  code: string;
  /** Section of the indicator. */
  group: "DM" | "HT" | "CKD" | "LAB";
  name: string;
  /** Numerator (people unless `unit` says otherwise). */
  numerator: number;
  /** Denominator. */
  denominator: number;
  /** numerator / denominator × 100, 1 decimal; null when denominator = 0. */
  percent: number | null;
  /** Target in percent, null = no official target (shown for follow-up only). */
  target: number | null;
  /** ">" | ">=" = higher is better, "<=" = lower is better. */
  targetOperator: ">" | ">=" | "<=" | null;
  /** Source of the target (Thai, short), null when no target. */
  targetSource: string | null;
  /** percent meets the target; null when there is no target or no data. */
  pass: boolean | null;
  /** Counting unit of numerator/denominator: "คน" or "ครั้ง". */
  unit: "คน" | "ครั้ง";
  /** Short definition (Thai). */
  definition: string;
}

/** One DM lab of the annual panel (Chol/LDL, K, Cr, FBS, HbA1c, UACR). */
export interface NcdLabPanelRow {
  code: "HBA1C" | "LDL" | "CHOL" | "CR" | "K" | "FBS" | "UACR" | "PANEL";
  name: string;
  /** DM people with >= 1 result of the lab in the fiscal year. */
  persons: number;
  /** All DM people of the clinic (same denominator for every row). */
  denominator: number;
  percent: number | null;
}

export interface NcdWaitStats {
  /** Visits with a valid interval (both timestamps, 0..720 minutes). */
  measured: number;
  /** Median minutes (10-minute buckets, linear inside the bucket); null when no data. */
  medianMinutes: number | null;
  /** Mean minutes (bucket mid-points); null when no data. */
  meanMinutes: number | null;
  /** 90th percentile minutes (same method as the median); null when no data. */
  p90Minutes: number | null;
}

export interface NcdWaitRow {
  /** true = visits with a lab order on the same vn. */
  withLab: boolean;
  /** All clinic visits of the kind (LEFT JOIN service_time: each measure has its own `measured` count). */
  visits: number;
  /** Arrival (ovst.vsttime) -> doctor room (service_time.service2). */
  toDoctor: NcdWaitStats;
  /** Arrival -> drugs dispensed (service_time.service7). */
  toPharmacy: NcdWaitStats;
  /** Vital signs done at the screening point (service1) -> doctor room (service2). */
  screenToDoctor: NcdWaitStats;
}

export interface NcdDayRow {
  /** "YYYY-MM-DD". */
  date: string;
  visits: number;
  /** Clinic appointments made for the day (oapp.nextdate). */
  appointments: number;
  /** Distinct physicians who saw a clinic visit that day. */
  physicians: number;
}

export interface NcdWorkload {
  /** Target ceiling of visits / appointments per clinic day (infographic: 100–120). */
  targetPerDay: number;
  /** Dates with >= 1 clinic visit. */
  clinicDays: number;
  avgVisitsPerDay: number;
  maxVisitsPerDay: number;
  /** Clinic days with visits > targetPerDay. */
  daysOverTarget: number;
  appointments: number;
  /** Appointments with a visit (oapp.visit_vn set). */
  appointmentsKept: number;
  /** appointmentsKept / appointments × 100, null when none. */
  appointmentsKeptPercent: number | null;
  /** Dates with >= 1 appointment. */
  appointmentDays: number;
  avgAppointmentsPerDay: number;
  maxAppointmentsPerDay: number;
  /** Appointment days with appointments > targetPerDay. */
  appointmentDaysOverTarget: number;
  /** Distinct physicians (doctor.position_id 1) who saw a clinic visit in the year. */
  physicians: number;
  /** Mean distinct physicians per clinic day. */
  avgPhysiciansPerDay: number;
  /** Physician-seen visits / physician-days. */
  visitsPerPhysicianDay: number;
  /** Every date with visits or appointments, ascending. */
  days: NcdDayRow[];
}

/** HbA1c tests beyond the NHSO limit (2 per person per year). */
export interface NcdHba1cUse {
  /** HbA1c tests billable per person per fiscal year (NHSO). */
  billableLimit: number;
  /** Price of one HbA1c in HOSxP (nondrugitems 3001142), for the estimate. */
  priceBaht: number;
  /** DM people with > billableLimit tests in the year. */
  personsOverLimit: number;
  /** Tests beyond the limit (sum over people of tests − limit). */
  excessTests: number;
  /** excessTests × priceBaht (estimate, not billable to NHSO). */
  excessBaht: number;
  /** All HbA1c tests of DM people in the year (distinct order dates per person). */
  tests: number;
}

/** Venous FBS (lab) vs capillary DTX on clinic visits. */
export interface NcdGlucoseTests {
  /** Visits with a venous FBS lab item. */
  fbsVisits: number;
  /** Visits with a capillary glucose (DTX) lab item. */
  dtxVisits: number;
  /** fbsVisits / (fbsVisits + dtxVisits) × 100, null when both 0. */
  fbsPercent: number | null;
}

export interface NcdClinicSummary {
  fiscalYear: number;
  /** "YYYY-MM-DD" 1 Oct. */
  periodStart: string;
  /** "YYYY-MM-DD" 30 Sep. */
  periodEnd: string;
  /** The fiscal year has ended (figures are final). */
  closed: boolean;
  /** ovst.main_dep codes counted as the clinic, with a Thai label. */
  clinic: { depcodes: readonly string[]; name: string };

  /** Distinct people with >= 1 clinic visit in the year. */
  persons: number;
  /** Clinic visits in the year. */
  visits: number;
  /** Visits with a lab order on the same vn. */
  labVisits: number;
  /** Charges of every clinic visit. */
  money: NcdMoney;
  /** money.baht / visits. */
  bahtPerVisit: number;

  /** FULL then CAPITATION, each with its scheme rows. */
  payGroups: NcdPayGroupRow[];
  /** Twelve months Oct–Sep (zero months included). */
  months: NcdMonthRow[];
  /** DM, HT, DLP, ASTHMA, OTHER (groups overlap). */
  diseases: NcdDiseaseRow[];
  /** People with both DM and HT. */
  dmHtPersons: number;

  /** Headline quality indicators with targets, display order. */
  indicators: NcdIndicator[];
  /** DM annual lab panel (completeness for billing). */
  dmLabPanel: NcdLabPanelRow[];
  hba1cUse: NcdHba1cUse;
  glucoseTests: NcdGlucoseTests;
  /** Without lab, then with lab. */
  waiting: NcdWaitRow[];
  workload: NcdWorkload;

  updatedAt: string;
}
