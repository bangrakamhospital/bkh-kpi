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

/** Client IP + user agent of a request, for the audit log. */
export interface RequestMeta {
  ip: string;
  userAgent: string;
}

const MAX_USER_AGENT = 200;

export function requestMeta(headers: Headers | null | undefined): RequestMeta {
  const ua = headers?.get("user-agent") ?? "";
  return {
    ip: clientIp(headers),
    userAgent: ua
      .replace(/[\u0000-\u001f\u007f]+/g, " ")
      .trim()
      .slice(0, MAX_USER_AGENT),
  };
}

/** Strip control chars / limit length before writing to logs. */
export function logSafe(value: string, max = 64): string {
  return value.replace(/[\u0000-\u001f\u007f\s]+/g, "_").slice(0, max);
}

/**
 * CSRF check for state-changing route handlers outside /api/auth: the
 * browser's Origin must be this host (nginx forwards Host: $http_host),
 * and Sec-Fetch-Site, when sent, must be "same-origin". Requests without
 * an Origin header are refused (browsers always send it on PATCH/POST
 * fetches).
 */
export function isSameOriginRequest(headers: Headers): boolean {
  const site = headers.get("sec-fetch-site");
  if (site && site !== "same-origin") return false;
  const origin = headers.get("origin");
  if (!origin || origin === "null") return false;
  const host = (headers.get("x-forwarded-host") ?? headers.get("host"))
    ?.split(",")[0]
    ?.trim()
    .toLowerCase();
  if (!host) return false;
  try {
    const url = new URL(origin);
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;
    return url.host.toLowerCase() === host;
  } catch {
    return false;
  }
}
