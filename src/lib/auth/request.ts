import "server-only";

import type { NextRequest } from "next/server";

/**
 * Request helpers for auth route handlers.
 */

const NO_STORE = "private, no-store";

export function authJson(
  body: unknown,
  status = 200,
  extraHeaders: Record<string, string> = {},
): Response {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": NO_STORE, ...extraHeaders },
  });
}

/**
 * CSRF check for state-changing POSTs (route handlers are not covered by
 * the Server Action origin check). The Origin header must match the host
 * the request was sent to (X-Forwarded-Host when behind a reverse proxy).
 * Without Origin, only `Sec-Fetch-Site: same-origin` is accepted.
 */
export function isSameOrigin(request: NextRequest): boolean {
  const host = (
    request.headers.get("x-forwarded-host") ??
    request.headers.get("host") ??
    ""
  )
    .split(",")[0]
    .trim()
    .toLowerCase();
  const origin = request.headers.get("origin");
  if (origin) {
    if (!host || origin === "null") return false;
    try {
      return new URL(origin).host.toLowerCase() === host;
    } catch {
      return false;
    }
  }
  return request.headers.get("sec-fetch-site") === "same-origin";
}

/**
 * Best-effort client IP for rate limiting / audit. X-Forwarded-For is
 * trusted only as far as the reverse proxy sets it; without a proxy it
 * can be spoofed (the per-IP limit then degrades, per-user still applies
 * per spoofed value). Never used for authorization.
 */
export function clientIp(request: NextRequest): string {
  const xff = request.headers.get("x-forwarded-for");
  const first = xff?.split(",")[0]?.trim();
  const ip = first || request.headers.get("x-real-ip")?.trim() || "unknown";
  return ip.slice(0, 64);
}

/** Strip control chars / limit length before writing to logs. */
export function logSafe(value: string, max = 64): string {
  return value.replace(/[\u0000-\u001f\u007f\s]+/g, "_").slice(0, max);
}
