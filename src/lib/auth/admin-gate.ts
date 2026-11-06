import "server-only";

import type { SessionUser } from "@/auth";
import { requireAdmin } from "./guard";
import { authJson, isSameOriginRequest } from "./request";

/**
 * Shared gate for /api/admin/* route handlers (users, departments):
 *  - adminGate(route)            requireAdmin (401/403/503) + rate limit (429)
 *  - adminMutationGate(req, ..)  + same-origin check (403) for POST/PATCH/DELETE
 *  - readJsonBody(req)           application/json, <= maxBytes, parsed
 * Every response is `private, no-store`, errors are { error: "<thai>" }.
 */

export type AdminGate =
  | { ok: true; admin: SessionUser }
  | { ok: false; response: Response };

const CROSS_ORIGIN_MESSAGE = "คำขอไม่ได้มาจากหน้าเว็บของระบบ";
const RATE_LIMITED_MESSAGE = "เรียกใช้งานถี่เกินไป กรุณาลองใหม่ภายหลัง";

export function adminError(
  status: number,
  error: string,
  headers: Record<string, string> = {},
): Response {
  return authJson({ error }, status, headers);
}

// --- rate limit: 120 requests / admin / minute (per process) -------------

const WINDOW_MS = 60_000;
const MAX_REQUESTS = 120;
const MAX_KEYS = 1000;

interface Bucket {
  count: number;
  resetAt: number;
}

const globalForLimiter = globalThis as unknown as {
  __adminApiLimiter?: Map<string, Bucket>;
};
const buckets: Map<string, Bucket> = (globalForLimiter.__adminApiLimiter ??=
  new Map());

/** Seconds until the next request is allowed, or 0 (request counted). */
export function adminRateLimit(actor: string, now = Date.now()): number {
  if (buckets.size > MAX_KEYS) {
    for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
    if (buckets.size > MAX_KEYS) buckets.clear();
  }
  const b = buckets.get(actor);
  if (!b || b.resetAt <= now) {
    buckets.set(actor, { count: 1, resetAt: now + WINDOW_MS });
    return 0;
  }
  if (b.count >= MAX_REQUESTS) return Math.ceil((b.resetAt - now) / 1000);
  b.count += 1;
  return 0;
}

// --- gates ----------------------------------------------------------------

export async function adminGate(route: string): Promise<AdminGate> {
  const result = await requireAdmin(route);
  if (!result.ok) return result;
  const retryAfter = adminRateLimit(result.user.username);
  if (retryAfter > 0) {
    return {
      ok: false,
      response: adminError(429, RATE_LIMITED_MESSAGE, {
        "Retry-After": String(retryAfter),
      }),
    };
  }
  return { ok: true, admin: result.user };
}

/** adminGate + Origin must match Host (CSRF) for state-changing methods. */
export async function adminMutationGate(
  request: Request,
  route: string,
): Promise<AdminGate> {
  const gate = await adminGate(route);
  if (!gate.ok) return gate;
  if (!isSameOriginRequest(request.headers)) {
    return { ok: false, response: adminError(403, CROSS_ORIGIN_MESSAGE) };
  }
  return gate;
}

/**
 * JSON body (Content-Type application/json, <= maxBytes). `undefined` =
 * wrong type / too large / not JSON (-> 400).
 */
export async function readJsonBody(
  request: Request,
  maxBytes = 1024,
): Promise<unknown> {
  const type = (request.headers.get("content-type") ?? "").trim();
  if (!/^application\/json(\s*;|$)/i.test(type)) return undefined;
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > maxBytes) return undefined;
  try {
    const text = await request.text();
    if (Buffer.byteLength(text, "utf8") > maxBytes) return undefined;
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}
