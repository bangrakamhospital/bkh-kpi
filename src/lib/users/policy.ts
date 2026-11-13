import "server-only";

import {
  accessCodeStatus,
  getAccessCode,
  isValidAccessCodeId,
} from "../access-codes/store";
import { ACCESS_CODE_USERNAME_PREFIX } from "../access-codes/types";
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

/**
 * How the session was created (stored in the JWT).
 * "access-code" = external auditor (src/lib/access-codes), always role "user".
 */
export type SessionProvider = "sso" | "password" | "access-code";

export function isSessionProvider(v: unknown): v is SessionProvider {
  return v === "sso" || v === "password" || v === "access-code";
}

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

/** Extra session info of an external auditor (header badge). */
export interface AuditorAccess {
  /** Access-code record id. */
  codeId: string;
  /** ISO 8601 expiry of the code. */
  expiresAt: string;
}

export type Access =
  | { ok: true; role: UserRole; auditor?: AuditorAccess }
  | {
      ok: false;
      reason:
        | "unknown_user"
        | "pending"
        | "rejected"
        | "password_login_disabled"
        | "access_code_expired"
        | "access_code_revoked"
        | "invalid_session"
        | "store_error";
    };

/**
 * Current access of a session user.
 *  - SSO: AUTH_ADMIN_SUBS -> admin; else the store record must exist and be
 *    approved (role from the store). Store unreadable -> denied (fail closed).
 *  - Password (break-glass, AUTH_PASSWORD_LOGIN=true): admin while
 *    AUTH_PASSWORD_LOGIN is still "true"; turning it off revokes the session.
 *  - Access code (external auditor): the code record must exist, not be
 *    revoked and not be expired -> role "user" (NEVER admin, whatever the
 *    store says). Revocation / expiry ends the session on the next read.
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
  if (provider === "access-code") return resolveAuditorAccess(username);
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

async function resolveAuditorAccess(username: string): Promise<Access> {
  if (!username.startsWith(ACCESS_CODE_USERNAME_PREFIX)) {
    return { ok: false, reason: "invalid_session" };
  }
  const id = username.slice(ACCESS_CODE_USERNAME_PREFIX.length);
  if (!isValidAccessCodeId(id)) return { ok: false, reason: "invalid_session" };
  try {
    const rec = await getAccessCode(id);
    if (!rec) return { ok: false, reason: "unknown_user" };
    const status = accessCodeStatus(rec);
    if (status === "revoked") return { ok: false, reason: "access_code_revoked" };
    if (status === "expired") return { ok: false, reason: "access_code_expired" };
    return {
      ok: true,
      role: "user",
      auditor: { codeId: rec.id, expiresAt: rec.expiresAt },
    };
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
