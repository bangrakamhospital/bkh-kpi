import type { ScreeningCode } from "@/lib/kpi/types";

/**
 * Departments ("แผนก/กลุ่มงาน"): a VIEW FILTER for the home page only.
 * Everyone sees every indicator; departments have no permission effect.
 * Pure module (types + constants), safe on client and server.
 *
 * Contract (docs/departments.md):
 *   GET    /api/departments                 -> 200 DepartmentsResponse (public)
 *   POST   /api/admin/departments           -> 201 DepartmentResponse
 *   PATCH  /api/admin/departments/{id}      -> 200 DepartmentResponse
 *   DELETE /api/admin/departments/{id}      -> 200 { ok: true }
 *   errors                                  -> { error: "<thai>" }
 */

/** Named palette keys (match components/kpi/department-theme.ts). */
export const DEPARTMENT_COLORS = [
  "emerald",
  "sky",
  "violet",
  "rose",
  "amber",
  "teal",
] as const;
export type DepartmentColorKey = (typeof DEPARTMENT_COLORS)[number];

export const DEPARTMENT_NAME_MAX = 60;
export const DEPARTMENTS_MAX = 50;

export interface Department {
  /** Stable id (slug / short random), safe in URLs. */
  id: string;
  name: string;
  /** Palette name (DEPARTMENT_COLORS), null = automatic. */
  color: DepartmentColorKey | null;
  /** Indicator codes in display order (unknown codes are dropped). */
  codes: ScreeningCode[];
}

export interface DepartmentsResponse {
  /** Display order preserved. */
  departments: Department[];
}

export interface DepartmentCreate {
  name: string;
  color?: DepartmentColorKey | null;
  codes: string[];
}

export interface DepartmentPatch {
  name?: string;
  color?: DepartmentColorKey | null;
  codes?: string[];
}

export interface DepartmentResponse {
  department: Department;
}
