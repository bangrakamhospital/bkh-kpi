/**
 * Types of the standard clinic page (/clinic/[clinic]). Pure module (no
 * server-only), shared by the loader (./standard-clinic.ts) and the UI.
 * Aggregates only: no patient-level data. Definitions:
 * docs/kpi/clinic-standard.md.
 */

import type { ClinicPayGroupCode, ClinicSchemeCode } from "./clinic-scheme-types";

/** Charges of a set of visits: vn_stat of the visit (every item of the vn). */
export interface StdMoney {
  /** vn_stat.income. */
  baht: number;
  /** inc12: drugs (income 03/04/17/20). */
  drugBaht: number;
  /** inc03: laboratory (income 07). */
  labBaht: number;
  /** inc04: radiology (income 08). */
  xrayBaht: number;
  /** inc06: procedures / anaesthesia (income 11). */
  procedureBaht: number;
  /** inc11: dental (income 13), done on the visit. */
  dentalBaht: number;
  /** inc13: physiotherapy / rehabilitation (income 14), done on the visit. */
  rehabBaht: number;
  /** baht minus the six groups above (service fee, nursing, supplies, …). */
  otherBaht: number;
  /** vn_stat.paid_money: paid by the patient at the cashier. */
  paidBaht: number;
}

export interface StdSchemeRow extends StdMoney {
  code: ClinicSchemeCode;
  name: string;
  payGroup: ClinicPayGroupCode;
  /** Distinct people with a visit under this scheme. */
  persons: number;
  visits: number;
  bahtPerVisit: number;
}

export interface StdPayGroupRow extends StdMoney {
  code: ClinicPayGroupCode;
  name: string;
  rule: string;
  persons: number;
  visits: number;
  bahtPerVisit: number;
  schemes: StdSchemeRow[];
}

/** People / visits / charges of one or more departments. */
export interface StdUnitFigures {
  persons: number;
  visits: number;
  baht: number;
  bahtPerVisit: number;
}

export interface StdDepartmentRow extends StdUnitFigures {
  depcode: string;
  name: string;
}

export interface StdUnitRow extends StdUnitFigures {
  name: string;
  /** One row per depcode of the unit (shown when the unit has several). */
  departments: StdDepartmentRow[];
}

export type StdCategoryCode =
  | "DRUG"
  | "LAB"
  | "XRAY"
  | "PROCEDURE"
  | "DENTAL"
  | "REHAB"
  | "OTHER";

export interface StdCategoryRow {
  code: StdCategoryCode;
  name: string;
  baht: number;
  /** Share of all charges (0–100), null when no charge. */
  percent: number | null;
}

export interface StdItemRow {
  icode: string;
  name: string;
  /** income (หมวดค่ารักษา) label. */
  category: string;
  qty: number;
  /** Visits charged with the item. */
  visits: number;
  baht: number;
}

export interface StdItems {
  /** Every drug item as one line. */
  drug: { qty: number; visits: number; baht: number };
  /** Non-drug items, most visits first (up to TOP_ITEMS). */
  top: StdItemRow[];
  /** All non-drug items: total baht and distinct items. */
  nondrugBaht: number;
  nondrugItems: number;
}

export interface StdPdxRow {
  code: string;
  name: string;
  visits: number;
  persons: number;
}

export interface StdWorkload {
  /** Dates with >= 1 visit. */
  clinicDays: number;
  avgVisitsPerDay: number;
  maxVisitsPerDay: number;
  /** Distinct physicians (ovst.doctor, position แพทย์) in the year. */
  physicians: number;
  avgPhysiciansPerDay: number;
  /** Visits seen by a physician ÷ physician-days. */
  visitsPerPhysicianDay: number;
  /** Share of visits whose examiner is a physician (0–100). */
  physicianVisitPercent: number | null;
  /** Distinct examiners of any position (ovst.doctor) in the year. */
  providers: number;
  avgProvidersPerDay: number;
  /** oapp of the clinic's depcodes with nextdate in the year. */
  appointments: number;
  appointmentsKept: number;
  appointmentsKeptPercent: number | null;
  appointmentDays: number;
}

export interface StdMonthRow {
  /** "YYYY-MM" (Gregorian). */
  month: string;
  persons: number;
  visits: number;
  baht: number;
  fullVisits: number;
  fullBaht: number;
  capitationVisits: number;
  capitationBaht: number;
  clinicDays: number;
  visitsPerDay: number;
  maxVisitsPerDay: number;
  appointments: number;
  appointmentsKept: number;
}

export interface StandardClinicSummary {
  slug: string;
  label: string;
  note: string;
  /** ovst.main_dep codes counted. */
  depcodes: readonly string[];
  fiscalYear: number;
  periodStart: string;
  periodEnd: string;
  closed: boolean;

  persons: number;
  visits: number;
  money: StdMoney;
  bahtPerVisit: number;
  /** Visits without a principal diagnosis (vn_stat.pdx blank). */
  noPdxVisits: number;

  /** FULL then CAPITATION. */
  payGroups: StdPayGroupRow[];
  /** Sub-units (or departments); empty for a single-department clinic. */
  units: StdUnitRow[];
  categories: StdCategoryRow[];
  items: StdItems;
  pdx: StdPdxRow[];
  workload: StdWorkload;
  /** Twelve months Oct–Sep. */
  months: StdMonthRow[];

  updatedAt: string;
}
