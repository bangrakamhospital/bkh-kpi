import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";

import type { AuthProvider, AuthUser } from "@/lib/auth/types";

/**
 * Test account for KPI_DATA_SOURCE=mock. Credentials come ONLY from env:
 *   AUTH_MOCK_USERNAME, AUTH_MOCK_PASSWORD, AUTH_MOCK_DISPLAY_NAME (optional)
 * When username or password is not set, every login fails (no default).
 */

function digest(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

export const mockAuthProvider: AuthProvider = {
  name: "mock-env",
  async verify(username, password): Promise<AuthUser | null> {
    const expectedUser = process.env.AUTH_MOCK_USERNAME ?? "";
    const expectedPass = process.env.AUTH_MOCK_PASSWORD ?? "";
    const configured = expectedUser.length > 0 && expectedPass.length > 0;

    // Fixed-length digests -> constant-time compare regardless of input length.
    const userOk = timingSafeEqual(digest(username), digest(expectedUser));
    const passOk = timingSafeEqual(digest(password), digest(expectedPass));
    if (!configured || !userOk || !passOk) return null;

    const displayName =
      process.env.AUTH_MOCK_DISPLAY_NAME?.trim() || expectedUser;
    return { loginname: expectedUser, displayName };
  },
};
