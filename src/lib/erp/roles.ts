import "server-only";

import { listUsers } from "@/lib/users/store";
import { erpAudit } from "./audit";
import { erpQuery, withErpTransaction } from "./db";
import { ErpError, type ErpActor } from "./gate";
import {
  UNIT_SCOPED_ROLES,
  isErpRole,
  type ErpRole,
  type RoleCandidate,
  type RoleGrantRow,
} from "./types";
import { asObject, bad, optionalId, text } from "./validate";

/**
 * ERP role grants (erp_user_role) managed at /erp/admin (erp_admin only).
 * A grant targets an APPROVED web-app account (users.json, Provider ID
 * sub); approval in users.json stays the first gate, ERP roles only add
 * permissions inside /erp.
 */

export async function listRoleGrants(): Promise<RoleGrantRow[]> {
  const rows = await erpQuery<{
    id: number;
    sub: string;
    display_name: string;
    role: string;
    org_unit_id: number | null;
    org_unit_name: string | null;
    store_id: number | null;
    store_name: string | null;
    granted_at: string;
  }>(
    `SELECT r.id, r.sub, r.display_name, r.role, r.org_unit_id, u.name AS org_unit_name,
            r.store_id, s.name AS store_name, r.granted_at
       FROM erp_user_role r
       LEFT JOIN org_unit u ON u.id = r.org_unit_id
       LEFT JOIN store s ON s.id = r.store_id
      ORDER BY r.display_name, r.sub, r.role, r.id`,
  );
  return rows.flatMap((r) =>
    isErpRole(r.role)
      ? [
          {
            id: r.id,
            sub: r.sub,
            displayName: r.display_name,
            role: r.role,
            orgUnitId: r.org_unit_id,
            orgUnitName: r.org_unit_name,
            storeId: r.store_id,
            storeName: r.store_name,
            grantedAt: r.granted_at,
          },
        ]
      : [],
  );
}

/** Approved accounts of the web app (candidates for a grant). */
export async function listRoleCandidates(): Promise<RoleCandidate[]> {
  const users = await listUsers();
  return users
    .filter((u) => u.status === "approved")
    .map((u) => ({ sub: u.sub, name: u.name, orgName: u.orgName, jobPosition: u.jobPosition }))
    .sort((x, y) => x.name.localeCompare(y.name, "th"));
}

export interface GrantInput {
  sub: string;
  role: ErpRole;
  orgUnitId: number | null;
  storeId: number | null;
}

export function parseGrantBody(raw: unknown): GrantInput {
  const body = asObject(raw, ["sub", "role", "orgUnitId", "storeId"]);
  const sub = text(body.sub, "ผู้ใช้", { max: 256, required: true });
  if (!isErpRole(body.role)) bad("บทบาทไม่ถูกต้อง");
  const role = body.role;
  const orgUnitId = optionalId(body.orgUnitId, "หน่วยงาน");
  const storeId = optionalId(body.storeId, "คลัง");
  const unitScoped = UNIT_SCOPED_ROLES.includes(role);
  if (unitScoped && orgUnitId === null) bad("บทบาทนี้ต้องเลือกหน่วยงาน");
  if (!unitScoped && orgUnitId !== null) bad("บทบาทนี้ไม่ผูกกับหน่วยงาน");
  if (storeId !== null && role !== "store_officer") bad("เลือกคลังได้เฉพาะบทบาทเจ้าหน้าที่คลัง");
  return { sub, role, orgUnitId, storeId };
}

export async function grantRole(a: ErpActor, input: GrantInput): Promise<number> {
  const user = (await listUsers()).find((u) => u.sub === input.sub);
  if (!user || user.status !== "approved") {
    throw new ErpError(400, "ผู้ใช้นี้ยังไม่ได้รับอนุมัติให้เข้าระบบ (อนุมัติที่หน้า จัดการผู้ใช้งาน ก่อน)");
  }
  return withErpTransaction(async (tx) => {
    if (input.orgUnitId !== null) {
      const [u] = await tx.query(`SELECT 1 FROM org_unit WHERE id = $1 AND active`, [input.orgUnitId]);
      if (!u) throw new ErpError(400, "ไม่พบหน่วยงาน หรือหน่วยงานถูกปิดใช้งาน");
    }
    if (input.storeId !== null) {
      const [s] = await tx.query(`SELECT 1 FROM store WHERE id = $1 AND active`, [input.storeId]);
      if (!s) throw new ErpError(400, "ไม่พบคลัง หรือคลังถูกปิดใช้งาน");
    }
    const [row] = await tx.query<{ id: number }>(
      `INSERT INTO erp_user_role (sub, display_name, role, org_unit_id, store_id, granted_by)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [input.sub, user.name.slice(0, 200), input.role, input.orgUnitId, input.storeId, a.sub],
    );
    await erpAudit(tx, a, "role_grant", "erp_user_role", row.id, {
      sub: input.sub,
      role: input.role,
      orgUnitId: input.orgUnitId,
      storeId: input.storeId,
    });
    return row.id;
  });
}

export async function revokeRole(a: ErpActor, grantId: number): Promise<void> {
  await withErpTransaction(async (tx) => {
    const [row] = await tx.query<{ sub: string; role: string; org_unit_id: number | null; store_id: number | null }>(
      `DELETE FROM erp_user_role WHERE id = $1 RETURNING sub, role, org_unit_id, store_id`,
      [grantId],
    );
    if (!row) throw new ErpError(404, "ไม่พบสิทธิ์นี้");
    await erpAudit(tx, a, "role_revoke", "erp_user_role", grantId, {
      sub: row.sub,
      role: row.role,
      orgUnitId: row.org_unit_id,
      storeId: row.store_id,
    });
  });
}
