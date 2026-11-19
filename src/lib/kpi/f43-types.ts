/**
 * Types of "ตรวจ 43 แฟ้ม" (/f43): completeness / validity checks of the
 * HOSxP data before the HDC 43/52-file and FDH OP exports. Pure module
 * (no server-only), shared by the loader (./f43.ts) and the UI.
 * Aggregates only: counts per check, service unit and recorder (staff
 * name). No patient-level data (name, HN, CID) ever reaches this type.
 */

/** error = the record is rejected / flagged by HDC or FDH; warn = should be fixed. */
export type F43Severity = "error" | "warn";

/** "hdc" = HDC 43/52 files; "fdh" = FDH OP export. */
export type F43Group = "hdc" | "fdh";

/** How a file is attributed to a service unit (ovst.main_dep). */
export type F43Scope =
  /** Additive per unit (each record belongs to one visit / unit). */
  | "unit"
  /** Distinct people/providers: per-unit counts + a separate whole-hospital count. */
  | "unit-distinct"
  /** Admissions (IPD): shown under the pseudo unit "IPD". */
  | "ipd"
  /** Not attributable to a unit: whole hospital only. */
  | "hospital";

export interface F43CheckResult {
  id: string;
  label: string;
  severity: F43Severity;
  /** What is checked (plain Thai for PCU staff). */
  what: string;
  /** Where to fix it in HOSxP. */
  fix: string;
  failed: number;
}

/** pass / warn / error = checked; empty = no records; na = not for this unit; unsupported. */
export type F43FileStatus = "pass" | "warn" | "error" | "empty" | "na" | "unsupported";

export interface F43FileResult {
  code: string;
  /** Short file name for the sidebar (PERSON, OPD, …). */
  label: string;
  group: F43Group;
  name: string;
  status: F43FileStatus;
  /** Scope / source note, or the reason when unsupported. */
  note?: string;
  scope?: F43Scope;
  /** Unit of `total` (e.g. "visit", "รายการ", "คน"). */
  unitLabel?: string;
  /** null = unsupported or not applicable for the selected service unit. */
  total: number | null;
  errorFailed: number;
  warnFailed: number;
  /** Sorted: failing errors, failing warnings (most first), then passing checks. */
  checks: F43CheckResult[];
}

export interface F43UnitOption {
  /** ovst.main_dep (kskdepartment.depcode), "IPD" or "*" (all). */
  code: string;
  name: string;
  isPcu: boolean;
}

export interface F43Counts {
  errorFailed: number;
  warnFailed: number;
}

/** One row of the unit comparison table. */
export interface F43UnitRow extends F43UnitOption {
  hdc: F43Counts;
  fdh: F43Counts;
}

/** One row of the recorder (staff) table. */
export interface F43StaffRow extends F43Counts {
  /** Staff display name (opduser.name / doctor.name), never a patient. */
  name: string;
  /** "ผู้ใช้ HOSxP" (login) or "ผู้ให้บริการ" (doctor code). */
  role: string;
  /** "FILE n" of the largest problems, most first. */
  top: string[];
}

export interface F43Range {
  /** "YYYY-MM-DD", inclusive. */
  from: string;
  to: string;
  days: number;
}

export interface F43Report {
  range: F43Range;
  /** Selected unit code ("*" = all). */
  unit: string;
  unitName: string;
  units: F43UnitOption[];
  /** Selected file code, or null for the overview. */
  file: string | null;
  /** Every file, in structure order (sidebar). */
  files: F43FileResult[];
  /** Totals per group for the selected unit. */
  hdc: F43Counts & { ready: boolean };
  fdh: F43Counts & { ready: boolean };
  /** Overview: every unit; file view: that file only. */
  unitRows: F43UnitRow[];
  /** Overview: HDC files; file view: that file only. */
  staffRows: F43StaffRow[];
  updatedAt: string;
}
