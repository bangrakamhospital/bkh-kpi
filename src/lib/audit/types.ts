/**
 * Audit log record schema + Thai labels. Shared by the server (store,
 * export) and the admin UI (no server-only / node imports here).
 *
 * A record holds staff identity + request parameters + aggregate
 * identifiers ONLY: never patient names / CID / HN, search text typed into
 * person lists, passwords, tokens, cookies or secrets.
 */

export const AUDIT_ACTIONS = [
  // authentication
  "login_success",
  "login_failed",
  "login_rate_limited",
  "login_pending",
  "login_rejected",
  "login_store_error",
  "logout",
  "user_created",
  "user_bootstrap_admin",
  "user_env_admin",
  // data access (patient-identifiable data: names in lists / Excel)
  "persons",
  "export",
  // page views (logged-in users only)
  "page_view",
  // administration
  "user_update",
  "department_create",
  "department_update",
  "department_delete",
  "audit_view",
  "audit_export",
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export const AUDIT_ACTION_LABELS: Record<AuditAction, string> = {
  login_success: "เข้าสู่ระบบสำเร็จ",
  login_failed: "เข้าสู่ระบบไม่สำเร็จ",
  login_rate_limited: "ถูกจำกัดการเข้าสู่ระบบ (พยายามถี่เกินไป)",
  login_pending: "เข้าสู่ระบบไม่ได้ (รออนุมัติ)",
  login_rejected: "เข้าสู่ระบบไม่ได้ (ไม่อนุมัติ)",
  login_store_error: "เข้าสู่ระบบไม่ได้ (ระบบผู้ใช้ขัดข้อง)",
  logout: "ออกจากระบบ",
  user_created: "ลงทะเบียนผู้ใช้ใหม่",
  user_bootstrap_admin: "ตั้งเป็นผู้ดูแลระบบ (เริ่มต้นระบบ)",
  user_env_admin: "ตั้งเป็นผู้ดูแลระบบ (AUTH_ADMIN_SUBS)",
  persons: "ดูรายชื่อผู้ป่วย",
  export: "ส่งออก Excel รายชื่อ",
  page_view: "เปิดหน้าเว็บ",
  user_update: "แก้ไขสถานะ/สิทธิ์ผู้ใช้",
  department_create: "เพิ่มแผนก",
  department_update: "แก้ไขแผนก",
  department_delete: "ลบแผนก",
  audit_view: "ดูบันทึกการใช้งาน",
  audit_export: "ส่งออกบันทึกการใช้งาน",
};

export const AUDIT_ACTION_GROUPS = [
  {
    key: "auth",
    label: "การเข้าสู่ระบบ",
    actions: [
      "login_success",
      "login_failed",
      "login_rate_limited",
      "login_pending",
      "login_rejected",
      "login_store_error",
      "logout",
      "user_created",
      "user_bootstrap_admin",
      "user_env_admin",
    ],
  },
  { key: "data", label: "การเข้าถึงข้อมูลผู้ป่วย", actions: ["persons", "export"] },
  { key: "page", label: "การเปิดหน้าเว็บ", actions: ["page_view"] },
  {
    key: "admin",
    label: "การจัดการระบบ",
    actions: [
      "user_update",
      "department_create",
      "department_update",
      "department_delete",
      "audit_view",
      "audit_export",
    ],
  },
] as const satisfies readonly {
  key: string;
  label: string;
  actions: readonly AuditAction[];
}[];

export type AuditActionGroup = (typeof AUDIT_ACTION_GROUPS)[number]["key"];

/** Failed / refused events (highlighted in the UI). */
export const AUDIT_FAILURE_ACTIONS: ReadonlySet<AuditAction> = new Set([
  "login_failed",
  "login_rate_limited",
  "login_pending",
  "login_rejected",
  "login_store_error",
]);

export function isAuditAction(value: unknown): value is AuditAction {
  return (
    typeof value === "string" &&
    (AUDIT_ACTIONS as readonly string[]).includes(value)
  );
}

/** One JSON Lines record in ${KPI_DATA_DIR}/audit/YYYY-MM.jsonl. */
export interface AuditRecord {
  /** Schema version. */
  v: 1;
  /** ISO-8601 UTC timestamp. */
  ts: string;
  action: AuditAction;
  /** Staff loginname / OIDC sub; null = unknown (e.g. failed SSO). */
  actor: string | null;
  /** Staff display name when cheaply known at write time. */
  actorName?: string;
  ip?: string;
  /** User agent, truncated. */
  ua?: string;
  /** Page path (page_view). */
  path?: string;
  /** Allow-listed, non-identifying query parameters (e.g. "fy=2569&code=dm"). */
  query?: string;
  /** KPI code (persons / export), "district:<code>" for HDC. */
  code?: string;
  fiscalYear?: number;
  /** Village id / HDC vid / tambon scope label ("all" = whole hospital). */
  scope?: string;
  /** Number of rows returned / exported. */
  rows?: number;
  /** Target staff sub / department id of an admin action. */
  target?: string;
  /** Short human-readable detail (e.g. "status pending->approved"). */
  detail?: string;
}

/** Record as returned by GET /api/admin/logs (name resolved). */
export type AuditListItem = AuditRecord & { id: string };

export interface AuditListResponse {
  items: AuditListItem[];
  /** Matching records (capped, see `truncated`). */
  total: number;
  page: number;
  pageSize: number;
  /** Pages available (records kept, at most maxRecords). */
  pages: number;
  /** Records kept per query (server cap). */
  maxRecords: number;
  /** More records matched than the server keeps for one query. */
  truncated: boolean;
  from: string;
  to: string;
}

/** Thai one-line description of the action-specific fields. */
export function describeAudit(r: AuditRecord): string {
  const parts: string[] = [];
  if (r.path) parts.push(`หน้า ${r.path}${r.query ? `?${r.query}` : ""}`);
  else if (r.query) parts.push(`เงื่อนไข ${r.query}`);
  if (r.code) {
    const district = r.code.startsWith("district:");
    parts.push(
      `${district ? "ตัวชี้วัดอำเภอ (HDC)" : "ตัวชี้วัด รพ."} ${
        district ? r.code.slice("district:".length) : r.code
      }`,
    );
  }
  if (r.fiscalYear !== undefined) parts.push(`ปีงบ ${r.fiscalYear}`);
  if (r.scope) parts.push(`พื้นที่ ${r.scope === "all" ? "ทั้งหมด" : r.scope}`);
  if (r.rows !== undefined) parts.push(`${r.rows.toLocaleString("th-TH")} แถว`);
  if (r.target) parts.push(`เป้าหมาย ${r.target}`);
  if (r.detail) parts.push(r.detail);
  return parts.join(" | ");
}
