import "server-only";

import { resolveDataSourceKind } from "@/lib/kpi/screening";
import type { AuthProvider } from "@/lib/auth/types";
import { hosxpAuthProvider } from "./providers/hosxp";
import { mockAuthProvider } from "./providers/mock";

/**
 * Selects the credential provider. Follows KPI_DATA_SOURCE so that mock
 * data is always paired with the mock account and HIS data with HOSxP
 * accounts. To switch authentication method later (LDAP, Provider ID, ...)
 * add a provider implementing `AuthProvider` and select it here.
 */
export function getAuthProvider(): AuthProvider {
  return resolveDataSourceKind() === "mock"
    ? mockAuthProvider
    : hosxpAuthProvider;
}
