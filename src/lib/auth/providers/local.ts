import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";

import type { AuthProvider, AuthUser } from "@/lib/auth/types";

/**
 * Local account. Credentials come ONLY from env (no default in code):
 *   AUTH_USERNAME, AUTH_PASSWORD, AUTH_DISPLAY_NAME (optional)
 * When username or password is not set, every login fails.
 */

function digest(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

export const localAuthProvider: AuthProvider = {
  name: "local-env",
  async verify(username, password): Promise<AuthUser | null> {
    const expectedUser = process.env.AUTH_USERNAME ?? "";
    const expectedPass = process.env.AUTH_PASSWORD ?? "";
    const configured = expectedUser.length > 0 && expectedPass.length > 0;

    // Fixed-length digests -> constant-time compare regardless of input length.
    const userOk = timingSafeEqual(digest(username), digest(expectedUser));
    const passOk = timingSafeEqual(digest(password), digest(expectedPass));
    if (!configured || !userOk || !passOk) return null;

    const displayName =
      process.env.AUTH_DISPLAY_NAME?.trim() || "ผู้ดูแลระบบ";
    return { loginname: expectedUser, displayName };
  },
};
