import "server-only";

import { logSafe } from "./request";

/**
 * PDPA audit trail: one line per event on stdout (console.info).
 * Never logs passwords, hashes, session cookies or patient data
 * (names, HN, CID) — only staff loginname / OIDC sub and query parameters.
 */

type DataAction = "persons" | "export";

export function auditDataAccess(entry: {
  action: DataAction;
  loginname: string;
  code: string;
  fiscalYear: number;
  /** HOSxP village id, or district HDC vid / tambon code (aggregate identifiers only). */
  villageId: number | string | null;
  rows: number;
}) {
  console.info(
    `[audit] ${new Date().toISOString()} action=${entry.action} user=${logSafe(entry.loginname)} code=${entry.code} fy=${entry.fiscalYear} village=${entry.villageId ?? "all"} rows=${entry.rows}`,
  );
}

type AuthEvent =
  | "login_success"
  | "login_failed"
  | "login_rate_limited"
  /** SSO sign-in refused: account waiting for admin approval. */
  | "login_pending"
  /** SSO sign-in refused: account rejected by an admin. */
  | "login_rejected"
  /** SSO sign-in refused: users.json unreadable / unwritable (fail closed). */
  | "login_store_error"
  /** First SSO sign-in: new pending account. */
  | "user_created"
  /** Promoted to approved admin by AUTH_BOOTSTRAP_ADMIN_FNAMES. */
  | "user_bootstrap_admin"
  /** Promoted to approved admin by AUTH_ADMIN_SUBS. */
  | "user_env_admin"
  | "logout";

export function auditAuth(event: AuthEvent, username: string, ip: string) {
  console.info(
    `[audit] ${new Date().toISOString()} action=${event} user=${logSafe(username) || "-"} ip=${logSafe(ip)}`,
  );
}

/** Admin changed a user's status / role (PATCH /api/admin/users/{sub}). */
export function auditUserUpdate(entry: {
  actor: string;
  target: string;
  from: { status: string; role: string };
  to: { status: string; role: string };
  ip: string;
}) {
  console.info(
    `[audit] ${new Date().toISOString()} action=user_update user=${logSafe(entry.actor) || "-"} target=${logSafe(entry.target) || "-"} status=${entry.from.status}->${entry.to.status} role=${entry.from.role}->${entry.to.role} ip=${logSafe(entry.ip)}`,
  );
}

/** Admin created / updated / deleted a department (view filter). */
export function auditDepartment(entry: {
  action: "department_create" | "department_update" | "department_delete";
  actor: string;
  id: string;
  name: string;
  ip: string;
}) {
  console.info(
    `[audit] ${new Date().toISOString()} action=${entry.action} user=${logSafe(entry.actor) || "-"} id=${logSafe(entry.id)} name=${logSafe(entry.name, 80) || "-"} ip=${logSafe(entry.ip)}`,
  );
}
