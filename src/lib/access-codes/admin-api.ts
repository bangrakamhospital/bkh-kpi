import "server-only";

import { adminError } from "@/lib/auth/admin-gate";
import { logStoreError } from "@/lib/users/policy";
import { cleanField } from "@/lib/users/store";
import { accessCodeStatus, type AccessCodeRecord } from "./store";
import {
  ACCESS_CODE_MAX_DAYS,
  ACCESS_CODE_NAME_MAX,
  ACCESS_CODE_ORG_MAX,
  accessCodeExpiry,
  addDays,
  bangkokToday,
  type AccessCodeView,
} from "./types";

/** Shared helpers of /api/admin/access-codes/** (Thai error messages). */

export const MAX_ACCESS_CODE_BODY_BYTES = 2048;

export const ACCESS_CODE_MESSAGES = {
  invalidBody: "ข้อมูลที่ส่งมาไม่ถูกต้อง",
  nameRequired: `กรุณาระบุชื่อผู้ตรวจ (1–${ACCESS_CODE_NAME_MAX} ตัวอักษร)`,
  orgRequired: `กรุณาระบุหน่วยงาน (1–${ACCESS_CODE_ORG_MAX} ตัวอักษร)`,
  expiryInvalid: `วันหมดอายุต้องอยู่ระหว่างวันนี้ถึง ${ACCESS_CODE_MAX_DAYS} วันข้างหน้า`,
  notFound: "ไม่พบลิงก์ผู้ตรวจภายนอก",
  tooMany: "จำนวนลิงก์ผู้ตรวจเกินที่ระบบกำหนด กรุณาติดต่อผู้ดูแลระบบ",
  notConfigured:
    "ยังสร้างลิงก์ผู้ตรวจไม่ได้: ยังไม่ได้ตั้งค่า AUTH_SECRET (อย่างน้อย 32 ตัวอักษร)",
  unavailable: "ไม่สามารถบันทึกหรืออ่านข้อมูลลิงก์ผู้ตรวจได้ในขณะนี้ กรุณาลองใหม่",
} as const;

export function accessCodeStoreFailure(err: unknown): Response {
  logStoreError(err);
  return adminError(503, ACCESS_CODE_MESSAGES.unavailable);
}

/** API shape: explicit field list, never the hash. */
export function toAccessCodeView(
  r: AccessCodeRecord,
  now: number = Date.now(),
): AccessCodeView {
  return {
    id: r.id,
    name: r.name,
    org: r.org,
    createdAt: r.createdAt,
    createdBy: { sub: r.createdBy.sub, name: r.createdBy.name },
    expiresAt: r.expiresAt,
    lastUsedAt: r.lastUsedAt,
    useCount: r.useCount,
    revokedAt: r.revokedAt,
    revokedBy: r.revokedBy
      ? { sub: r.revokedBy.sub, name: r.revokedBy.name }
      : null,
    status: accessCodeStatus(r, now),
  };
}

type Check<T> = { ok: true; value: T } | { ok: false; error: string };

/**
 * POST body { name, org, expiresOn: "YYYY-MM-DD" } (no other keys).
 * expiresOn is a Bangkok calendar day in [today, today + MAX_DAYS]; the
 * code is valid until the end of that day, capped at now + MAX_DAYS.
 */
export function parseAccessCodeCreate(
  json: unknown,
  now: Date = new Date(),
): Check<{ name: string; org: string; expiresAt: string }> {
  if (!json || typeof json !== "object" || Array.isArray(json)) {
    return { ok: false, error: ACCESS_CODE_MESSAGES.invalidBody };
  }
  const obj = json as Record<string, unknown>;
  if (
    Object.keys(obj).some((k) => k !== "name" && k !== "org" && k !== "expiresOn")
  ) {
    return { ok: false, error: ACCESS_CODE_MESSAGES.invalidBody };
  }
  const name = cleanField(
    typeof obj.name === "string" ? obj.name.normalize("NFC") : "",
    ACCESS_CODE_NAME_MAX + 1,
  );
  if (!name || name.length > ACCESS_CODE_NAME_MAX) {
    return { ok: false, error: ACCESS_CODE_MESSAGES.nameRequired };
  }
  const org = cleanField(
    typeof obj.org === "string" ? obj.org.normalize("NFC") : "",
    ACCESS_CODE_ORG_MAX + 1,
  );
  if (!org || org.length > ACCESS_CODE_ORG_MAX) {
    return { ok: false, error: ACCESS_CODE_MESSAGES.orgRequired };
  }
  const day = obj.expiresOn;
  const today = bangkokToday(now);
  if (
    typeof day !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(day) ||
    Number.isNaN(Date.parse(`${day}T00:00:00Z`)) ||
    // Rejects impossible dates such as 2026-02-30 (Date rolls them over).
    new Date(`${day}T00:00:00Z`).toISOString().slice(0, 10) !== day ||
    day < today ||
    day > addDays(today, ACCESS_CODE_MAX_DAYS)
  ) {
    return { ok: false, error: ACCESS_CODE_MESSAGES.expiryInvalid };
  }
  // Strictly <= ACCESS_CODE_MAX_DAYS from now (clamped on the last day).
  return { ok: true, value: { name, org, expiresAt: accessCodeExpiry(day, now) } };
}
