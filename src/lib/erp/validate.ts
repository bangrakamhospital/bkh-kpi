import "server-only";

import { ERP_MESSAGES, ErpError } from "./gate";

/**
 * Strict body validation helpers for /api/erp/*. Each throws ErpError 400
 * with a Thai message naming the field; unknown keys are refused.
 */

export type Body = Record<string, unknown>;

export function bad(message: string): never {
  throw new ErpError(400, message);
}

export function asObject(value: unknown, allowed: readonly string[], label = "ข้อมูล"): Body {
  if (!value || typeof value !== "object" || Array.isArray(value)) bad(ERP_MESSAGES.invalidBody);
  const obj = value as Body;
  const extra = Object.keys(obj).filter((k) => !allowed.includes(k));
  if (extra.length > 0) bad(`${label}มีช่องที่ไม่รู้จัก: ${extra.slice(0, 3).join(", ")}`);
  return obj;
}

const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;

/** Trimmed text without control characters (newlines kept when multiline). */
export function text(
  value: unknown,
  label: string,
  opts: { max: number; required?: boolean; multiline?: boolean },
): string {
  if (value === undefined || value === null) {
    if (opts.required) bad(`กรุณากรอก${label}`);
    return "";
  }
  if (typeof value !== "string") bad(`${label}ไม่ถูกต้อง`);
  let v = value.normalize("NFC").replace(CONTROL, "");
  if (!opts.multiline) v = v.replace(/[\r\n\t]+/g, " ");
  v = v.trim();
  if (opts.required && !v) bad(`กรุณากรอก${label}`);
  if (v.length > opts.max) bad(`${label}ยาวเกิน ${opts.max} ตัวอักษร`);
  return v;
}

export function code(value: unknown, label: string, opts: { max: number; required?: boolean }): string | null {
  const v = text(value, label, { max: opts.max, required: opts.required });
  if (!v) return null;
  if (!new RegExp(`^[A-Za-z0-9_.-]{1,${opts.max}}$`).test(v)) {
    bad(`${label}ใช้ได้เฉพาะ A-Z a-z 0-9 _ . - ไม่เกิน ${opts.max} ตัว`);
  }
  return v;
}

export function id(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) bad(`${label}ไม่ถูกต้อง`);
  return value;
}

export function optionalId(value: unknown, label: string): number | null {
  if (value === undefined || value === null) return null;
  return id(value, label);
}

export function bool(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") bad(`${label}ไม่ถูกต้อง`);
  return value;
}

/**
 * Decimal with at most `scale` decimals, min..max. Returned as the exact
 * decimal string for SQL (no float artefacts) plus the number.
 */
export function decimal(
  value: unknown,
  label: string,
  opts: { scale: number; min: number; max: number; minExclusive?: boolean },
): { value: number; sql: string } {
  if (typeof value !== "number" || !Number.isFinite(value)) bad(`${label}ต้องเป็นตัวเลข`);
  if (opts.minExclusive ? value <= opts.min : value < opts.min) {
    bad(`${label}ต้อง${opts.minExclusive ? "มากกว่า" : "ไม่น้อยกว่า"} ${opts.min}`);
  }
  if (value > opts.max) bad(`${label}ต้องไม่เกิน ${opts.max.toLocaleString("en-US")}`);
  const scaled = value * 10 ** opts.scale;
  if (Math.abs(scaled - Math.round(scaled)) > 1e-6) bad(`${label}มีทศนิยมได้ไม่เกิน ${opts.scale} ตำแหน่ง`);
  const sql = value.toFixed(opts.scale);
  return { value: Number(sql), sql };
}

export const QTY = { scale: 3, min: 0, max: 999_999_999 } as const;
export const COST = { scale: 4, min: 0, max: 99_999_999 } as const;

export function isoDate(value: unknown, label: string): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) bad(`${label}ไม่ถูกต้อง`);
  const d = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value) bad(`${label}ไม่ถูกต้อง`);
  const y = Number(value.slice(0, 4));
  if (y < 1990 || y > 2200) bad(`${label}ต้องเป็นปี ค.ศ. (เช่น 2026-11-25)`);
  return value;
}

export function array(value: unknown, label: string, opts: { min: number; max: number }): unknown[] {
  if (!Array.isArray(value)) bad(`${label}ไม่ถูกต้อง`);
  if (value.length < opts.min) bad(`กรุณาเพิ่ม${label}อย่างน้อย ${opts.min} รายการ`);
  if (value.length > opts.max) bad(`${label}ได้ไม่เกิน ${opts.max} รายการ`);
  return value;
}
