import "server-only";

import { erpAudit } from "./audit";
import { erpQuery, withErpTransaction, type Queryable, type SqlParam } from "./db";
import { ErpError, type ErpActor } from "./gate";
import {
  MASTER_SPECS,
  type MasterEntity,
  type MasterField,
  type MasterRow,
} from "./master-schema";
import { asObject, bad, bool, code, decimal, optionalId, text } from "./validate";

/**
 * Generic CRUD of master data (erp_admin only, enforced by the route).
 * Table / column names come from the constant map below — never from the
 * request — and every value is a bind parameter. No hard delete: rows
 * are deactivated (`active=false`) so documents keep their references.
 */

const TABLES: Record<MasterEntity, { table: string; order: string; columns: Record<string, string> }> = {
  "org-units": {
    table: "org_unit",
    order: "code",
    columns: { code: "code", name: "name", parentId: "parent_id", isCostCenter: "is_cost_center", active: "active" },
  },
  stores: {
    table: "store",
    order: "code",
    columns: { code: "code", name: "name", orgUnitId: "org_unit_id", active: "active" },
  },
  categories: {
    table: "item_category",
    order: "code",
    columns: { code: "code", name: "name", active: "active" },
  },
  items: {
    table: "item",
    order: "code",
    columns: {
      code: "code",
      name: "name",
      unit: "unit",
      categoryId: "category_id",
      spec: "spec",
      lastUnitCost: "last_unit_cost",
      reorderPoint: "reorder_point",
      active: "active",
    },
  },
  vendors: {
    table: "vendor",
    order: "name",
    columns: { code: "code", name: "name", taxId: "tax_id", phone: "phone", address: "address", active: "active" },
  },
  staff: {
    table: "staff",
    order: "full_name",
    columns: {
      employeeCode: "employee_code",
      fullName: "full_name",
      position: "position",
      employmentType: "employment_type",
      orgUnitId: "org_unit_id",
      sub: "sub",
      active: "active",
    },
  },
};

const REF_TABLE: Record<MasterEntity, string> = {
  "org-units": "org_unit",
  stores: "store",
  categories: "item_category",
  items: "item",
  vendors: "vendor",
  staff: "staff",
};

function selectList(entity: MasterEntity): string {
  const { columns } = TABLES[entity];
  const cols = Object.entries(columns).map(([field, col]) => `${col} AS "${field}"`);
  return `id, ${cols.join(", ")}, created_at AS "createdAt", updated_at AS "updatedAt"`;
}

export const MASTER_LIST_LIMIT = 10_000;

export async function listMaster(entity: MasterEntity): Promise<MasterRow[]> {
  const t = TABLES[entity];
  return erpQuery<MasterRow>(
    `SELECT ${selectList(entity)} FROM ${t.table} ORDER BY ${t.order}, id LIMIT ${MASTER_LIST_LIMIT}`,
  );
}

/** Validate one field value; `undefined` = not sent (patch). Returns SQL param. */
function fieldValue(f: MasterField, raw: unknown): SqlParam {
  switch (f.kind) {
    case "code":
      return code(raw, f.label, { max: f.max, required: f.required });
    case "text": {
      const v = text(raw, f.label, { max: f.max, required: f.required, multiline: f.multiline });
      // optional unique text columns (staff.sub) store NULL, not ""
      return f.name === "sub" ? v || null : v;
    }
    case "ref":
      return optionalId(raw, f.label);
    case "bool":
      return bool(raw, f.label);
    case "decimal":
      if (raw === null) return "0";
      return decimal(raw, f.label, { scale: f.scale, min: 0, max: f.max }).sql;
    case "enum":
      if (typeof raw !== "string" || !f.options.some((o) => o.value === raw)) bad(`${f.label}ไม่ถูกต้อง`);
      return raw;
  }
}

function defaultValue(f: MasterField): SqlParam {
  switch (f.kind) {
    case "bool":
      return f.default;
    case "enum":
      return f.default;
    case "decimal":
      return "0";
    case "ref":
      return null;
    case "code":
      if (f.required) bad(`กรุณากรอก${f.label}`);
      return null;
    case "text":
      if (f.required) bad(`กรุณากรอก${f.label}`);
      return f.name === "sub" ? null : "";
  }
}

export function parseMasterBody(entity: MasterEntity, raw: unknown, mode: "create" | "patch"): Map<string, SqlParam> {
  const spec = MASTER_SPECS[entity];
  const body = asObject(raw, spec.fields.map((f) => f.name));
  const values = new Map<string, SqlParam>();
  for (const f of spec.fields) {
    if (body[f.name] === undefined) {
      if (mode === "create") values.set(f.name, defaultValue(f));
      continue;
    }
    values.set(f.name, fieldValue(f, body[f.name]));
  }
  if (values.size === 0) bad("ไม่มีข้อมูลที่จะบันทึก");
  return values;
}

async function checkRefs(tx: Queryable, entity: MasterEntity, values: Map<string, SqlParam>, selfId: number | null) {
  for (const f of MASTER_SPECS[entity].fields) {
    if (f.kind !== "ref") continue;
    const v = values.get(f.name);
    if (v === undefined || v === null) continue;
    const [row] = await tx.query(`SELECT 1 FROM ${REF_TABLE[f.ref]} WHERE id = $1`, [v]);
    if (!row) throw new ErpError(400, `ไม่พบ${f.label}ที่เลือก`);
  }
  // org unit hierarchy must stay a tree (no cycle through the new parent)
  const parent = values.get("parentId");
  if (entity === "org-units" && selfId !== null && typeof parent === "number") {
    const [cycle] = await tx.query(
      `WITH RECURSIVE up (id, parent_id, depth) AS (
         SELECT id, parent_id, 1 FROM org_unit WHERE id = $1
         UNION ALL
         SELECT o.id, o.parent_id, up.depth + 1 FROM org_unit o JOIN up ON o.id = up.parent_id
          WHERE up.depth < 100)
       SELECT 1 FROM up WHERE id = $2 LIMIT 1`,
      [parent, selfId],
    );
    if (cycle) throw new ErpError(400, "ไม่สามารถตั้งหน่วยงานแม่เป็นหน่วยงานลูกของตัวเองได้");
  }
}

/**
 * A unit / store with open documents (draft, submitted, approved) cannot be
 * deactivated: nobody could approve / issue them any more. erp_admin
 * cancels them first (cancel is allowed for erp_admin on pending documents).
 */
async function checkNoPendingDocs(tx: Queryable, entity: MasterEntity, rowId: number) {
  const column = entity === "org-units" ? "org_unit_id" : entity === "stores" ? "store_id" : null;
  if (!column) return;
  const [r] = await tx.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM document
      WHERE ${column} = $1 AND status IN ('draft', 'submitted', 'approved')`,
    [rowId],
  );
  if (r && r.n > 0) {
    throw new ErpError(
      409,
      `ยังมีเอกสารค้าง ${r.n.toLocaleString("th-TH")} ใบ (ร่าง/รออนุมัติ/รอจ่าย) กรุณาดำเนินการหรือยกเลิกก่อนปิดใช้งาน`,
      "pending_documents",
    );
  }
}

export async function createMaster(a: ErpActor, entity: MasterEntity, values: Map<string, SqlParam>): Promise<MasterRow> {
  const t = TABLES[entity];
  return withErpTransaction(async (tx) => {
    await checkRefs(tx, entity, values, null);
    const fields = [...values.keys()];
    const [row] = await tx.query<MasterRow>(
      `INSERT INTO ${t.table} (${fields.map((f) => t.columns[f]).join(", ")})
       VALUES (${fields.map((_, i) => `$${i + 1}`).join(", ")})
       RETURNING ${selectList(entity)}`,
      fields.map((f) => values.get(f) as SqlParam),
    );
    // Field NAMES only: values may be personal data (staff name / sub, vendor phone / address / tax id).
    await erpAudit(tx, a, "master_create", entity, row.id, { fields });
    return row;
  });
}

export async function updateMaster(
  a: ErpActor,
  entity: MasterEntity,
  rowId: number,
  values: Map<string, SqlParam>,
): Promise<MasterRow> {
  const t = TABLES[entity];
  return withErpTransaction(async (tx) => {
    if (entity === "org-units" && values.get("parentId") === rowId) {
      throw new ErpError(400, "ไม่สามารถตั้งหน่วยงานแม่เป็นตัวเองได้");
    }
    await checkRefs(tx, entity, values, rowId);
    const [old] = await tx.query<MasterRow>(
      `SELECT ${selectList(entity)} FROM ${t.table} WHERE id = $1 FOR UPDATE`,
      [rowId],
    );
    if (!old) throw new ErpError(404, "ไม่พบข้อมูล");
    if (values.get("active") === false && old.active === true) await checkNoPendingDocs(tx, entity, rowId);
    const fields = [...values.keys()];
    const [row] = await tx.query<MasterRow>(
      `UPDATE ${t.table}
          SET ${fields.map((f, i) => `${t.columns[f]} = $${i + 2}`).join(", ")}, updated_at = now()
        WHERE id = $1
        RETURNING ${selectList(entity)}`,
      [rowId, ...fields.map((f) => values.get(f) as SqlParam)],
    );
    if (!row) throw new ErpError(404, "ไม่พบข้อมูล");
    // Names of the fields that actually changed (no values: may be personal data).
    const changed = fields.filter((f) => String(old[f] ?? "") !== String(row[f] ?? ""));
    if (changed.length > 0) await erpAudit(tx, a, "master_update", entity, rowId, { fields: changed });
    return row;
  });
}
