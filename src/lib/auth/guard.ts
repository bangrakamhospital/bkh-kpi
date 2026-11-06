import "server-only";

import type { NextRequest } from "next/server";

import { authJson } from "./request";
import {
  isAuthConfigured,
  SESSION_COOKIE,
  unsealSession,
  type Session,
} from "./session";

export const LOGIN_REQUIRED_MESSAGE = "กรุณาเข้าสู่ระบบ";
export const AUTH_DISABLED_MESSAGE =
  "ระบบเข้าสู่ระบบยังไม่พร้อมใช้งาน กรุณาติดต่อผู้ดูแลระบบ";

/** Reads the session from the request cookie (null = not logged in). */
export function readSession(request: NextRequest): Session | null {
  return unsealSession(request.cookies.get(SESSION_COOKIE)?.value);
}

export type RequireSessionResult =
  | { ok: true; session: Session }
  | { ok: false; response: Response };

/**
 * Authorization gate for route handlers returning patient-identifiable
 * data. Call FIRST in the handler (before validation / data access):
 *  - auth not configured (AUTH_SECRET) -> 503
 *  - no / invalid / expired session    -> 401 { error: "กรุณาเข้าสู่ระบบ" }
 * Both responses are `private, no-store`.
 */
export function requireSession(
  request: NextRequest,
  route: string,
): RequireSessionResult {
  // Touch the request FIRST: with Cache Components, GET handlers are
  // prerendered at build until they read request data. Reading the cookie
  // before anything env-dependent guarantees this runs per request (the
  // build-time AUTH_SECRET must never decide the response).
  const raw = request.cookies.get(SESSION_COOKIE)?.value;
  if (!isAuthConfigured()) {
    console.error(
      `[${route}] auth disabled: AUTH_SECRET missing or shorter than 32 characters`,
    );
    return { ok: false, response: authJson({ error: AUTH_DISABLED_MESSAGE }, 503) };
  }
  const session = unsealSession(raw);
  if (!session) {
    return {
      ok: false,
      response: authJson({ error: LOGIN_REQUIRED_MESSAGE }, 401),
    };
  }
  return { ok: true, session };
}
