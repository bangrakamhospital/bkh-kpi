import { USER_STORE_UNAVAILABLE_MESSAGE } from "@/lib/auth/messages";
import { authJson } from "@/lib/auth/request";
import { adminError, adminGate } from "@/lib/auth/admin-gate";
import { toAdminUser } from "@/lib/users/admin-api";
import { logStoreError } from "@/lib/users/policy";
import { listUsers, sortUsers } from "@/lib/users/store";
import type { AdminUsersResponse } from "@/lib/users/types";

/**
 * GET /api/admin/users -> 200 AdminUsersResponse
 *   { users: AdminUser[] (pending first, then lastLoginAt desc), me: { sub } }
 * 401 not logged in / no longer approved, 403 not admin, 429 rate limited,
 * 503 auth not configured or users.json unreadable.
 * Staff accounts only (no patient data). Always `private, no-store`.
 */
export async function GET(): Promise<Response> {
  const gate = await adminGate("api/admin/users");
  if (!gate.ok) return gate.response;
  try {
    const stored = await listUsers();
    // Re-sort after the AUTH_ADMIN_SUBS overlay (status may change).
    const users = sortUsers(stored.map(toAdminUser));
    const body: AdminUsersResponse = {
      users,
      me: { sub: gate.admin.username },
    };
    return authJson(body);
  } catch (err) {
    logStoreError(err);
    return adminError(503, USER_STORE_UNAVAILABLE_MESSAGE);
  }
}
