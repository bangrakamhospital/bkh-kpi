/**
 * Types of the "คลินิกทันตกรรม" report (/clinic/dental). Pure module (no
 * server-only), shared by the loader (./dental-clinic.ts) and the UI.
 * Aggregates only: no patient-level data. Definitions: docs/kpi/dental-clinic.md.
 */

import type { NcdPayGroupCode, NcdSchemeCode } from "@/lib/kpi/ncd-clinic-types";

/** Same two payment groups and scheme rows as the NCD clinic (CLINIC_SCHEME_RULES, sql/clinic-scheme-hosxp.ts). */
export type DentalPayGroupCode = NcdPayGroupCode;
export type DentalSchemeCode = NcdSchemeCode;

/** Service unit of a dental visit. */
export type DentalUnitCode =
  /** ห้องตรวจทันตกรรม ในโรงพยาบาล (dtmain.depcode 008). */
  | "HOSPITAL"
  /** ห้องฟันออกหน่วย (ovst.main_dep / dtmain.depcode 046): school / community outreach. */
  | "OUTREACH";

/** Procedure categories (dttm.dttm_group_id ranges, see DENTAL_CATEGORIES in the SQL module). */
export type DentalCategoryCode =
  | "EXAM"
  | "XRAY"
  | "OHI"
  | "FLUORIDE"
  | "SEALANT"
  | "FILLING"
  | "EXTRACTION"
  | "PERIO"
  | "ENDO"
  | "PROSTHESIS"
  | "SURGERY"
  | "ORAL_MED"
  | "OTHER";

/** Kind of a category: exam / diagnosis, prevention, or treatment. */
export type DentalCategoryKind = "EXAM" | "PREVENTIVE" | "TREATMENT";

/** Age groups (vn_stat.age_y at the visit). */
export type DentalAgeCode = "CHILD_0_5" | "CHILD_6_14" | "ADULT_15_59" | "ELDER_60";

/**
 * Charges of a set of dental visits. `baht` = opitemrece items keyed by the
 * dental rooms (dep_code 008 / 046) only, not the whole visit (vn_stat.income
 * would add the NCD clinic's drugs and labs of referred visits).
 */
export interface DentalMoney {
  /** Every item charged by the dental rooms on the visits. */
  baht: number;
  /** income 13 ค่าบริการทางทันตกรรม. */
  dentalFeeBaht: number;
  /** income 02 ค่าอวัยวะเทียม (ฟันเทียม / ครอบฟัน). */
  prosthesisBaht: number;
  /** income 11 ค่าทำหัตถการ. */
  procedureBaht: number;
  /** income 03 / 04 / 17 / 20 ยา. */
  drugBaht: number;
  /** income 08 รังสีวิทยา. */
  xrayBaht: number;
  /** baht − the five above (nursing, supplies, PP items, …). */
  otherBaht: number;
}

export interface DentalSchemeRow extends DentalMoney {
  code: DentalSchemeCode;
  name: string;
  payGroup: DentalPayGroupCode;
  /** Distinct people with a dental visit under the scheme (a person can be in several). */
  persons: number;
  visits: number;
  bahtPerVisit: number;
}

export interface DentalPayGroupRow extends DentalMoney {
  code: DentalPayGroupCode;
  name: string;
  rule: string;
  persons: number;
  visits: number;
  bahtPerVisit: number;
  schemes: DentalSchemeRow[];
}

export interface DentalUnitRow {
  code: DentalUnitCode;
  name: string;
  /** Department codes of the unit (Thai label shows them). */
  depcodes: readonly string[];
  /** Distinct people with a visit in the unit. */
  persons: number;
  visits: number;
  /** Visits registered at another hospital clinic (e.g. NCD) and sent to the dental room. */
  referredVisits: number;
  /** Visits with >= 1 treatment procedure. */
  treatmentVisits: number;
  /** dtmain rows (procedures). */
  procedures: number;
  /** Dates with >= 1 visit. */
  days: number;
  visitsPerDay: number;
  /** Charges of the dental rooms. */
  baht: number;
  bahtPerVisit: number;
}

/** Dental work recorded on PCU visits / by the PCU dental rooms: shown, not counted. */
export interface DentalExcluded {
  visits: number;
  baht: number;
}

export interface DentalMonthRow {
  /** "YYYY-MM". */
  month: string;
  persons: number;
  visits: number;
  hospitalVisits: number;
  outreachVisits: number;
  procedures: number;
  baht: number;
  fullVisits: number;
  fullBaht: number;
  capitationVisits: number;
  capitationBaht: number;
}

export interface DentalCategoryRow {
  code: DentalCategoryCode;
  name: string;
  kind: DentalCategoryKind;
  /** dtmain rows. */
  procedures: number;
  /** Teeth (dtmain.tcount, at least 1 per row). */
  teeth: number;
  visits: number;
  persons: number;
  /** dtmain.fee: HOSxP price of the procedures. */
  feeBaht: number;
}

/** One procedure item (dttm), for the "most frequent" list. */
export interface DentalItemRow {
  tmcode: string;
  /** dttm.name (procedure name, not patient data). */
  name: string;
  icd10tm: string;
  category: DentalCategoryCode;
  procedures: number;
  teeth: number;
  visits: number;
  persons: number;
  feeBaht: number;
}

export interface DentalAgeRow {
  code: DentalAgeCode;
  name: string;
  /** Distinct people with a visit at that age (a birthday in the year can put one person in two groups). */
  persons: number;
  visits: number;
}

/** Restorations vs extractions of permanent teeth (teeth, not visits). */
export interface DentalFillingRatio {
  /** Definitive fillings of permanent teeth (ICD-10-TM 23871*). */
  fillingTeeth: number;
  /** Extractions of permanent teeth (EXTRACTION, ICD-10-TM 238*). */
  extractionTeeth: number;
  /** fillingTeeth / extractionTeeth, 2 decimals; null when no extraction. */
  ratio: number | null;
  /** Primary teeth, same definitions (23771* / 237*). */
  primaryFillingTeeth: number;
  primaryExtractionTeeth: number;
}

export interface DentalIndicator {
  code: string;
  name: string;
  numerator: number;
  denominator: number;
  /** numerator / denominator × 100, 1 decimal; null when denominator = 0. */
  percent: number | null;
  /** Target in percent; null = no official target (follow-up only). */
  target: number | null;
  targetOperator: ">=" | "<=" | null;
  targetSource: string | null;
  pass: boolean | null;
  unit: "คน" | "ครั้ง";
  definition: string;
}

export interface DentalWorkload {
  /** HOSPITAL unit: dates with >= 1 visit. */
  clinicDays: number;
  avgVisitsPerDay: number;
  maxVisitsPerDay: number;
  avgProceduresPerDay: number;
  /** Distinct dental staff (dtmain.doctor) of the HOSPITAL unit in the year. */
  staff: number;
  avgStaffPerDay: number;
  /** Distinct (staff, visit) pairs / staff-days. */
  visitsPerStaffDay: number;
  /** OUTREACH unit. */
  outreachDays: number;
  outreachVisitsPerDay: number;
  outreachStaff: number;
  /** oapp of the dental room (depcode 008) due before today. */
  appointments: number;
  appointmentsKept: number;
  appointmentsKeptPercent: number | null;
}

/** Registration -> first dental procedure keyed (proxy of waiting time). */
export interface DentalWait {
  /** Visits registered at the dental room (main_dep 008), today excluded. */
  visits: number;
  /** Visits with an interval 0..720 minutes. */
  measured: number;
  medianMinutes: number | null;
  meanMinutes: number | null;
  p90Minutes: number | null;
  /** Measured visits within 60 minutes, percent. */
  within60Percent: number | null;
}

export interface DentalClinicSummary {
  fiscalYear: number;
  periodStart: string;
  periodEnd: string;
  closed: boolean;
  clinic: { name: string };

  persons: number;
  visits: number;
  procedures: number;
  /** Visits with >= 1 treatment procedure / exam-or-prevention only. */
  treatmentVisits: number;
  nonTreatmentVisits: number;
  /** Persons with >= 1 treatment procedure. */
  treatedPersons: number;
  money: DentalMoney;
  bahtPerVisit: number;
  /** Other departments' items on visits registered at a dental room (OPD fee etc.). */
  registeredOtherBaht: number;

  units: DentalUnitRow[];
  excludedPcu: DentalExcluded;
  payGroups: DentalPayGroupRow[];
  months: DentalMonthRow[];
  categories: DentalCategoryRow[];
  /** Top items by procedures (exam, OHI and medication left out). */
  topItems: DentalItemRow[];
  ages: DentalAgeRow[];
  fillingRatio: DentalFillingRatio;
  indicators: DentalIndicator[];
  workload: DentalWorkload;
  waiting: DentalWait;

  updatedAt: string;
}
