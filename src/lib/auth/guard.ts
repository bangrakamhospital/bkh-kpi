import "server-only";

import { connection } from "next/server";

import { auth, sessionUser, type SessionUser } from "@/auth";
import {
  AUTH_DISABLED_MESSAGE,
  LOGIN_REQUIRED_MESSAGE,
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
 *  - auth not configured (AUTH_SECRET) -> 503
 *  - no / invalid / expired session    -> 401 { error: "กรุณาเข้าสู่ระบบ" }
 * Both responses are `private, no-store`.
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
  return { ok: true, user };
}
