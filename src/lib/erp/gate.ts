import "server-only";

import type { SessionUser } from "@/auth";
import { adminRateLimit } from "@/lib/auth/admin-gate";
import { requireSession } from "@/lib/auth/guard";
import {
  authJson,
  isSameOriginRequest,
  requestMeta,
  type RequestMeta,
} from "@/lib/auth/request";
import { ErpConfigError, ErpDbError, erpQuery, isErpConfigured } from "./db";
import {
  ERP_NOT_CONFIGURED_CODE,
  ERP_NOT_CONFIGURED_MESSAGE,
  isErpRole,
  type ErpMe,
  type ErpRole,
  type ErpRoleGrant,
} from "./types";

/**
 * Gate of every /api/erp/* route handler. Server-side authorization only:
 * the client's role hints are never trusted.
 *
 *   1. requireSession(): approved login, re-checked in users.json (401/503)
 *   2. external auditors (access-code sessions) have no ERP access (403)
 *   3. ERP database configured (503 code=erp_not_configured)
 *   4. rate limit 120 requests / minute / user (429)
 *   5. mutations: Origin must match Host (403, CSRF)
 *   6. ERP roles loaded from erp_user_role on EVERY request (revocation
 *      is immediate); web-app admins count as erp_admin.
 * Every response is `private, no-store`, errors are { error: "<thai>" }.
 */

export class ErpError extends Error {
  override name = "ErpError";
  readonly status: number;
  readonly code: string | undefined;
  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export const ERP_MESSAGES = {
  forbidden: "ไม่มีสิทธิ์ดำเนินการนี้",
  notFound: "ไม่พบข้อมูล",
  invalidBody: "ข้อมูลที่ส่งมาไม่ถูกต้อง",
  stale: "เอกสารถูกแก้ไขโดยผู้อื่นแล้ว กรุณาโหลดหน้าใหม่",
  busy: "มีผู้อื่นกำลังทำรายการเดียวกันอยู่ กรุณาลองใหม่",
  duplicate: "ข้อมูลซ้ำกับที่มีอยู่แล้ว (เช่น รหัสซ้ำ)",
  badReference: "ข้อมูลอ้างอิงไม่ถูกต้อง",
  constraint: "ข้อมูลขัดกับเงื่อนไขของระบบ (เช่น ยอดคงเหลือติดลบ)",
  unavailable: "ระบบ ERP ไม่พร้อมใช้งานในขณะนี้ กรุณาลองใหม่",
  crossOrigin: "คำขอไม่ได้มาจากหน้าเว็บของระบบ",
  rateLimited: "เรียกใช้งานถี่เกินไป กรุณาลองใหม่ภายหลัง",
  auditor: "บัญชีผู้ตรวจภายนอกไม่มีสิทธิ์ใช้ระบบ ERP",
} as const;

export interface ErpActor {
  sub: string;
  name: string;
  appAdmin: boolean;
  roles: ErpRoleGrant[];
  meta: RequestMeta;
}

export function isErpAdmin(a: ErpActor): boolean {
  return a.appAdmin || a.roles.some((r) => r.role === "erp_admin");
}

/** Sees every document / store (read only unless another role allows more). */
export function canViewAll(a: ErpActor): boolean {
  return isErpAdmin(a) || a.roles.some((r) => r.role === "finance" || r.role === "director");
}

export function hasUnitRole(a: ErpActor, roles: readonly ErpRole[], orgUnitId: number): boolean {
  return a.roles.some((r) => roles.includes(r.role) && r.orgUnitId === orgUnitId);
}

export function unitIdsWithRole(a: ErpActor, roles: readonly ErpRole[]): number[] {
  return [
    ...new Set(
      a.roles.flatMap((r) => (roles.includes(r.role) && r.orgUnitId !== null ? [r.orgUnitId] : [])),
    ),
  ];
}

export function isStoreOfficer(a: ErpActor, storeId: number): boolean {
  return a.roles.some(
    (r) => r.role === "store_officer" && (r.storeId === null || r.storeId === storeId),
  );
}

/** null = every store; [] = none. */
export function officerStoreIds(a: ErpActor): number[] | null {
  const grants = a.roles.filter((r) => r.role === "store_officer");
  if (grants.some((r) => r.storeId === null)) return null;
  return [...new Set(grants.flatMap((r) => (r.storeId === null ? [] : [r.storeId])))];
}

export function toErpMe(a: ErpActor): ErpMe {
  return { sub: a.sub, name: a.name, appAdmin: a.appAdmin, roles: a.roles };
}

export function erpJson(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return authJson(body, status, headers);
}

export function erpErrorResponse(status: number, error: string, code?: string): Response {
  return authJson(code ? { error, code } : { error }, status);
}

/** Map any thrown error to a JSON response (no internal details leak). */
export function erpFailure(err: unknown, route: string): Response {
  if (err instanceof ErpError) return erpErrorResponse(err.status, err.message, err.code);
  if (err instanceof ErpConfigError) {
    return erpErrorResponse(503, ERP_NOT_CONFIGURED_MESSAGE, ERP_NOT_CONFIGURED_CODE);
  }
  if (err instanceof ErpDbError) {
    switch (err.code) {
      case "23505":
        return erpErrorResponse(409, ERP_MESSAGES.duplicate);
      case "23503":
        return erpErrorResponse(400, ERP_MESSAGES.badReference);
      case "23514":
      case "23502":
        return erpErrorResponse(409, ERP_MESSAGES.constraint);
      case "40001":
      case "40P01":
      case "55P03":
        return erpErrorResponse(409, ERP_MESSAGES.busy);
      case "22P02":
      case "22003":
      case "22007":
      case "22008":
        return erpErrorResponse(400, ERP_MESSAGES.invalidBody);
    }
    console.error(
      `[${route}] ERP database error (${err.code ?? "unknown"}${err.constraint ? ` ${err.constraint}` : ""})`,
    );
    return erpErrorResponse(503, ERP_MESSAGES.unavailable);
  }
  console.error(`[${route}] unexpected error (${err instanceof Error ? err.name : "error"})`);
  return erpErrorResponse(500, ERP_MESSAGES.unavailable);
}

async function loadRoles(sub: string): Promise<ErpRoleGrant[]> {
  const rows = await erpQuery<{ role: string; org_unit_id: number | null; store_id: number | null }>(
    `SELECT r.role, r.org_unit_id, r.store_id
       FROM erp_user_role r
       LEFT JOIN org_unit u ON u.id = r.org_unit_id
       LEFT JOIN store s ON s.id = r.store_id
      WHERE r.sub = $1
        AND (r.org_unit_id IS NULL OR u.active)
        AND (r.store_id IS NULL OR s.active)`,
    [sub],
  );
  return rows.flatMap((r) =>
    isErpRole(r.role) ? [{ role: r.role, orgUnitId: r.org_unit_id, storeId: r.store_id }] : [],
  );
}

export type ErpGate = { ok: true; actor: ErpActor } | { ok: false; response: Response };

export async function erpGate(
  request: Request,
  route: string,
  options: { mutation?: boolean } = {},
): Promise<ErpGate> {
  const session = await requireSession(route);
  if (!session.ok) return session;
  const user: SessionUser = session.user;
  if (user.provider === "access-code") {
    return { ok: false, response: erpErrorResponse(403, ERP_MESSAGES.auditor) };
  }
  if (!isErpConfigured()) {
    return {
      ok: false,
      response: erpErrorResponse(503, ERP_NOT_CONFIGURED_MESSAGE, ERP_NOT_CONFIGURED_CODE),
    };
  }
  const retryAfter = adminRateLimit(`erp|${user.username}`);
  if (retryAfter > 0) {
    return {
      ok: false,
      response: authJson({ error: ERP_MESSAGES.rateLimited }, 429, {
        "Retry-After": String(retryAfter),
      }),
    };
  }
  if (options.mutation && !isSameOriginRequest(request.headers)) {
    return { ok: false, response: erpErrorResponse(403, ERP_MESSAGES.crossOrigin) };
  }
  let roles: ErpRoleGrant[];
  try {
    roles = await loadRoles(user.username);
  } catch (err) {
    return { ok: false, response: erpFailure(err, route) };
  }
  return {
    ok: true,
    actor: {
      sub: user.username,
      name: user.name,
      appAdmin: user.role === "admin",
      roles,
      meta: requestMeta(request.headers),
    },
  };
}

/** erpGate + erp_admin (or web-app admin) required. */
export async function erpAdminGate(
  request: Request,
  route: string,
  options: { mutation?: boolean } = {},
): Promise<ErpGate> {
  const gate = await erpGate(request, route, options);
  if (!gate.ok) return gate;
  if (!isErpAdmin(gate.actor)) {
    return { ok: false, response: erpErrorResponse(403, ERP_MESSAGES.forbidden) };
  }
  return gate;
}

/** Positive integer id from a route param / query value (else null). */
export function parseId(value: string | null | undefined): number | null {
  if (!value || !/^\d{1,12}$/.test(value)) return null;
  const n = Number(value);
  return n > 0 && Number.isSafeInteger(n) ? n : null;
}

/** Run a handler body; any thrown error becomes a safe JSON response. */
export async function erpHandle(route: string, fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (err) {
    return erpFailure(err, route);
  }
}
