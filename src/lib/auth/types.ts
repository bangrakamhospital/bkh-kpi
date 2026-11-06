/**
 * Shared auth types (no runtime code, safe to import from client code).
 */

/** Authenticated staff member. Never contains a password or hash. */
export interface AuthUser {
  /** Canonical login name as stored by the provider (e.g. HOSxP opduser.loginname). */
  loginname: string;
  /** Name shown in the UI. */
  displayName: string;
}

/**
 * Pluggable credential check. Implementations must:
 *  - never return / log the password or stored hash,
 *  - return null for "unknown user", "wrong password" and "disabled account"
 *    alike (no user enumeration),
 *  - throw only for infrastructure errors (DB down, misconfiguration).
 */
export interface AuthProvider {
  readonly name: string;
  verify(username: string, password: string): Promise<AuthUser | null>;
}

/** Body of GET /api/auth/me. */
export interface MeResponse {
  loggedIn: boolean;
  displayName: string | null;
}
