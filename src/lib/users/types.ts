/**
 * User-management types shared by the admin API (server) and the
 * /admin/users page (client). Pure module: no runtime code besides the
 * constant lists, safe to import from client components.
 *
 * Contract (docs/auth.md "การจัดการผู้ใช้"):
 *   GET   /api/admin/users        -> 200 AdminUsersResponse
 *   PATCH /api/admin/users/{sub}  -> 200 AdminUserPatchResponse
 *   errors                        -> AdminErrorResponse
 */

export const USER_STATUSES = ["pending", "approved", "rejected"] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const USER_ROLES = ["admin", "user"] as const;
export type UserRole = (typeof USER_ROLES)[number];

/** Who approved / rejected / changed the role last. */
export interface UserDecision {
  sub: string;
  name: string;
}

/**
 * One staff account (Provider ID). Stored as-is in users.json and returned
 * by the admin API. No citizen ID, email or patient data.
 */
export interface AdminUser {
  /** OIDC `sub` of Provider ID (stable identity). */
  sub: string;
  /** prename + fname + lname. */
  name: string;
  orgCode: string;
  orgName: string;
  jobPosition: string;
  status: UserStatus;
  role: UserRole;
  /** ISO 8601 timestamps. */
  createdAt: string;
  lastLoginAt: string;
  /** SSO sign-in attempts (also counted while pending / rejected). */
  loginCount: number;
  decidedBy: UserDecision | null;
  decidedAt: string | null;
}

export interface AdminUsersResponse {
  /** Pending first, then lastLoginAt descending. */
  users: AdminUser[];
  /** The signed-in admin (cannot change own status / role). */
  me: { sub: string };
}

export interface AdminUserPatch {
  status?: UserStatus;
  role?: UserRole;
}

export interface AdminUserPatchResponse {
  user: AdminUser;
}

export interface AdminErrorResponse {
  error: string;
}
