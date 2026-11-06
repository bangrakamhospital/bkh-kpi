import { NextResponse, type NextRequest } from "next/server";

import { auditAuth } from "@/lib/auth/audit";
import { readSession } from "@/lib/auth/guard";
import { authJson, clientIp, isSameOrigin } from "@/lib/auth/request";
import { SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth/session";
import type { MeResponse } from "@/lib/auth/types";

/**
 * POST /api/auth/logout -> 200 { loggedIn: false, displayName: null },
 * clears the session cookie. Same-origin only (CSRF).
 * Sessions are stateless: a copied cookie stays valid until it expires.
 */
export async function POST(request: NextRequest): Promise<Response> {
  if (!isSameOrigin(request)) {
    return authJson({ error: "คำขอไม่ถูกต้อง" }, 403);
  }
  const session = readSession(request);
  if (session) auditAuth("logout", session.loginname, clientIp(request));

  const body: MeResponse = { loggedIn: false, displayName: null };
  const response = NextResponse.json(body, {
    headers: { "Cache-Control": "private, no-store" },
  });
  response.cookies.set(SESSION_COOKIE, "", sessionCookieOptions(0));
  return response;
}
