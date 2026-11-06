import "server-only";

import { isEnvAdmin } from "./policy";
import type { UserRecord } from "./store";
import type { AdminUser } from "./types";

/**
 * API shape of a stored user (explicit field list). AUTH_ADMIN_SUBS
 * accounts are shown as approved admins, as enforced by the guards.
 * (Gate / rate limit / body helpers: src/lib/auth/admin-gate.ts.)
 */
export function toAdminUser(u: UserRecord): AdminUser {
  const env = isEnvAdmin(u.sub);
  return {
    sub: u.sub,
    name: u.name,
    orgCode: u.orgCode,
    orgName: u.orgName,
    jobPosition: u.jobPosition,
    status: env ? "approved" : u.status,
    role: env ? "admin" : u.role,
    createdAt: u.createdAt,
    lastLoginAt: u.lastLoginAt,
    loginCount: u.loginCount,
    decidedBy: u.decidedBy
      ? { sub: u.decidedBy.sub, name: u.decidedBy.name }
      : null,
    decidedAt: u.decidedAt,
  };
}
