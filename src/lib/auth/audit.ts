import "server-only";

import { appendAudit } from "@/lib/audit/store";
import type { AuditAction, AuditRecord } from "@/lib/audit/types";
import { logSafe, type RequestMeta } from "./request";

/**
 * PDPA / Computer Crime Act audit trail. Every event is
 *  1. printed as one line on stdout (console.info, as before), and
 *  2. appended to ${KPI_DATA_DIR}/audit/YYYY-MM.jsonl (src/lib/audit/store.ts),
 *     viewable by admins at /admin/logs.
 * Never logs passwords, hashes, tokens, session cookies, secrets or
 * patient data (names, HN, CID, search text) — only staff loginname /
 * OIDC sub, request parameters and aggregate identifiers.
 * Never throws: auditing must not break the request.
 */

/** Strip control characters, trim, cap length (record fields). */
function clean(value: string | null | undefined, max = 128): string | undefined {
  if (typeof value !== "string") return undefined;
  const v = value.replace(/[\u0000-\u001f\u007f]+/g, " ").trim().slice(0, max);
  return v || undefined;
}

type RecordFields = Omit<AuditRecord, "v" | "ts" | "action" | "actor" | "ip" | "ua">;

function persist(
  action: AuditAction,
  actor: string | null,
  meta: RequestMeta | null,
  fields: RecordFields = {},
) {
  try {
    const record: AuditRecord = {
      v: 1,
      ts: new Date().toISOString(),
      action,
      actor: clean(actor === "-" ? null : actor, 256) ?? null,
    };
    const actorName = clean(fields.actorName, 120);
    if (actorName && actorName !== record.actor) record.actorName = actorName;
    const ip = clean(meta?.ip, 64);
    if (ip && ip !== "unknown") record.ip = ip;
    const ua = clean(meta?.userAgent, 200);
    if (ua) record.ua = ua;
    const path = clean(fields.path, 200);
    if (path) record.path = path;
    const query = clean(fields.query, 300);
    if (query) record.query = query;
    const code = clean(fields.code, 64);
    if (code) record.code = code;
    if (Number.isSafeInteger(fields.fiscalYear)) record.fiscalYear = fields.fiscalYear;
    const scope = clean(fields.scope, 64);
    if (scope) record.scope = scope;
    if (Number.isSafeInteger(fields.rows)) record.rows = fields.rows;
    const target = clean(fields.target, 256);
    if (target) record.target = target;
    const detail = clean(fields.detail, 200);
    if (detail) record.detail = detail;
    void appendAudit(record);
  } catch (err) {
    console.error(
      `[audit] cannot record event (${err instanceof Error ? err.name : "error"})`,
    );
  }
}

type DataAction = "persons" | "export";

export function auditDataAccess(
  entry: {
    action: DataAction;
    loginname: string;
    /** Staff display name (session). */
    name?: string;
    code: string;
    fiscalYear: number;
    /** HOSxP village id, or district HDC vid / tambon code (aggregate identifiers only). */
    villageId: number | string | null;
    rows: number;
  },
  meta: RequestMeta,
) {
  console.info(
    `[audit] ${new Date().toISOString()} action=${entry.action} user=${logSafe(entry.loginname)} code=${entry.code} fy=${entry.fiscalYear} village=${entry.villageId ?? "all"} rows=${entry.rows}`,
  );
  persist(entry.action, entry.loginname, meta, {
    actorName: entry.name,
    code: entry.code,
    fiscalYear: entry.fiscalYear,
    scope: entry.villageId === null ? "all" : String(entry.villageId),
    rows: entry.rows,
  });
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

/**
 * `username` = OIDC sub / loginname as typed / `access-code:<id>` of an
 * external auditor ("-" = unknown, e.g. a wrong access code). For failed
 * password logins it is the attempted username (never the password).
 * `detail` = short fixed reason code (e.g. "org_not_allowed").
 */
export function auditAuth(
  event: AuthEvent,
  username: string,
  meta: RequestMeta,
  extra: { name?: string; detail?: string } = {},
) {
  console.info(
    `[audit] ${new Date().toISOString()} action=${event} user=${logSafe(username) || "-"} ip=${logSafe(meta.ip)}`,
  );
  persist(event, username || null, meta, {
    actorName: extra.name,
    detail: extra.detail,
  });
}

/** Admin changed a user's status / role (PATCH /api/admin/users/{sub}). */
export function auditUserUpdate(entry: {
  actor: string;
  actorName?: string;
  target: string;
  from: { status: string; role: string };
  to: { status: string; role: string };
  meta: RequestMeta;
}) {
  console.info(
    `[audit] ${new Date().toISOString()} action=user_update user=${logSafe(entry.actor) || "-"} target=${logSafe(entry.target) || "-"} status=${entry.from.status}->${entry.to.status} role=${entry.from.role}->${entry.to.role} ip=${logSafe(entry.meta.ip)}`,
  );
  persist("user_update", entry.actor, entry.meta, {
    actorName: entry.actorName,
    target: entry.target,
    detail: `status ${entry.from.status}->${entry.to.status}, role ${entry.from.role}->${entry.to.role}`,
  });
}

/** Admin created / updated / deleted a department (view filter). */
export function auditDepartment(entry: {
  action: "department_create" | "department_update" | "department_delete";
  actor: string;
  actorName?: string;
  id: string;
  name: string;
  meta: RequestMeta;
}) {
  console.info(
    `[audit] ${new Date().toISOString()} action=${entry.action} user=${logSafe(entry.actor) || "-"} id=${logSafe(entry.id)} name=${logSafe(entry.name, 80) || "-"} ip=${logSafe(entry.meta.ip)}`,
  );
  persist(entry.action, entry.actor, entry.meta, {
    actorName: entry.actorName,
    target: entry.id,
    detail: `แผนก ${entry.name.slice(0, 80)}`,
  });
}

/**
 * Admin created / revoked an external-auditor access code. Never the code
 * itself: `target` is the record id (session username of the auditor is
 * `access-code:<id>`), `detail` the auditor's name / org / expiry.
 */
export function auditAccessCode(entry: {
  action: "access_code_create" | "access_code_revoke";
  actor: string;
  actorName?: string;
  id: string;
  name: string;
  org: string;
  expiresAt: string;
  meta: RequestMeta;
}) {
  console.info(
    `[audit] ${new Date().toISOString()} action=${entry.action} user=${logSafe(entry.actor) || "-"} id=${logSafe(entry.id)} expires=${logSafe(entry.expiresAt)} ip=${logSafe(entry.meta.ip)}`,
  );
  persist(entry.action, entry.actor, entry.meta, {
    actorName: entry.actorName,
    target: `access-code:${entry.id}`,
    detail: `ผู้ตรวจ ${entry.name.slice(0, 60)} (${entry.org.slice(0, 60)}) หมดอายุ ${entry.expiresAt.slice(0, 10)}`,
  });
}

/** Logged-in user rendered a main page (/, /district, /admin/*). */
export function auditPageView(entry: {
  actor: string;
  actorName?: string;
  path: string;
  /** Allow-listed query parameters only. */
  query: string;
  meta: RequestMeta;
}) {
  console.info(
    `[audit] ${new Date().toISOString()} action=page_view user=${logSafe(entry.actor) || "-"} path=${logSafe(entry.path, 100)}${entry.query ? `?${logSafe(entry.query, 100)}` : ""} ip=${logSafe(entry.meta.ip)}`,
  );
  persist("page_view", entry.actor, entry.meta, {
    actorName: entry.actorName,
    path: entry.path,
    query: entry.query,
  });
}

/** Admin listed / exported the audit log itself. */
export function auditLogAccess(entry: {
  action: "audit_view" | "audit_export";
  actor: string;
  actorName?: string;
  /** Filter summary (dates, action, staff name filter). */
  query: string;
  rows: number;
  meta: RequestMeta;
}) {
  console.info(
    `[audit] ${new Date().toISOString()} action=${entry.action} user=${logSafe(entry.actor) || "-"} rows=${entry.rows} ip=${logSafe(entry.meta.ip)}`,
  );
  persist(entry.action, entry.actor, entry.meta, {
    actorName: entry.actorName,
    query: entry.query,
    rows: entry.rows,
  });
}
