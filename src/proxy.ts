import { NextResponse, type NextRequest } from "next/server";

import { auth, sessionUser } from "@/auth";
import { loginRedirectPath } from "@/lib/auth/protected-paths";
import { isAuthConfigured } from "@/lib/auth/settings";

/**
 * Login gate for the pages in LOGIN_REQUIRED_PAGES (/hospital, /pp, /district/pp):
 * no APPROVED session -> 307 /login?callbackUrl=<path?query>.
 *
 * Runs Auth.js' session read (Node.js runtime, the proxy default): the
 * jwt callback in src/auth.ts re-checks the user store on every read, so
 * "logged in" here means logged in AND still approved, exactly like
 * requireSession() for the person-level APIs (a store read error also
 * redirects: fail closed).
 *
 * Not the only check: <RequireLogin> re-checks inside the page and the
 * /api/kpi/screening/* route handlers call requireSession() themselves.
 * /login, /auth/callback and /api/auth/* are not matched (stay public).
 */

/** Browser-facing origin behind nginx (X-Forwarded-Host / -Proto), like src/auth.ts. */
function publicOrigin(req: NextRequest): string {
  const host = (req.headers.get("x-forwarded-host") ?? req.headers.get("host"))
    ?.split(",")[0]
    ?.trim();
  const proto = req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  if (host && (proto === "http" || proto === "https" || !proto)) {
    try {
      return new URL(`${proto || req.nextUrl.protocol.replace(":", "")}://${host}`)
        .origin;
    } catch {
      // fall through
    }
  }
  return req.nextUrl.origin;
}

function redirectToLogin(req: NextRequest): Response {
  const returnUrl = req.nextUrl.clone();
  returnUrl.searchParams.delete("_rsc");
  const target = new URL(
    loginRedirectPath(`${returnUrl.pathname}${returnUrl.search}`),
    publicOrigin(req),
  );
  // Same host as the request -> Next.js rewrites it to a relative Location.
  const res = NextResponse.redirect(target, 307);
  res.headers.set("Cache-Control", "private, no-store");
  return res;
}

export async function proxy(request: NextRequest): Promise<Response> {
  // auth() without arguments reads the request cookies via headers()
  // (supported in Proxy). Not the auth(fn) wrapper: with the lazy config
  // in src/auth.ts that form returns a Promise, not a handler.
  if (isAuthConfigured() && sessionUser(await auth())) {
    return NextResponse.next();
  }
  return redirectToLogin(request);
}

export const config = {
  // Keep in sync with LOGIN_REQUIRED_PAGES (matcher must be static).
  matcher: ["/hospital/:path*", "/pp/:path*", "/district/pp/:path*"],
};
