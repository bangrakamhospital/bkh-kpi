/**
 * Types of the "คลินิกกายภาพ" report (/clinic/pt). Pure module (no server-only),
 * shared by the loader (./pt-clinic.ts) and the UI. Aggregates only: no
 * patient-level data. Definitions: docs/kpi/pt-clinic.md.
 */

import type { NcdPayGroupCode, NcdSchemeCode } from "./ncd-clinic-types";

/** Same payment groups and scheme rules as /clinic/ncd. */
export type PtPayGroupCode = NcdPayGroupCode;
export type PtSchemeCode = NcdSchemeCode;

/** Diagnosis groups (any ICD-10 of the PT visit). */
export type PtDxCode = "STROKE" | "NEURO" | "MSK" | "INJURY" | "OTHER";

/** IMC groups (pdx of the admission). */
export type PtImcCode = "STROKE" | "TBI" | "SCI" | "HIP";

/** Charges of a set of PT visits. */
export interface PtMoney {
  /** PT-catalog items (physic_items) charged in opitemrece on the visits. */
  ptBaht: number;
  /** vn_stat.income: everything charged on the visits (all departments of the vn). */
  visitBaht: number;
  /** visitBaht − ptBaht (drugs, lab, other clinic of the same vn, …); context only. */
  otherBaht: number;
  /** vn_stat.inc12 drugs of the visits (context). */
  drugBaht: number;
  /** vn_stat.paid_money: paid by the patient (whole visit). */
  paidBaht: number;
}

export interface PtSchemeRow extends PtMoney {
  code: PtSchemeCode;
  name: string;
  payGroup: PtPayGroupCode;
  /** Distinct people with a PT visit under the scheme (a person can be in several). */
  persons: number;
  visits: number;
  /** ptBaht / visits (0 when no visit). */
  ptBahtPerVisit: number;
}

export interface PtPayGroupRow extends PtMoney {
  code: PtPayGroupCode;
  name: string;
  rule: string;
  persons: number;
  visits: number;
  ptBahtPerVisit: number;
  /** Scheme rows of the group, display order, zero rows included. */
  schemes: PtSchemeRow[];
}

export interface PtMonthRow {
  /** "YYYY-MM" (Gregorian). */
  month: string;
  /** Distinct people with a PT visit in the month. */
  persons: number;
  visits: number;
  /** Visits registered at the PT room (main_dep 027). */
  depVisits: number;
  ptBaht: number;
  fullVisits: number;
  fullPtBaht: number;
  capitationVisits: number;
  capitationPtBaht: number;
  /** Service days (dates with >= 1 PT visit). */
  serviceDays: number;
  /** visits / serviceDays (0 when no day). */
  visitsPerDay: number;
  appointments: number;
  appointmentsKept: number;
}

export interface PtItemRow {
  icode: string;
  name: string;
  /** physic_items group: "PT" กายภาพบำบัด (1) or "ORTHOTIC" กายอุปกรณ์ (3). */
  group: "PT" | "ORTHOTIC";
  /** Units charged (opitemrece.qty). */
  qty: number;
  visits: number;
  persons: number;
  baht: number;
}

export interface PtDxRow {
  code: PtDxCode;
  name: string;
  icd10: string;
  /** Distinct people with the group on any PT visit (groups overlap). */
  persons: number;
  visits: number;
}

export interface PtBandRow {
  /** e.g. "1 ครั้ง", "2–5 ครั้ง". */
  label: string;
  persons: number;
}

/** A follow-up indicator (no official target unless `target` is set). */
export interface PtIndicator {
  code: string;
  name: string;
  numerator: number;
  denominator: number;
  /** numerator / denominator × 100, 1 decimal; null when denominator = 0. */
  percent: number | null;
  target: number | null;
  targetOperator: ">" | ">=" | "<=" | null;
  targetSource: string | null;
  pass: boolean | null;
  unit: "คน" | "ครั้ง" | "admission";
  definition: string;
}

export interface PtImcRow {
  code: PtImcCode;
  name: string;
  icd10: string;
  /** Admissions discharged home (dchtype 01) in the year with the pdx. */
  admissions: number;
  persons: number;
  /** PT during the stay (physic_plan_detail.an). */
  ipdPt: number;
  /** OPD PT visit within followUpDays after discharge. */
  opdPt: number;
  /** Either. */
  anyPt: number;
  /** Discharged less than followUpDays ago: follow-up window not complete. */
  openWindow: number;
}

export interface PtWait {
  /** PT-room visits (main_dep 027) with a physic_list item, today excluded. */
  visits: number;
  /** Visits with a valid interval (0..480 minutes). */
  measured: number;
  meanMinutes: number | null;
  medianMinutes: number | null;
  p90Minutes: number | null;
  /** measured visits started <= 30 / <= 60 minutes after arrival. */
  within30: number;
  within60: number;
}

export interface PtWorkload {
  serviceDays: number;
  avgVisitsPerDay: number;
  maxVisitsPerDay: number;
  /** Distinct therapists (physic_list.doctor) in the year. */
  therapists: number;
  avgTherapistsPerDay: number;
  /** Distinct (visit, therapist) pairs / therapist-days. */
  visitsPerTherapistDay: number;
  appointments: number;
  appointmentsKept: number;
  appointmentsKeptPercent: number | null;
}

export interface PtIpd {
  admissions: number;
  persons: number;
  /** Distinct (an, service date). */
  sessions: number;
  /** physic_plan_detail rows. */
  items: number;
  baht: number;
}

export interface PtClinicSummary {
  fiscalYear: number;
  periodStart: string;
  periodEnd: string;
  closed: boolean;
  clinic: { depcode: string; name: string };

  /** Distinct people with >= 1 PT visit in the year. */
  persons: number;
  /** PT visits (OPD vn) in the year. */
  visits: number;
  /** Of which registered at the PT room (main_dep 027). */
  depVisits: number;
  /** People without a PT visit in the 365 days before 1 Oct. */
  newPersons: number;
  /** People aged >= 60 at a PT visit. */
  elderlyPersons: number;
  money: PtMoney;
  ptBahtPerVisit: number;
  /** Units of PT-catalog items charged (sum of qty). */
  itemQty: number;

  payGroups: PtPayGroupRow[];
  months: PtMonthRow[];
  /** PT-catalog items, by baht descending. */
  items: PtItemRow[];
  diagnoses: PtDxRow[];
  /** People by number of PT visits in the year. */
  bands: PtBandRow[];
  indicators: PtIndicator[];
  imc: PtImcRow[];
  imcFollowUpDays: number;
  wait: PtWait;
  workload: PtWorkload;
  ipd: PtIpd;

  updatedAt: string;
}
