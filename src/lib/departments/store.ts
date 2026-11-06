import "server-only";

import { randomBytes } from "node:crypto";

import { DataStoreError, jsonFile } from "@/lib/data/json-store";
import { isScreeningCode } from "@/lib/kpi/screening-indicators";
import type { ScreeningCode } from "@/lib/kpi/types";
import {
  DEPARTMENT_COLORS,
  DEPARTMENT_NAME_MAX,
  DEPARTMENTS_MAX,
  type Department,
  type DepartmentColorKey,
  type DepartmentPatch,
} from "./types";

/**
 * Department store: ${KPI_DATA_DIR || <cwd>/data}/departments.json on top
 * of src/lib/data/json-store.ts (mutex, atomic writes, mtime cache).
 *
 *  - missing file = DEFAULT_DEPARTMENTS (fixed ids); the file is written on
 *    the first admin change
 *  - unknown indicator codes in the file (indicator removed later) are
 *    dropped on read; a structurally invalid file throws DataStoreError
 *  - view filter only: no permission meaning, no patient data
 */

export { DataStoreError };

const FILE_VERSION = 1;
const ID_RE = /^[A-Za-z0-9_-]{1,40}$/;
const MAX_CODES_INPUT = 50;

export const DEFAULT_DEPARTMENTS: readonly Department[] = [
  {
    id: "ncd",
    name: "NCD",
    color: "sky",
    codes: ["DM", "HT", "DMC", "HTC", "RLU_HBA1C", "RLU_LDL", "RLU_CR"],
  },
  {
    id: "health-promotion",
    name: "งานส่งเสริมสุขภาพ / มะเร็ง",
    color: "rose",
    codes: ["CX", "BR"],
  },
  {
    id: "lab",
    name: "ห้องปฏิบัติการ (Lab)",
    color: "amber",
    codes: ["RLU_HBA1C", "RLU_LDL", "RLU_CR", "DMC"],
  },
];

// ----------------------------------------------------------- validation

/** NFC, control chars removed, whitespace collapsed, trimmed. */
export function cleanName(value: string): string {
  return value
    .normalize("NFC")
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const nameKey = (name: string) => cleanName(name).toLocaleLowerCase("th");

export function isValidDepartmentId(id: string): boolean {
  return ID_RE.test(id);
}

type Check<T> = { ok: true; value: T } | { ok: false; error: string };

export function checkName(v: unknown): Check<string> {
  if (typeof v !== "string") {
    return { ok: false, error: "กรุณาระบุชื่อแผนก" };
  }
  const name = cleanName(v);
  if (name.length < 1 || name.length > DEPARTMENT_NAME_MAX) {
    return {
      ok: false,
      error: `ชื่อแผนกต้องมี 1–${DEPARTMENT_NAME_MAX} ตัวอักษร`,
    };
  }
  return { ok: true, value: name };
}

export function checkColor(v: unknown): Check<DepartmentColorKey | null> {
  if (v === null || v === undefined || v === "") return { ok: true, value: null };
  if (
    typeof v === "string" &&
    (DEPARTMENT_COLORS as readonly string[]).includes(v)
  ) {
    return { ok: true, value: v as DepartmentColorKey };
  }
  return {
    ok: false,
    error: `สีต้องเป็น ${DEPARTMENT_COLORS.join(", ")} อย่างใดอย่างหนึ่ง`,
  };
}

export function checkCodes(v: unknown): Check<ScreeningCode[]> {
  if (!Array.isArray(v) || v.length > MAX_CODES_INPUT) {
    return { ok: false, error: "รายการตัวชี้วัด (codes) ต้องเป็น array" };
  }
  const codes: ScreeningCode[] = [];
  for (const c of v) {
    if (!isScreeningCode(c)) {
      return { ok: false, error: "มีรหัสตัวชี้วัดที่ไม่รู้จัก" };
    }
    if (!codes.includes(c)) codes.push(c);
  }
  return { ok: true, value: codes };
}

export interface DepartmentInput {
  name: string;
  color: DepartmentColorKey | null;
  codes: ScreeningCode[];
}

const INVALID_BODY = "ข้อมูลที่ส่งมาไม่ถูกต้อง";

/**
 * Validates a POST (all of name + codes required, color optional) or PATCH
 * (at least one of name / color / codes) body. No other keys allowed.
 */
export function parseDepartmentBody(
  json: unknown,
  mode: "create",
): Check<DepartmentInput>;
export function parseDepartmentBody(
  json: unknown,
  mode: "patch",
): Check<DepartmentPatch & { codes?: ScreeningCode[] }>;
export function parseDepartmentBody(
  json: unknown,
  mode: "create" | "patch",
): Check<DepartmentInput | (DepartmentPatch & { codes?: ScreeningCode[] })> {
  if (!json || typeof json !== "object" || Array.isArray(json)) {
    return { ok: false, error: INVALID_BODY };
  }
  const obj = json as Record<string, unknown>;
  const keys = Object.keys(obj);
  if (keys.some((k) => k !== "name" && k !== "color" && k !== "codes")) {
    return { ok: false, error: INVALID_BODY };
  }
  if (mode === "patch" && keys.length === 0) {
    return { ok: false, error: INVALID_BODY };
  }
  const out: {
    name?: string;
    color?: DepartmentColorKey | null;
    codes?: ScreeningCode[];
  } = {};
  if (mode === "create" || "name" in obj) {
    const r = checkName(obj.name);
    if (!r.ok) return r;
    out.name = r.value;
  }
  if (mode === "create" || "color" in obj) {
    const r = checkColor(obj.color);
    if (!r.ok) return r;
    out.color = r.value;
  }
  if (mode === "create" || "codes" in obj) {
    if (mode === "create" && !("codes" in obj)) {
      return { ok: false, error: "กรุณาระบุรายการตัวชี้วัด (codes)" };
    }
    const r = checkCodes(obj.codes);
    if (!r.ok) return r;
    out.codes = r.value;
  }
  return { ok: true, value: out as DepartmentInput };
}

// ------------------------------------------------------------- file I/O

function parseRecord(v: unknown): Department | null {
  if (!v || typeof v !== "object") return null;
  const r = v as Record<string, unknown>;
  if (typeof r.id !== "string" || !ID_RE.test(r.id)) return null;
  if (typeof r.name !== "string" || cleanName(r.name) === "") return null;
  if (!Array.isArray(r.codes)) return null;
  if (!r.codes.every((c) => typeof c === "string")) return null;
  const color = checkColor(r.color);
  const codes: ScreeningCode[] = [];
  for (const c of r.codes) {
    // Unknown codes (indicator removed later) are ignored.
    if (isScreeningCode(c) && !codes.includes(c)) codes.push(c);
  }
  return {
    id: r.id,
    name: cleanName(r.name).slice(0, DEPARTMENT_NAME_MAX),
    color: color.ok ? color.value : null,
    codes,
  };
}

function parseFile(text: string): Department[] {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new DataStoreError("departments.json is not valid JSON");
  }
  const root = json as { version?: unknown; departments?: unknown } | null;
  if (
    !root ||
    root.version !== FILE_VERSION ||
    !Array.isArray(root.departments)
  ) {
    throw new DataStoreError("departments.json has an unknown format");
  }
  const seen = new Set<string>();
  return root.departments.map((raw, i) => {
    const d = parseRecord(raw);
    if (!d) throw new DataStoreError(`departments.json: invalid record #${i}`);
    if (seen.has(d.id)) {
      throw new DataStoreError(`departments.json: duplicate id #${i}`);
    }
    seen.add(d.id);
    return d;
  });
}

const file = jsonFile<Department[]>({
  fileName: "departments.json",
  parse: parseFile,
  serialize: (departments) => ({ version: FILE_VERSION, departments }),
  initial: () => structuredClone(DEFAULT_DEPARTMENTS) as Department[],
  maxBytes: 512 * 1024,
});

export function departmentStorePath(): string {
  return file.path();
}

export function resetDepartmentStoreCache() {
  file.resetCache();
}

// ----------------------------------------------------------- operations

function newId(existing: readonly Department[]): string {
  for (;;) {
    const id = `d-${randomBytes(6).toString("base64url")}`;
    if (!existing.some((d) => d.id === id)) return id;
  }
}

function nameTaken(
  list: readonly Department[],
  name: string,
  exceptId?: string,
): boolean {
  const key = nameKey(name);
  return list.some((d) => d.id !== exceptId && nameKey(d.name) === key);
}

export function listDepartments(): Promise<Department[]> {
  return file.read();
}

export type CreateResult =
  | { ok: true; department: Department }
  | { ok: false; error: "duplicate_name" | "too_many" };

export function createDepartment(input: DepartmentInput): Promise<CreateResult> {
  return file.mutate<CreateResult>((list) => {
    if (list.length >= DEPARTMENTS_MAX) {
      return { result: { ok: false, error: "too_many" }, changed: false };
    }
    if (nameTaken(list, input.name)) {
      return { result: { ok: false, error: "duplicate_name" }, changed: false };
    }
    const department: Department = {
      id: newId(list),
      name: input.name,
      color: input.color,
      codes: [...input.codes],
    };
    list.push(department);
    return { result: { ok: true, department }, changed: true };
  });
}

export type UpdateResult =
  | { ok: true; department: Department; changed: boolean }
  | { ok: false; error: "not_found" | "duplicate_name" };

export function updateDepartment(
  id: string,
  patch: {
    name?: string;
    color?: DepartmentColorKey | null;
    codes?: ScreeningCode[];
  },
): Promise<UpdateResult> {
  return file.mutate<UpdateResult>((list) => {
    const d = list.find((x) => x.id === id);
    if (!d) return { result: { ok: false, error: "not_found" }, changed: false };
    if (patch.name !== undefined && nameTaken(list, patch.name, id)) {
      return { result: { ok: false, error: "duplicate_name" }, changed: false };
    }
    const before = JSON.stringify(d);
    if (patch.name !== undefined) d.name = patch.name;
    if (patch.color !== undefined) d.color = patch.color;
    if (patch.codes !== undefined) d.codes = [...patch.codes];
    const changed = JSON.stringify(d) !== before;
    return {
      result: { ok: true, department: structuredClone(d), changed },
      changed,
    };
  });
}

export type DeleteResult =
  | { ok: true; department: Department }
  | { ok: false; error: "not_found" };

export function deleteDepartment(id: string): Promise<DeleteResult> {
  return file.mutate<DeleteResult>((list) => {
    const i = list.findIndex((x) => x.id === id);
    if (i < 0) return { result: { ok: false, error: "not_found" }, changed: false };
    const [department] = list.splice(i, 1);
    return { result: { ok: true, department }, changed: true };
  });
}
