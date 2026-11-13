import { safeNextPath } from "./redirect";

/**
 * Pages that require an APPROVED login (same rule as the person-level
 * APIs: requireSession()). Pure module, usable by the proxy, server
 * components and client components.
 *
 * Enforced in three places (keep them in sync with this list):
 *  - src/proxy.ts            307 -> /login?callbackUrl=... before render
 *                            (its `config.matcher` must list the same paths)
 *  - <RequireLogin>          server gate around the page data (defense in depth)
 *  - route handlers          requireSession() in /api/kpi/screening/*
 */
export const LOGIN_REQUIRED_PAGES = ["/hospital", "/pp", "/district/pp"] as const;

/** True for /hospital, /pp, /district/pp and their sub-paths (not /ppx). */
export function isLoginRequiredPath(pathname: string): boolean {
  return LOGIN_REQUIRED_PAGES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

/**
 * Relative /login URL that returns to `returnTo` (internal path + query)
 * after sign-in. `returnTo` is validated with safeNextPath(), so /login,
 * /api/* and /auth/* never become a callbackUrl (no redirect loops).
 */
export function loginRedirectPath(returnTo: string): string {
  const next = safeNextPath(returnTo);
  return next === "/"
    ? "/login"
    : `/login?callbackUrl=${encodeURIComponent(next)}`;
}
