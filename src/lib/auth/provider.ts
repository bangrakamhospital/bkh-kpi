import "server-only";

import type { AuthProvider } from "@/lib/auth/types";
import { hosxpAuthProvider } from "./providers/hosxp";
import { localAuthProvider } from "./providers/local";

/**
 * Selects the credential provider with env AUTH_PROVIDER:
 *   "local" (default) = account from AUTH_USERNAME / AUTH_PASSWORD
 *   "hosxp"           = HOSxP opduser table
 * To add another method (LDAP, Provider ID, ...) implement `AuthProvider`
 * and select it here.
 */
export function getAuthProvider(): AuthProvider {
  const raw = process.env.AUTH_PROVIDER?.trim().toLowerCase();
  if (raw === "hosxp") return hosxpAuthProvider;
  return localAuthProvider;
}
