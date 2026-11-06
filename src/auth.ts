import "server-only";

import NextAuth, {
  CredentialsSignin,
  type NextAuthConfig,
  type Session,
} from "next-auth";
import Credentials from "next-auth/providers/credentials";

import { auditAuth } from "@/lib/auth/audit";
import { LOGIN_CODE, rateLimitedCode, SSO_CODE } from "@/lib/auth/messages";
import { getAuthProvider } from "@/lib/auth/provider";
import {
  loginRetryAfter,
  recordLoginFailure,
  recordLoginSuccess,
} from "@/lib/auth/rate-limit";
import { clientIp, logSafe } from "@/lib/auth/request";
import {
  isAuthConfigured,
  secureCookiesEnabled,
  SESSION_MAX_AGE_SECONDS,
} from "@/lib/auth/settings";
import {
  checkOrg,
  SSO_PROVIDER_ID,
  ssoProvider,
  ssoUserInfo,
  warnOnRedirectOriginMismatch,
} from "@/lib/auth/sso";
import type { AuthUser } from "@/lib/auth/types";
import {
  isBootstrapAdminName,
  isEnvAdmin,
  logStoreError,
  passwordLoginEnabled,
  resolveAccess,
  type SessionProvider,
} from "@/lib/users/policy";
import { recordSsoLogin } from "@/lib/users/store";
import type { UserRole } from "@/lib/users/types";

/**
 * Auth.js (next-auth v5) configuration.
 *
 *  - Sign-in is SSO only: PLK Health ID / Provider ID (OIDC, src/lib/auth/sso.ts),
 *    session username = OIDC `sub`, org allow-list AUTH_PLKHEALTH_ALLOWED_ORGS.
 *  - Credentials provider (`AUTH_PROVIDER` local|hosxp, in-memory rate limit)
 *    is registered ONLY when AUTH_PASSWORD_LOGIN=true (emergency, API only).
 *  - User management (src/lib/users): after the org allow-list, the SSO
 *    user is upserted in data/users.json; only status "approved" may sign
 *    in (new users are "pending"). AUTH_ADMIN_SUBS / AUTH_BOOTSTRAP_ADMIN_FNAMES
 *    create admins. The emergency Credentials account counts as admin.
 *  - Stateless JWT session (encrypted cookie, AUTH_SECRET), absolute
 *    lifetime 8 h from login; contains only { username, name, provider, role }.
 *    Every session read re-checks the user store (revocation is immediate).
 *  - Routes: /api/auth/* (src/app/api/auth/[...nextauth]/route.ts),
 *    custom sign-in page /login.
 *
 * Config is built per request (lazy init) so the client IP is available
 * to the audit log / rate limiter and env is read at request time.
 */

const MAX_USERNAME = 64;
const MAX_PASSWORD = 128;

class LoginError extends CredentialsSignin {
  constructor(code: string) {
    super();
    this.code = code;
  }
}

function readCredentials(
  credentials: Partial<Record<string, unknown>>,
): { username: string; password: string } | null {
  const { username, password } = credentials;
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

const str = (v: unknown): string =>
  typeof v === "string" ? v.trim() : "";

/** OIDC `sub` of an SSO sign-in ("" when missing). */
function ssoSubject(account: { providerAccountId?: unknown } | null | undefined) {
  return str(account?.providerAccountId);
}

/**
 * Origin the browser used (behind nginx: X-Forwarded-Host / -Proto), for
 * the redirect-URI mismatch warning only.
 */
function requestOrigin(headers: Headers | null | undefined): string | null {
  const host = (headers?.get("x-forwarded-host") ?? headers?.get("host"))
    ?.split(",")[0]
    ?.trim();
  if (!host) return null;
  const proto =
    headers?.get("x-forwarded-proto")?.split(",")[0]?.trim() ||
    (process.env.NODE_ENV === "production" ? "https" : "http");
  try {
    return new URL(`${proto}://${host}`).origin;
  } catch {
    return null;
  }
}

/** Session user exposed by `auth()` / `useSession()` (`session.user`). */
export interface SessionUser {
  username: string;
  name: string;
  /**
   * Role at the last session read (refreshed from the user store by the
   * jwt callback). UI hint only: route handlers re-check the store.
   */
  role: UserRole;
  /** "sso" = Provider ID, "password" = emergency Credentials (admin). */
  provider: SessionProvider;
}

/** Narrow, validated user from an Auth.js session (null = not logged in). */
export function sessionUser(
  session: { user?: unknown } | null | undefined,
): SessionUser | null {
  const user = session?.user as Partial<SessionUser> | undefined;
  if (
    !user ||
    typeof user.username !== "string" ||
    user.username === "" ||
    (user.provider !== "sso" && user.provider !== "password")
  ) {
    return null;
  }
  return {
    username: user.username,
    name:
      typeof user.name === "string" && user.name ? user.name : user.username,
    role: user.role === "admin" ? "admin" : "user",
    provider: user.provider,
  };
}

/**
 * SSO sign-in after the org allow-list: upsert the user in the store and
 * allow only approved accounts. Returns the signIn callback result.
 */
async function ssoAdmission(
  sub: string,
  profile: Record<string, unknown> | undefined,
  ip: string,
): Promise<true | string> {
  const info = ssoUserInfo(profile);
  let result;
  try {
    result = await recordSsoLogin(
      {
        sub,
        name: info.name,
        orgCode: info.orgCode,
        orgName: info.orgName,
        jobPosition: info.jobPosition,
      },
      {
        envAdmin: isEnvAdmin(sub),
        bootstrapCandidate: isBootstrapAdminName(info.fname),
      },
    );
  } catch (err) {
    logStoreError(err);
    auditAuth("login_store_error", sub, ip);
    return `/login?error=AccessDenied&code=${SSO_CODE.userStoreUnavailable}`;
  }
  const { user, created, promoted } = result;
  if (created) auditAuth("user_created", sub, ip);
  if (promoted === "bootstrap") auditAuth("user_bootstrap_admin", sub, ip);
  if (promoted === "env") auditAuth("user_env_admin", sub, ip);
  if (user.status === "approved") {
    auditAuth("login_success", sub, ip);
    return true;
  }
  if (user.status === "rejected") {
    auditAuth("login_rejected", sub, ip);
    return `/login?error=AccessDenied&code=${SSO_CODE.rejected}`;
  }
  auditAuth("login_pending", sub, ip);
  return `/login?error=AccessDenied&code=${SSO_CODE.pending}`;
}

function buildConfig(ip: string): NextAuthConfig {
  const sso = ssoProvider();
  return {
    // AUTH_SECRET is read by next-auth from env automatically.
    trustHost: true,
    useSecureCookies: secureCookiesEnabled(),
    session: { strategy: "jwt", maxAge: SESSION_MAX_AGE_SECONDS },
    pages: { signIn: "/login", error: "/login" },
    providers: [
      // Username/password login is OFF: sign-in is Provider ID (SSO) only.
      // AUTH_PASSWORD_LOGIN=true re-enables it (API only, no form) for emergencies.
      // The emergency account counts as an ADMIN (break-glass).
      ...(passwordLoginEnabled()
        ? [credentialsProvider(ip)]
        : []),
      // SSO (Provider ID) — only when AUTH_PLKHEALTH_* is configured.
      ...(sso ? [sso] : []),
    ],
    callbacks: {
      async signIn({ account, profile }) {
        if (account?.provider !== SSO_PROVIDER_ID) return true;
        // Stable identity = OIDC `sub` (user.id is a random UUID per sign-in).
        const who = ssoSubject(account);
        if (!who || str(profile?.sub) !== who) {
          auditAuth("login_failed", "-", ip);
          return false;
        }
        const org = checkOrg(profile as Record<string, unknown> | undefined);
        if (org !== "allowed") {
          auditAuth("login_failed", who, ip);
          return `/login?error=AccessDenied&code=${
            org === "not_configured"
              ? SSO_CODE.orgNotConfigured
              : SSO_CODE.orgNotAllowed
          }`;
        }
        // Second gate: the user store (pending / rejected / approved).
        return ssoAdmission(
          who,
          profile as Record<string, unknown> | undefined,
          ip,
        );
      },
      async jwt({ token, user, account }) {
        const now = Math.floor(Date.now() / 1000);
        if (user) {
          // Sign-in: fresh minimal token (drops email/picture defaults).
          // SSO: OIDC sub; Credentials: the HOSxP / local loginname.
          const provider: SessionProvider =
            account?.provider === SSO_PROVIDER_ID ? "sso" : "password";
          const username =
            provider === "sso" ? ssoSubject(account) : (user.id ?? "");
          if (!username) return null;
          const access = await resolveAccess(username, provider);
          if (!access.ok) return null;
          return {
            sub: username,
            username,
            name: user.name ?? username,
            provider,
            role: access.role,
            loginAt: now,
          };
        }
        // Absolute expiry: Auth.js re-issues the cookie on every session
        // read (rolling), so enforce 8 h from login here.
        const loginAt = typeof token.loginAt === "number" ? token.loginAt : 0;
        if (
          typeof token.username !== "string" ||
          token.username === "" ||
          loginAt > now + 60 ||
          now - loginAt >= SESSION_MAX_AGE_SECONDS
        ) {
          return null;
        }
        // Revocation: every session read re-checks the user store, so a
        // rejected / reset user is logged out and role changes show up.
        const access = await resolveAccess(token.username, token.provider);
        if (!access.ok) return null;
        return { ...token, role: access.role };
      },
      session({ token }) {
        const username =
          typeof token.username === "string" ? token.username : "";
        const name = typeof token.name === "string" ? token.name : username;
        const loginAt = typeof token.loginAt === "number" ? token.loginAt : 0;
        const role: UserRole = token.role === "admin" ? "admin" : "user";
        const provider: SessionProvider =
          token.provider === "password" ? "password" : "sso";
        return {
          expires: new Date(
            (loginAt + SESSION_MAX_AGE_SECONDS) * 1000,
          ).toISOString(),
          user: { username, name, role, provider },
        } as unknown as Session;
      },
    },
    events: {
      signOut(message) {
        const token = "token" in message ? message.token : null;
        const username =
          token && typeof token.username === "string" ? token.username : "";
        if (username) auditAuth("logout", username, ip);
      },
    },
    logger: {
      // Short lines only: no stack traces, request bodies or causes
      // (could contain DB details). CredentialsSignin is already audited.
      error(error) {
        if (error instanceof CredentialsSignin) return;
        const type = (error as { type?: string }).type ?? error.name;
        console.error(`[auth][error] ${logSafe(String(type))}`);
      },
      warn(code) {
        console.warn(`[auth][warn] ${code}`);
      },
      debug() {},
    },
  };
}

function credentialsProvider(ip: string) {
  return Credentials({
    credentials: {
      username: { label: "ชื่อผู้ใช้" },
      password: { label: "รหัสผ่าน", type: "password" },
    },
    async authorize(credentials) {
      if (!isAuthConfigured()) {
        console.error(
          "[auth] login disabled: AUTH_SECRET missing or shorter than 32 characters",
        );
        throw new LoginError(LOGIN_CODE.disabled);
      }
      const creds = readCredentials(credentials);
      if (!creds) throw new LoginError(LOGIN_CODE.missing);

      const retryAfter = loginRetryAfter(ip, creds.username);
      if (retryAfter > 0) {
        auditAuth("login_rate_limited", creds.username, ip);
        throw new LoginError(rateLimitedCode(retryAfter));
      }

      let user: AuthUser | null;
      try {
        user = await getAuthProvider().verify(creds.username, creds.password);
      } catch (err) {
        const name = err instanceof Error ? err.name : "UnknownError";
        const code =
          err && typeof err === "object" && "code" in err
            ? String((err as { code: unknown }).code ?? "")
            : "";
        console.error(
          `[auth] provider error: ${logSafe(name)}${code ? ` (${logSafe(code)})` : ""}`,
        );
        throw new LoginError(LOGIN_CODE.unavailable);
      }

      if (!user) {
        recordLoginFailure(ip, creds.username);
        auditAuth("login_failed", creds.username, ip);
        return null; // -> CredentialsSignin code "credentials"
      }

      recordLoginSuccess(ip, creds.username);
      auditAuth("login_success", user.loginname, ip);
      return { id: user.loginname, name: user.displayName };
    },
  });
}

export const { handlers, auth, signIn, signOut } = NextAuth((request) => {
  // Diagnostics only on sign-in starts (not on every session read).
  if (request?.nextUrl?.pathname.startsWith("/api/auth/signin/")) {
    warnOnRedirectOriginMismatch(requestOrigin(request.headers));
  }
  return buildConfig(clientIp(request?.headers));
});
