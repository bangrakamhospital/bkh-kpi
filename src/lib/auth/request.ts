import "server-only";

/**
 * Request helpers for auth code (route handlers and Auth.js callbacks).
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
 * Best-effort client IP for rate limiting / audit. X-Forwarded-For is
 * trusted only as far as the reverse proxy sets it; without a proxy it
 * can be spoofed (the per-IP limit then degrades, per-user still applies
 * per spoofed value). Never used for authorization.
 */
export function clientIp(headers: Headers | null | undefined): string {
  const xff = headers?.get("x-forwarded-for");
  const first = xff?.split(",")[0]?.trim();
  const ip = first || headers?.get("x-real-ip")?.trim() || "unknown";
  return ip.slice(0, 64);
}

/** Strip control chars / limit length before writing to logs. */
export function logSafe(value: string, max = 64): string {
  return value.replace(/[\u0000-\u001f\u007f\s]+/g, "_").slice(0, max);
}
