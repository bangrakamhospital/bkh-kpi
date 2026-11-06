import "server-only";

/**
 * Auth settings read from env at request time (server only).
 * Real values live in env / .env.local — never in code (public repo).
 */

/** Absolute session lifetime: 8 hours from login (not extended by activity). */
export const SESSION_MAX_AGE_SECONDS = 8 * 60 * 60;

const MIN_SECRET_LENGTH = 32;

/**
 * Auth.js signs/encrypts the session JWT with AUTH_SECRET. Missing or
 * shorter than 32 characters -> login is DISABLED (no default secret).
 */
export function isAuthConfigured(): boolean {
  return (process.env.AUTH_SECRET ?? "").length >= MIN_SECRET_LENGTH;
}

/**
 * Secure (and `__Secure-` / `__Host-` prefixed) cookies in production.
 * AUTH_COOKIE_INSECURE=true turns this off for plain-HTTP intranet
 * deployments (browsers drop Secure cookies on http://). Set explicitly
 * instead of Auth.js' URL-protocol detection so route handlers and
 * `auth()` always agree on the cookie name behind a reverse proxy.
 */
export function secureCookiesEnabled(): boolean {
  if (process.env.AUTH_COOKIE_INSECURE?.trim().toLowerCase() === "true") {
    return false;
  }
  return process.env.NODE_ENV === "production";
}
