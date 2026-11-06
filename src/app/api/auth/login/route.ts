import { NextResponse, type NextRequest } from "next/server";

import { auditAuth } from "@/lib/auth/audit";
import { AUTH_DISABLED_MESSAGE } from "@/lib/auth/guard";
import { getAuthProvider } from "@/lib/auth/provider";
import {
  loginRetryAfter,
  recordLoginFailure,
  recordLoginSuccess,
} from "@/lib/auth/rate-limit";
import { authJson, clientIp, isSameOrigin } from "@/lib/auth/request";
import {
  isAuthConfigured,
  SESSION_COOKIE,
  sealSession,
  sessionCookieOptions,
} from "@/lib/auth/session";
import type { MeResponse } from "@/lib/auth/types";

/**
 * POST /api/auth/login  body: { username, password } (application/json)
 * -> 200 { loggedIn: true, displayName } + session cookie
 * -> 400 invalid body, 401 wrong credentials (generic message),
 *    403 cross-origin, 429 too many attempts, 503 auth disabled / provider error.
 */

const INVALID_CREDENTIALS = "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง";
const MAX_USERNAME = 64;
const MAX_PASSWORD = 128;
const MAX_BODY_BYTES = 4096;

async function readCredentials(
  request: NextRequest,
): Promise<{ username: string; password: string } | null> {
  const type = request.headers.get("content-type") ?? "";
  if (!type.toLowerCase().startsWith("application/json")) return null;
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) return null;
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return null;
  }
  if (!body || typeof body !== "object") return null;
  const { username, password } = body as Record<string, unknown>;
  if (typeof username !== "string" || typeof password !== "string") return null;
  const u = username.trim();
  if (
    u.length === 0 ||
    u.length > MAX_USERNAME ||
    password.length === 0 ||
    password.length > MAX_PASSWORD
  ) {
    return null;
  }
  return { username: u, password };
}

export async function POST(request: NextRequest): Promise<Response> {
  if (!isSameOrigin(request)) {
    return authJson({ error: "คำขอไม่ถูกต้อง" }, 403);
  }
  if (!isAuthConfigured()) {
    console.error(
      "[api/auth/login] auth disabled: AUTH_SECRET missing or shorter than 32 characters",
    );
    return authJson({ error: AUTH_DISABLED_MESSAGE }, 503);
  }

  const creds = await readCredentials(request);
  if (!creds) {
    return authJson({ error: "กรุณากรอกชื่อผู้ใช้และรหัสผ่าน" }, 400);
  }

  const ip = clientIp(request);
  const retryAfter = loginRetryAfter(ip, creds.username);
  if (retryAfter > 0) {
    auditAuth("login_rate_limited", creds.username, ip);
    const minutes = Math.ceil(retryAfter / 60);
    return authJson(
      {
        error: `พยายามเข้าสู่ระบบหลายครั้งเกินไป กรุณาลองใหม่ในอีก ${minutes} นาที`,
      },
      429,
      { "Retry-After": String(retryAfter) },
    );
  }

  let user;
  try {
    user = await getAuthProvider().verify(creds.username, creds.password);
  } catch (err) {
    const name = err instanceof Error ? err.name : "UnknownError";
    const code =
      err && typeof err === "object" && "code" in err
        ? String((err as { code: unknown }).code ?? "")
        : "";
    console.error(
      `[api/auth/login] provider error: ${name}${code ? ` (${code})` : ""}`,
    );
    return authJson(
      { error: "ไม่สามารถตรวจสอบบัญชีผู้ใช้ได้ในขณะนี้ กรุณาลองใหม่" },
      503,
    );
  }

  if (!user) {
    recordLoginFailure(ip, creds.username);
    auditAuth("login_failed", creds.username, ip);
    return authJson({ error: INVALID_CREDENTIALS }, 401);
  }

  recordLoginSuccess(ip, creds.username);
  auditAuth("login_success", user.loginname, ip);

  const body: MeResponse = { loggedIn: true, displayName: user.displayName };
  const response = NextResponse.json(body, {
    headers: { "Cache-Control": "private, no-store" },
  });
  response.cookies.set(SESSION_COOKIE, sealSession(user), sessionCookieOptions());
  return response;
}
