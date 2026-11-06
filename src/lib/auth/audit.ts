import "server-only";

import { logSafe } from "./request";

/**
 * PDPA audit trail: one line per event on stdout (console.info).
 * Never logs passwords, hashes, session cookies or patient data
 * (names, HN, CID) — only staff loginname and query parameters.
 */

type DataAction = "persons" | "export";

export function auditDataAccess(entry: {
  action: DataAction;
  loginname: string;
  code: string;
  fiscalYear: number;
  villageId: number | null;
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
  | "logout";

export function auditAuth(event: AuthEvent, username: string, ip: string) {
  console.info(
    `[audit] ${new Date().toISOString()} action=${event} user=${logSafe(username) || "-"} ip=${logSafe(ip)}`,
  );
}
