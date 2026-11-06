import "server-only";

import { adminError } from "@/lib/auth/admin-gate";
import { logStoreError } from "@/lib/users/policy";

/** Shared responses of /api/admin/departments/** (Thai error messages). */

export const MAX_DEPARTMENT_BODY_BYTES = 4096;

export const DEPARTMENT_MESSAGES = {
  invalidBody: "ข้อมูลที่ส่งมาไม่ถูกต้อง",
  notFound: "ไม่พบแผนก",
  duplicateName: "มีแผนกชื่อนี้อยู่แล้ว",
  tooMany: "จำนวนแผนกเกินที่กำหนด (50)",
  unavailable: "ไม่สามารถบันทึกข้อมูลแผนกได้ในขณะนี้ กรุณาลองใหม่",
} as const;

export function departmentStoreFailure(err: unknown): Response {
  logStoreError(err);
  return adminError(503, DEPARTMENT_MESSAGES.unavailable);
}
