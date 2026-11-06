import "server-only";

import { connection } from "next/server";

import { auth, sessionUser, type SessionUser } from "@/auth";
import { resolveAccess } from "@/lib/users/policy";
import {
  ADMIN_ONLY_MESSAGE,
  AUTH_DISABLED_MESSAGE,
  LOGIN_REQUIRED_MESSAGE,
  USER_STORE_UNAVAILABLE_MESSAGE,
} from "./messages";
import { authJson } from "./request";
import { isAuthConfigured } from "./settings";

export type RequireSessionResult =
  | { ok: true; user: SessionUser }
  | { ok: false; response: Response };

/**
 * Authorization gate for route handlers returning patient-identifiable
 * data (Auth.js session). Call it FIRST in the handler (before validation /
 * data access):
 *  - auth not configured (AUTH_SECRET)          -> 503
 *  - no / invalid / expired session             -> 401 { error: "กรุณาเข้าสู่ระบบ" }
 *  - user no longer approved (re-checked in the
 *    user store on every request) / unknown     -> 401 (client logs out)
 *  - user store unreadable                      -> 503 (fail closed)
 * All responses are `private, no-store`. `user.role` is the CURRENT role.
 */
export async function requireSession(
  route: string,
): Promise<RequireSessionResult> {
  // Per request, never prerendered: the build-time env must not decide
  // the response (Cache Components prerenders GET handlers otherwise).
  await connection();
  if (!isAuthConfigured()) {
    console.error(
      `[${route}] auth disabled: AUTH_SECRET missing or shorter than 32 characters`,
    );
    return { ok: false, response: authJson({ error: AUTH_DISABLED_MESSAGE }, 503) };
  }
  const user = sessionUser(await auth());
  if (!user) {
    return {
      ok: false,
      response: authJson({ error: LOGIN_REQUIRED_MESSAGE }, 401),
    };
  }
  // Explicit re-check (the jwt callback does it too): revocation must not
  // depend on Auth.js internals.
  const access = await resolveAccess(user.username, user.provider);
  if (!access.ok) {
    return {
      ok: false,
      response:
        access.reason === "store_error"
          ? authJson({ error: USER_STORE_UNAVAILABLE_MESSAGE }, 503)
          : authJson({ error: LOGIN_REQUIRED_MESSAGE }, 401),
    };
  }
  return { ok: true, user: { ...user, role: access.role } };
}

/**
 * Gate for /api/admin/*: requireSession + current role "admin"
 * (403 { error: "เฉพาะผู้ดูแลระบบเท่านั้น" } otherwise).
 */
export async function requireAdmin(
  route: string,
): Promise<RequireSessionResult> {
  const result = await requireSession(route);
  if (!result.ok) return result;
  if (result.user.role !== "admin") {
    return { ok: false, response: authJson({ error: ADMIN_ONLY_MESSAGE }, 403) };
  }
  return result;
}
