import type { NextRequest } from "next/server";

import { auditUserUpdate } from "@/lib/auth/audit";
import { USER_STORE_UNAVAILABLE_MESSAGE } from "@/lib/auth/messages";
import {
  adminError,
  adminMutationGate,
  readJsonBody,
} from "@/lib/auth/admin-gate";
import { authJson, clientIp } from "@/lib/auth/request";
import { toAdminUser } from "@/lib/users/admin-api";
import { isEnvAdmin, logStoreError } from "@/lib/users/policy";
import { updateUser } from "@/lib/users/store";
import {
  USER_ROLES,
  USER_STATUSES,
  type AdminUserPatch,
  type AdminUserPatchResponse,
  type UserRole,
  type UserStatus,
} from "@/lib/users/types";

/**
 * PATCH /api/admin/users/{sub}   (sub = encodeURIComponent(OIDC sub))
 *   body { "status"?: "approved"|"rejected"|"pending", "role"?: "admin"|"user" }
 *   (Content-Type: application/json, at least one key, no other keys, <= 1 KB)
 * -> 200 { user: AdminUser }
 *    400 invalid body, 401 not logged in, 403 not admin / cross-origin,
 *    404 unknown sub, 409 own account / AUTH_ADMIN_SUBS account / would
 *    remove the last approved admin, 429 rate limited, 503 store error.
 * Same-origin only (Origin must match Host) as CSRF protection.
 */

const MAX_BODY_BYTES = 1024;
const MAX_SUB = 256;

const SELF_MESSAGE = "ไม่สามารถเปลี่ยนสถานะหรือสิทธิ์ของบัญชีตนเองได้";
const ENV_ADMIN_MESSAGE =
  "บัญชีนี้ถูกกำหนดเป็นผู้ดูแลระบบใน AUTH_ADMIN_SUBS แก้ไขได้ที่ค่าตั้งระบบเท่านั้น";
const LAST_ADMIN_MESSAGE = "ต้องมีผู้ดูแลระบบที่อนุมัติแล้วอย่างน้อย 1 คน";
const NOT_FOUND_MESSAGE = "ไม่พบผู้ใช้";
const INVALID_BODY_MESSAGE = "ข้อมูลที่ส่งมาไม่ถูกต้อง";

function parsePatch(json: unknown): AdminUserPatch | null {
  if (!json || typeof json !== "object" || Array.isArray(json)) return null;
  const obj = json as Record<string, unknown>;
  const keys = Object.keys(obj);
  if (keys.length === 0 || keys.some((k) => k !== "status" && k !== "role")) {
    return null;
  }
  const patch: AdminUserPatch = {};
  if ("status" in obj) {
    if (!(USER_STATUSES as readonly unknown[]).includes(obj.status)) return null;
    patch.status = obj.status as UserStatus;
  }
  if ("role" in obj) {
    if (!(USER_ROLES as readonly unknown[]).includes(obj.role)) return null;
    patch.role = obj.role as UserRole;
  }
  return patch;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ sub: string }> },
): Promise<Response> {
  const gate = await adminMutationGate(request, "api/admin/users/[sub]");
  if (!gate.ok) return gate.response;

  const { sub } = await params;
  if (!sub || sub.length > MAX_SUB || /[\u0000-\u001f\u007f]/.test(sub)) {
    return adminError(404, NOT_FOUND_MESSAGE);
  }

  const patch = parsePatch(await readJsonBody(request, MAX_BODY_BYTES));
  if (!patch) return adminError(400, INVALID_BODY_MESSAGE);

  const admin = gate.admin;
  let result;
  try {
    result = await updateUser(
      sub,
      patch,
      { sub: admin.username, name: admin.name },
      isEnvAdmin,
    );
  } catch (err) {
    logStoreError(err);
    return adminError(503, USER_STORE_UNAVAILABLE_MESSAGE);
  }

  if (!result.ok) {
    switch (result.error) {
      case "not_found":
        return adminError(404, NOT_FOUND_MESSAGE);
      case "self":
        return adminError(409, SELF_MESSAGE);
      case "env_admin":
        return adminError(409, ENV_ADMIN_MESSAGE);
      case "last_admin":
        return adminError(409, LAST_ADMIN_MESSAGE);
    }
  }

  if (result.changed) {
    auditUserUpdate({
      actor: admin.username,
      target: result.user.sub,
      from: { status: result.before.status, role: result.before.role },
      to: { status: result.user.status, role: result.user.role },
      ip: clientIp(request.headers),
    });
  }
  const body: AdminUserPatchResponse = { user: toAdminUser(result.user) };
  return authJson(body);
}
