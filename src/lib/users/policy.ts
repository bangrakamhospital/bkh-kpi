import "server-only";

import type { UserRole } from "./types";
import { getUser, UserStoreError } from "./store";

/**
 * Who may use the protected parts of the app (person lists, Excel export,
 * /api/admin/*). Read from env + the user store on EVERY request, so a
 * rejection / role change by an admin applies immediately.
 *
 * Env (server-only, comma-separated):
 *   AUTH_ADMIN_SUBS              Provider ID `sub` values that are ALWAYS
 *                                approved admins (cannot be changed in the UI).
 *   AUTH_BOOTSTRAP_ADMIN_FNAMES  first names (exact match, e.g. ปริยศักดิ์): such
 *                                a user is promoted to approved admin on SSO
 *                                sign-in, but only while the store has no
 *                                approved admin and the org allow-list is not
 *                                "*". Replace with AUTH_ADMIN_SUBS after the
 *                                first login (first names are not unique).
 */

/** How the session was created (stored in the JWT). */
export type SessionProvider = "sso" | "password";

function list(name: string): string[] {
  return (process.env[name] ?? "")
    .split(",")
    .map((s) => s.normalize("NFC").trim())
    .filter(Boolean);
}

export function isEnvAdmin(sub: string): boolean {
  return sub !== "" && list("AUTH_ADMIN_SUBS").includes(sub);
}

let warnedBootstrapAnyOrg = false;

/** fname matches AUTH_BOOTSTRAP_ADMIN_FNAMES (exact, NFC, trimmed). */
export function isBootstrapAdminName(fname: string): boolean {
  const name = fname.normalize("NFC").trim();
  if (!name || !list("AUTH_BOOTSTRAP_ADMIN_FNAMES").includes(name)) {
    return false;
  }
  // "*" = any Provider ID account nationwide: a first name is far too weak.
  const orgs = list("AUTH_PLKHEALTH_ALLOWED_ORGS");
  if (orgs.includes("*")) {
    if (!warnedBootstrapAnyOrg) {
      warnedBootstrapAnyOrg = true;
      console.warn(
        '[auth] AUTH_BOOTSTRAP_ADMIN_FNAMES ignored: AUTH_PLKHEALTH_ALLOWED_ORGS is "*"; use AUTH_ADMIN_SUBS',
      );
    }
    return false;
  }
  return true;
}

export function passwordLoginEnabled(): boolean {
  return process.env.AUTH_PASSWORD_LOGIN?.trim().toLowerCase() === "true";
}

export type Access =
  | { ok: true; role: UserRole }
  | {
      ok: false;
      reason:
        | "unknown_user"
        | "pending"
        | "rejected"
        | "password_login_disabled"
        | "invalid_session"
        | "store_error";
    };

/**
 * Current access of a session user.
 *  - SSO: AUTH_ADMIN_SUBS -> admin; else the store record must exist and be
 *    approved (role from the store). Store unreadable -> denied (fail closed).
 *  - Password (break-glass, AUTH_PASSWORD_LOGIN=true): admin while
 *    AUTH_PASSWORD_LOGIN is still "true"; turning it off revokes the session.
 */
export async function resolveAccess(
  username: string,
  provider: unknown,
): Promise<Access> {
  if (!username) return { ok: false, reason: "invalid_session" };
  if (provider === "password") {
    return passwordLoginEnabled()
      ? { ok: true, role: "admin" }
      : { ok: false, reason: "password_login_disabled" };
  }
  // Sessions issued before user management have no provider: re-login.
  if (provider !== "sso") return { ok: false, reason: "invalid_session" };
  if (isEnvAdmin(username)) return { ok: true, role: "admin" };
  try {
    const user = await getUser(username);
    if (!user) return { ok: false, reason: "unknown_user" };
    if (user.status === "pending") return { ok: false, reason: "pending" };
    if (user.status === "rejected") return { ok: false, reason: "rejected" };
    return { ok: true, role: user.role };
  } catch (err) {
    logStoreError(err);
    return { ok: false, reason: "store_error" };
  }
}

let lastStoreErrorLog = 0;

/** One short line (rate-limited to once a minute), never file contents. */
export function logStoreError(err: unknown) {
  const now = Date.now();
  if (now - lastStoreErrorLog < 60_000) return;
  lastStoreErrorLog = now;
  const msg =
    err instanceof UserStoreError
      ? err.message
      : err instanceof Error
        ? err.name
        : "unknown error";
  console.error(`[users] store error: ${msg.slice(0, 120)}`);
}
