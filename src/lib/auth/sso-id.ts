/**
 * Auth.js provider id of the PLK Health ID / Provider ID SSO.
 * Pure constant (no "server-only"): shared by src/auth.ts, the login button
 * and the /auth/callback forwarder so the three never drift apart.
 */
export const SSO_PROVIDER_ID = "plkhealth";

/** Path registered at the IdP as redirect_uri (fixed by the IdP). */
export const SSO_REDIRECT_PATH = "/auth/callback";
