import "server-only";

import { customFetch } from "next-auth";
import type { OIDCConfig } from "next-auth/providers";

import { logSafe } from "./request";
import { SSO_PROVIDER_ID, SSO_REDIRECT_PATH } from "./sso-id";

export { SSO_PROVIDER_ID };

/**
 * SSO: PLK Health ID / MOPH Provider ID (OpenID Connect).
 *
 * Enabled only while all four env vars are set and the redirect URI is valid
 * (values live in .env, never in code — the repository is public):
 *   AUTH_PLKHEALTH_ISSUER        IdP issuer URL (discovery: /.well-known/openid-configuration)
 *   AUTH_PLKHEALTH_ID            client id
 *   AUTH_PLKHEALTH_SECRET        client secret
 *   AUTH_PLKHEALTH_REDIRECT_URI  exact redirect URI registered at the IdP, path
 *                                /auth/callback, e.g. http://localhost:3000/auth/callback
 *                                (dev) or https://10.10.10.159:82/auth/callback (prod)
 *   AUTH_PLKHEALTH_ALLOWED_ORGS  comma-separated org codes (hospcode) allowed to
 *                                sign in, e.g. 11252; "*" = any account the IdP
 *                                accepts. EMPTY = SSO sign-in is DENIED (fail-closed:
 *                                Provider ID is nationwide and signed-in users can
 *                                see patient names).
 *
 * The IdP only accepts {origin}/auth/callback, not the Auth.js default
 * /api/auth/callback/plkhealth, so the registered URI replaces redirect_uri in
 * both requests that carry it (they must match), and
 * src/app/auth/callback/route.ts forwards the IdP response to Auth.js.
 */

interface SsoEnv {
  issuer: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  redirectOrigin: string;
}

let warnedInvalidRedirect = false;
const warnedOrigins = new Set<string>();

function readEnv(): SsoEnv | null {
  const issuer = process.env.AUTH_PLKHEALTH_ISSUER?.trim();
  const clientId = process.env.AUTH_PLKHEALTH_ID?.trim();
  const clientSecret = process.env.AUTH_PLKHEALTH_SECRET?.trim();
  const redirectUri = process.env.AUTH_PLKHEALTH_REDIRECT_URI?.trim();
  if (!issuer || !clientId || !clientSecret || !redirectUri) return null;
  let redirectOrigin: string;
  try {
    const url = new URL(redirectUri);
    if (
      (url.protocol !== "http:" && url.protocol !== "https:") ||
      url.pathname !== SSO_REDIRECT_PATH ||
      url.search ||
      url.hash
    ) {
      throw new TypeError("bad redirect uri");
    }
    redirectOrigin = url.origin;
  } catch {
    if (!warnedInvalidRedirect) {
      warnedInvalidRedirect = true;
      console.warn(
        `[auth] SSO disabled: AUTH_PLKHEALTH_REDIRECT_URI must be an http(s) URL with path ${SSO_REDIRECT_PATH}`,
      );
    }
    return null;
  }
  return { issuer, clientId, clientSecret, redirectUri, redirectOrigin };
}

/**
 * Logs (once per origin) when the app is reached on an origin other than the
 * registered redirect URI: the IdP would send the browser to the other origin,
 * where the state / PKCE / nonce cookies do not exist, so sign-in fails.
 * Diagnostics only — no behaviour change.
 */
export function warnOnRedirectOriginMismatch(requestOrigin: string | null) {
  if (!requestOrigin) return;
  const env = readEnv();
  if (!env || env.redirectOrigin === requestOrigin) return;
  if (warnedOrigins.has(requestOrigin) || warnedOrigins.size > 20) return;
  warnedOrigins.add(requestOrigin);
  console.warn(
    `[auth] request origin ${logSafe(requestOrigin, 128)} differs from AUTH_PLKHEALTH_REDIRECT_URI origin ${logSafe(env.redirectOrigin, 128)}; SSO sign-in from this origin will fail`,
  );
}

const str = (v: unknown): string | null =>
  typeof v === "string" && v.trim() ? v.trim() : null;

type Claims = Record<string, unknown> | null | undefined;

/** Org codes in the profile: flat org_code today, organizations[] later. */
function profileOrgCodes(p: Claims): string[] {
  const codes: string[] = [];
  if (Array.isArray(p?.organizations)) {
    for (const o of p.organizations) {
      const c = str((o as Claims)?.org_code ?? (o as Claims)?.hcode);
      if (c) codes.push(c);
    }
  }
  const flat = str(p?.org_code ?? p?.hcode);
  if (flat) codes.push(flat);
  return codes;
}

export type OrgCheck = "allowed" | "not_allowed" | "not_configured";

/**
 * Org allow-list (AUTH_PLKHEALTH_ALLOWED_ORGS), fail-closed:
 * empty -> "not_configured" (deny), "*" -> any org, else the profile must
 * carry one of the listed org codes.
 */
export function checkOrg(p: Claims): OrgCheck {
  const allowed = (process.env.AUTH_PLKHEALTH_ALLOWED_ORGS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (allowed.length === 0) return "not_configured";
  if (allowed.includes("*")) return "allowed";
  return profileOrgCodes(p).some((c) => allowed.includes(c))
    ? "allowed"
    : "not_allowed";
}

/** The OIDC provider, or null when SSO is not configured. */
export function ssoProvider(): OIDCConfig<Record<string, unknown>> | null {
  const env = readEnv();
  if (!env) return null;
  return {
    id: SSO_PROVIDER_ID,
    name: "Provider ID",
    type: "oidc",
    issuer: env.issuer,
    clientId: env.clientId,
    clientSecret: env.clientSecret,
    // Authorize request: params override Auth.js's redirect_uri
    // (@auth/core lib/actions/signin/authorization-url.js).
    authorization: {
      params: {
        scope: "openid profile email organization",
        redirect_uri: env.redirectUri,
      },
    },
    // Token request: Auth.js always sends provider.callbackUrl
    // (lib/actions/callback/oauth/callback.js), so swap it here.
    [customFetch]: (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      if (
        init?.body instanceof URLSearchParams &&
        init.body.get("grant_type") === "authorization_code"
      ) {
        init.body.set("redirect_uri", env.redirectUri);
      }
      return fetch(input, init);
    },
    checks: ["pkce", "state", "nonce"],
    // The id_token is still verified; claims come from the userinfo endpoint.
    idToken: false,
    profile(p) {
      const sub = str(p.sub) ?? "";
      const name = `${str(p.prename) ?? ""}${str(p.fname) ?? ""} ${str(p.lname) ?? ""}`.trim();
      // Only id + name reach the session; the rest of the profile is dropped.
      // NOTE: Auth.js replaces user.id with a random UUID; the stable id (sub)
      // is account.providerAccountId — see the callbacks in src/auth.ts.
      return { id: sub, name: name || str(p.name) || sub };
    },
  };
}
