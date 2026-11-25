import "server-only";

import { erpAudit } from "./audit";
import { erpQuery, withErpTransaction, type Queryable, type SqlParam } from "./db";
import {
  canViewAll,
  ERP_MESSAGES,
  ErpError,
  hasUnitRole,
  isErpAdmin,
  isStoreOfficer,
  officerStoreIds,
  toErpMe,
  unitIdsWithRole,
  type ErpActor,
} from "./gate";
import {
  activeItems,
  activeStore,
  addEvent,
  decreaseStock,
  lockBalance,
  nextDocNo,
} from "./stock";
import type {
  DocStatus,
  ErpSummary,
  RequisitionActionInput,
  RequisitionDetail,
  RequisitionInput,
  RequisitionPermissions,
  RequisitionScope,
  RequisitionSummary,
} from "./types";
import { centsStr, fromUnits, QTY_SCALE, toCents, toUnits, unitCostOf, VALUE_SCALE, ZERO } from "./units";
import { idempotentCreate, parseIdempotencyKey } from "./idempotency";
import { isAdjustmentApprover, listAdjustments } from "./adjustments";

const SELF_APPROVAL = "ผู้สร้างใบเบิกอนุมัติใบของตนเองไม่ได้ ต้องให้หัวหน้าหน่วยงานคนอื่นอนุมัติ";
const SELF_ISSUE = "ผู้จ่ายต้องไม่ใช่ผู้สร้างหรือผู้อนุมัติใบเบิกนี้ ให้เจ้าหน้าที่คลังคนอื่นจ่าย";
import { array, asObject, decimal, id, QTY, text } from "./validate";

/**
 * ใบเบิกพัสดุ (REQUISITION) workflow:
 *
 *   draft --submit--> submitted --approve--> approved --issue--> issued
 *     |                  |  \--reject--> rejected
 *     \--cancel--> cancelled <--cancel--/ (approved: unit_head / store officer)
 *
 *   create / edit / submit   recorder or unit_head of the requesting unit
 *   approve / reject         unit_head of the requesting unit (may lower qty)
 *   issue                    store_officer of the store: stock out at
 *                            moving-average cost, charged to the unit
 *
 * Every action runs in one transaction that first locks the document row
 * (SELECT .. FOR UPDATE) and checks status + version: a double click or
 * two officers issuing at once -> the second one gets 409, never a
 * double issue. Permissions are evaluated on the server from erp_user_role.
 */

const MAX_LINES = 100;
const PAGE_SIZE = 50;
const UNIT_MEMBER_ROLES = ["recorder", "unit_head"] as const;

interface DocRow {
  id: number;
  status: DocStatus;
  version: number;
  org_unit_id: number;
  store_id: number;
  created_by: string;
  decided_by: string | null;
  doc_no: string | null;
}

// --- permissions ------------------------------------------------------------------

function canView(a: ErpActor, d: Pick<DocRow, "status" | "org_unit_id" | "store_id" | "created_by">) {
  return (
    canViewAll(a) ||
    d.created_by === a.sub ||
    hasUnitRole(a, UNIT_MEMBER_ROLES, d.org_unit_id) ||
    (d.status !== "draft" && isStoreOfficer(a, d.store_id))
  );
}

/**
 * Segregation of duties: the creator never approves their own
 * requisition, and the store officer who issues is neither the creator
 * nor the approver. erp_admin may cancel any pending document (e.g. the
 * unit was closed).
 */
function permissionsOf(
  a: ErpActor,
  d: Pick<DocRow, "status" | "org_unit_id" | "store_id" | "created_by" | "decided_by">,
): RequisitionPermissions {
  const member = hasUnitRole(a, UNIT_MEMBER_ROLES, d.org_unit_id);
  const head = hasUnitRole(a, ["unit_head"], d.org_unit_id);
  const officer = isStoreOfficer(a, d.store_id);
  const isCreator = d.created_by === a.sub;
  const isApprover = d.decided_by !== null && d.decided_by === a.sub;
  const selfApprovalBlocked = d.status === "submitted" && head && isCreator;
  const selfIssueBlocked = d.status === "approved" && officer && (isCreator || isApprover);
  return {
    canEdit: d.status === "draft" && member,
    canSubmit: d.status === "draft" && member,
    canApprove: d.status === "submitted" && head && !isCreator,
    canIssue: d.status === "approved" && officer && !isCreator && !isApprover,
    canCancel:
      ((d.status === "draft" || d.status === "submitted") && member) ||
      (d.status === "approved" && (head || officer)) ||
      ((d.status === "submitted" || d.status === "approved") && isErpAdmin(a)),
    selfApprovalBlocked,
    selfIssueBlocked,
  };
}

// --- body parsing -------------------------------------------------------------------

export function parseRequisitionInput(raw: unknown, withVersion: boolean): RequisitionInput & { version?: number } {
  const body = asObject(raw, [
    "orgUnitId",
    "storeId",
    "purpose",
    "lines",
    ...(withVersion ? ["version"] : ["idempotencyKey"]),
  ]);
  const lines = array(body.lines, "รายการพัสดุ", { min: 1, max: MAX_LINES }).map((l, i) => {
    const line = asObject(l, ["itemId", "qty", "note"], `รายการที่ ${i + 1} `);
    return {
      itemId: id(line.itemId, `พัสดุรายการที่ ${i + 1}`),
      qty: decimal(line.qty, `จำนวนรายการที่ ${i + 1}`, { ...QTY, minExclusive: true }).value,
      note: text(line.note, `หมายเหตุรายการที่ ${i + 1}`, { max: 200 }),
    };
  });
  const seen = new Set<number>();
  for (const l of lines) {
    if (seen.has(l.itemId)) throw new ErpError(400, "มีพัสดุซ้ำกันในใบเบิก กรุณารวมเป็นรายการเดียว");
    seen.add(l.itemId);
  }
  return {
    orgUnitId: id(body.orgUnitId, "หน่วยงาน"),
    storeId: id(body.storeId, "คลัง"),
    purpose: text(body.purpose, "วัตถุประสงค์", { max: 500, multiline: true }),
    lines,
    ...(withVersion
      ? { version: id(body.version, "version") }
      : { idempotencyKey: parseIdempotencyKey(body.idempotencyKey) }),
  };
}

export function parseActionInput(raw: unknown): RequisitionActionInput {
  const body = asObject(raw, ["action", "version", "note", "lines"]);
  const action = body.action;
  if (action !== "submit" && action !== "approve" && action !== "reject" && action !== "issue" && action !== "cancel") {
    throw new ErpError(400, "action ไม่ถูกต้อง");
  }
  const lines =
    body.lines === undefined
      ? undefined
      : array(body.lines, "รายการ", { min: 0, max: MAX_LINES }).map((l, i) => {
          const line = asObject(l, ["lineId", "qty"], `รายการที่ ${i + 1} `);
          return {
            lineId: id(line.lineId, `รายการที่ ${i + 1}`),
            qty: decimal(line.qty, `จำนวนรายการที่ ${i + 1}`, QTY).value,
          };
        });
  return {
    action,
    version: id(body.version, "version"),
    note: text(body.note, "หมายเหตุ", { max: 500, multiline: true }),
    lines,
  };
}

// --- queries ----------------------------------------------------------------------------

interface SummaryRow {
  id: number;
  doc_no: string | null;
  status: DocStatus;
  org_unit_id: number;
  org_unit_name: string;
  store_id: number;
  store_name: string;
  purpose: string;
  line_count: number;
  total_amount: number | null;
  created_by_name: string;
  created_at: string;
  submitted_at: string | null;
  updated_at: string;
}

const SUMMARY_SELECT = `
  SELECT d.id, d.doc_no, d.status, d.org_unit_id, u.name AS org_unit_name,
         d.store_id, s.name AS store_name, d.purpose,
         (SELECT count(*)::int FROM document_line l WHERE l.document_id = d.id) AS line_count,
         d.total_amount, d.created_by_name, d.created_at, d.submitted_at, d.updated_at`;

function toSummary(r: SummaryRow): RequisitionSummary {
  return {
    id: r.id,
    docNo: r.doc_no,
    status: r.status,
    orgUnitId: r.org_unit_id,
    orgUnitName: r.org_unit_name,
    storeId: r.store_id,
    storeName: r.store_name,
    purpose: r.purpose,
    lineCount: r.line_count,
    totalAmount: r.total_amount,
    createdByName: r.created_by_name,
    createdAt: r.created_at,
    submittedAt: r.submitted_at,
    updatedAt: r.updated_at,
  };
}

/** WHERE fragment + params of a list scope (null = actor may not use the scope). */
function scopeCondition(a: ErpActor, scope: RequisitionScope, params: SqlParam[]): string | null {
  const p = (v: SqlParam) => {
    params.push(v);
    return `$${params.length}`;
  };
  switch (scope) {
    case "mine": {
      const units = unitIdsWithRole(a, UNIT_MEMBER_ROLES);
      return `(d.org_unit_id = ANY(${p(units)}::bigint[]) OR d.created_by = ${p(a.sub)})`;
    }
    case "approve": {
      const heads = unitIdsWithRole(a, ["unit_head"]);
      return `d.status = 'submitted' AND d.org_unit_id = ANY(${p(heads)}::bigint[]) AND d.created_by <> ${p(a.sub)}`;
    }
    case "issue": {
      const stores = officerStoreIds(a);
      // segregation of duties: not my own / not approved by me
      const notMine = `d.created_by <> ${p(a.sub)} AND d.decided_by IS DISTINCT FROM ${p(a.sub)}`;
      if (stores === null) return `d.status = 'approved' AND ${notMine}`;
      return `d.status = 'approved' AND d.store_id = ANY(${p(stores)}::bigint[]) AND ${notMine}`;
    }
    case "all": {
      if (canViewAll(a)) return "TRUE";
      const stores = officerStoreIds(a);
      if (stores === null) return `d.status <> 'draft'`;
      if (stores.length === 0) return null;
      return `d.status <> 'draft' AND d.store_id = ANY(${p(stores)}::bigint[])`;
    }
  }
}

export async function listRequisitions(
  a: ErpActor,
  scope: RequisitionScope,
  opts: { status: DocStatus | null; page: number; pageSize?: number; q?: string },
): Promise<{ items: RequisitionSummary[]; total: number; page: number; pageSize: number }> {
  const params: SqlParam[] = [];
  const cond = scopeCondition(a, scope, params);
  if (cond === null) throw new ErpError(403, ERP_MESSAGES.forbidden);
  const pageSize = opts.pageSize ?? PAGE_SIZE;
  params.push(opts.status);
  const statusParam = `$${params.length}`;
  // Doc-no prefix search: validated, LIKE wildcards escaped, always parameterized.
  const docNoQuery = text(opts.q, "คำค้นหา", { max: 30 });
  params.push(docNoQuery.replace(/[\\%_]/g, "\\$&"));
  const qParam = `$${params.length}`;
  params.push(pageSize, (opts.page - 1) * pageSize);
  const rows = await erpQuery<SummaryRow & { total: number }>(
    `${SUMMARY_SELECT}, count(*) OVER () AS total
       FROM document d
       JOIN org_unit u ON u.id = d.org_unit_id
       JOIN store s ON s.id = d.store_id
      WHERE d.doc_type = 'REQUISITION' AND ${cond}
        AND (${statusParam}::text IS NULL OR d.status = ${statusParam})
        AND (${qParam}::text = '' OR d.doc_no ILIKE ${qParam}::text || '%')
      ORDER BY d.updated_at DESC, d.id DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
  return {
    items: rows.map(toSummary),
    total: rows[0]?.total ?? 0,
    page: opts.page,
    pageSize,
  };
}

export async function getRequisition(a: ErpActor, docId: number): Promise<RequisitionDetail> {
  const [d] = await erpQuery<
    SummaryRow & {
      version: number;
      fiscal_year: number | null;
      created_by: string;
      decided_by: string | null;
      decided_by_name: string | null;
      decided_at: string | null;
      completed_by_name: string | null;
      completed_at: string | null;
    }
  >(
    `${SUMMARY_SELECT}, d.version, d.fiscal_year, d.created_by, d.decided_by, d.decided_by_name, d.decided_at,
            d.completed_by_name, d.completed_at
       FROM document d
       JOIN org_unit u ON u.id = d.org_unit_id
       JOIN store s ON s.id = d.store_id
      WHERE d.id = $1 AND d.doc_type = 'REQUISITION'`,
    [docId],
  );
  // Not visible = not found (no existence leak).
  if (!d || !canView(a, d)) throw new ErpError(404, "ไม่พบใบเบิก");
  const [lines, events] = await Promise.all([
    erpQuery<{
      id: number;
      line_no: number;
      item_id: number;
      code: string;
      name: string;
      unit: string;
      qty: number;
      qty_approved: number | null;
      qty_issued: number | null;
      unit_cost: number | null;
      amount: number | null;
      note: string;
      on_hand: number | null;
    }>(
      `SELECT l.id, l.line_no, l.item_id, i.code, i.name, i.unit, l.qty, l.qty_approved, l.qty_issued,
              l.unit_cost, l.amount, l.note, b.qty_on_hand AS on_hand
         FROM document_line l
         JOIN item i ON i.id = l.item_id
         LEFT JOIN stock_balance b ON b.store_id = $2 AND b.item_id = l.item_id
        WHERE l.document_id = $1
        ORDER BY l.line_no`,
      [docId, d.store_id],
    ),
    erpQuery<{
      id: number;
      action: string;
      from_status: string | null;
      to_status: string | null;
      actor_name: string;
      note: string;
      created_at: string;
    }>(
      `SELECT id, action, from_status, to_status, actor_name, note, created_at
         FROM document_event WHERE document_id = $1 ORDER BY id`,
      [docId],
    ),
  ]);
  return {
    ...toSummary(d),
    version: d.version,
    fiscalYear: d.fiscal_year,
    createdBy: d.created_by,
    decidedByName: d.decided_by_name,
    decidedAt: d.decided_at,
    completedByName: d.completed_by_name,
    completedAt: d.completed_at,
    lines: lines.map((l) => ({
      id: l.id,
      lineNo: l.line_no,
      itemId: l.item_id,
      itemCode: l.code,
      itemName: l.name,
      unit: l.unit,
      qty: l.qty,
      qtyApproved: l.qty_approved,
      qtyIssued: l.qty_issued,
      unitCost: l.unit_cost,
      amount: l.amount,
      note: l.note,
      onHand: l.on_hand ?? 0,
    })),
    events: events.map((e) => ({
      id: e.id,
      action: e.action,
      fromStatus: e.from_status,
      toStatus: e.to_status,
      actorName: e.actor_name,
      note: e.note,
      createdAt: e.created_at,
    })),
    permissions: permissionsOf(a, d),
  };
}

// --- mutations ------------------------------------------------------------------------

async function checkUnitAndStore(tx: Queryable, a: ErpActor, input: RequisitionInput) {
  const [u] = await tx.query(`SELECT 1 FROM org_unit WHERE id = $1 AND active`, [input.orgUnitId]);
  if (!u) throw new ErpError(400, "ไม่พบหน่วยงาน หรือหน่วยงานถูกปิดใช้งาน");
  if (!hasUnitRole(a, UNIT_MEMBER_ROLES, input.orgUnitId)) throw new ErpError(403, "คุณไม่มีสิทธิ์บันทึกใบเบิกของหน่วยงานนี้");
  await activeStore(tx, input.storeId);
  await activeItems(tx, input.lines.map((l) => l.itemId));
}

async function insertLines(tx: Queryable, docId: number, input: RequisitionInput) {
  for (const [i, l] of input.lines.entries()) {
    await tx.query(
      `INSERT INTO document_line (document_id, line_no, item_id, qty, note) VALUES ($1, $2, $3, $4, $5)`,
      [docId, i + 1, l.itemId, fromUnits(toUnits(l.qty, QTY_SCALE), QTY_SCALE), l.note ?? ""],
    );
  }
}

/** New draft. Same idempotencyKey again -> the first draft's id (replayed). */
export async function createRequisition(
  a: ErpActor,
  input: RequisitionInput,
): Promise<{ id: number; replayed: boolean }> {
  const key = input.idempotencyKey;
  if (!key) throw new ErpError(400, "idempotencyKey ไม่ถูกต้อง (ต้องเป็น UUID)");
  return idempotentCreate(
    a,
    key,
    "REQUISITION",
    async () => ({ id: await insertRequisition(a, input, key), replayed: false as boolean }),
    async (row) => ({ id: row.id, replayed: true as boolean }),
  );
}

async function insertRequisition(a: ErpActor, input: RequisitionInput, key: string): Promise<number> {
  return withErpTransaction(async (tx) => {
    await checkUnitAndStore(tx, a, input);
    const [doc] = await tx.query<{ id: number }>(
      `INSERT INTO document (doc_type, status, org_unit_id, store_id, purpose, created_by, created_by_name, idempotency_key)
       VALUES ('REQUISITION', 'draft', $1, $2, $3, $4, $5, $6::uuid) RETURNING id`,
      [input.orgUnitId, input.storeId, input.purpose, a.sub, a.name.slice(0, 200), key],
    );
    await insertLines(tx, doc.id, input);
    await addEvent(tx, a, doc.id, "create", null, "draft");
    await erpAudit(tx, a, "requisition_create", "document", doc.id, {
      orgUnitId: input.orgUnitId,
      storeId: input.storeId,
      lines: input.lines.length,
    });
    return doc.id;
  });
}

async function lockDoc(tx: Queryable, a: ErpActor, docId: number, version: number): Promise<DocRow> {
  const [d] = await tx.query<DocRow>(
    `SELECT id, status, version, org_unit_id, store_id, created_by, decided_by, doc_no
       FROM document WHERE id = $1 AND doc_type = 'REQUISITION' FOR UPDATE`,
    [docId],
  );
  if (!d || !canView(a, d)) throw new ErpError(404, "ไม่พบใบเบิก");
  if (d.version !== version) throw new ErpError(409, ERP_MESSAGES.stale, "stale");
  return d;
}

export async function updateRequisition(
  a: ErpActor,
  docId: number,
  version: number,
  input: RequisitionInput,
): Promise<void> {
  await withErpTransaction(async (tx) => {
    const d = await lockDoc(tx, a, docId, version);
    if (!permissionsOf(a, d).canEdit) throw new ErpError(409, "แก้ไขได้เฉพาะใบเบิกสถานะร่างของหน่วยงานคุณ");
    await checkUnitAndStore(tx, a, input);
    await tx.query(`DELETE FROM document_line WHERE document_id = $1`, [docId]);
    await insertLines(tx, docId, input);
    await tx.query(
      `UPDATE document SET org_unit_id = $2, store_id = $3, purpose = $4,
              version = version + 1, updated_at = now() WHERE id = $1`,
      [docId, input.orgUnitId, input.storeId, input.purpose],
    );
    await addEvent(tx, a, docId, "update", "draft", "draft");
    await erpAudit(tx, a, "requisition_update", "document", docId, { lines: input.lines.length });
  });
}

interface LineRow {
  id: number;
  item_id: number;
  code: string;
  name: string;
  qty: string;
  qty_approved: string | null;
}

async function docLines(tx: Queryable, docId: number): Promise<LineRow[]> {
  return tx.query<LineRow>(
    `SELECT l.id, l.item_id, i.code, i.name, l.qty::text AS qty, l.qty_approved::text AS qty_approved
       FROM document_line l JOIN item i ON i.id = l.item_id
      WHERE l.document_id = $1 ORDER BY l.line_no`,
    [docId],
  );
}

/** Per-line quantities from the body (default = `fallback`), validated against `limit`. */
function lineQuantities(
  lines: LineRow[],
  input: RequisitionActionInput,
  fallback: (l: LineRow) => bigint,
  limitLabel: string,
): Map<number, bigint> {
  const byId = new Map(lines.map((l) => [l.id, l]));
  const result = new Map<number, bigint>(lines.map((l) => [l.id, fallback(l)]));
  for (const x of input.lines ?? []) {
    const line = byId.get(x.lineId);
    if (!line) throw new ErpError(400, "มีรายการที่ไม่อยู่ในใบเบิกนี้");
    const q = toUnits(x.qty, QTY_SCALE);
    if (q > fallback(line)) throw new ErpError(400, `${line.code} ${line.name}: จำนวนต้องไม่เกิน${limitLabel}`);
    result.set(line.id, q);
  }
  if ([...result.values()].every((q) => q === ZERO)) {
    throw new ErpError(400, "ต้องมีอย่างน้อย 1 รายการที่จำนวนมากกว่า 0 (ถ้าไม่ต้องการทั้งหมด ให้ใช้ไม่อนุมัติ/ยกเลิก)");
  }
  return result;
}

export async function requisitionAction(a: ErpActor, docId: number, input: RequisitionActionInput): Promise<void> {
  await withErpTransaction(async (tx) => {
    const d = await lockDoc(tx, a, docId, input.version);
    const perm = permissionsOf(a, d);
    const note = input.note ?? "";
    const name = a.name.slice(0, 200);

    switch (input.action) {
      case "submit": {
        if (!perm.canSubmit) throw new ErpError(409, "ส่งได้เฉพาะใบเบิกสถานะร่างของหน่วยงานคุณ");
        const lines = await docLines(tx, docId);
        if (lines.length === 0) throw new ErpError(400, "ใบเบิกยังไม่มีรายการพัสดุ");
        const { docNo, fiscalYear } = await nextDocNo(tx, "REQUISITION");
        await tx.query(
          `UPDATE document SET status = 'submitted', doc_no = $2, fiscal_year = $3, submitted_at = now(),
                  version = version + 1, updated_at = now() WHERE id = $1`,
          [docId, docNo, fiscalYear],
        );
        await tx.query(
          `INSERT INTO approval_step (document_id, step_no, required_role, org_unit_id) VALUES ($1, 1, 'unit_head', $2)`,
          [docId, d.org_unit_id],
        );
        await addEvent(tx, a, docId, "submit", d.status, "submitted", note);
        await erpAudit(tx, a, "requisition_submit", "document", docId, { docNo });
        return;
      }
      case "approve": {
        if (perm.selfApprovalBlocked) throw new ErpError(403, SELF_APPROVAL, "self_approval");
        if (!perm.canApprove) throw new ErpError(409, "อนุมัติได้เฉพาะใบเบิกที่รออนุมัติของหน่วยงานที่คุณเป็นหัวหน้า");
        const lines = await docLines(tx, docId);
        const qty = lineQuantities(lines, input, (l) => toUnits(l.qty, QTY_SCALE), "จำนวนที่ขอ");
        for (const [lineId, q] of qty) {
          await tx.query(`UPDATE document_line SET qty_approved = $2 WHERE id = $1`, [lineId, fromUnits(q, QTY_SCALE)]);
        }
        await tx.query(
          `UPDATE document SET status = 'approved', decided_by = $2, decided_by_name = $3, decided_at = now(),
                  version = version + 1, updated_at = now() WHERE id = $1`,
          [docId, a.sub, name],
        );
        await tx.query(
          `UPDATE approval_step SET status = 'approved', decided_by = $2, decided_by_name = $3,
                  decided_at = now(), note = $4
            WHERE document_id = $1 AND status = 'pending'`,
          [docId, a.sub, name, note],
        );
        const changed = lines.filter((l) => qty.get(l.id) !== toUnits(l.qty, QTY_SCALE)).length;
        await addEvent(tx, a, docId, "approve", d.status, "approved", note);
        await erpAudit(tx, a, "requisition_approve", "document", docId, { docNo: d.doc_no, changedLines: changed });
        return;
      }
      case "reject": {
        if (perm.selfApprovalBlocked) throw new ErpError(403, SELF_APPROVAL, "self_approval");
        if (!perm.canApprove) throw new ErpError(409, "ไม่อนุมัติได้เฉพาะใบเบิกที่รออนุมัติของหน่วยงานที่คุณเป็นหัวหน้า");
        if (!note) throw new ErpError(400, "กรุณาระบุเหตุผลที่ไม่อนุมัติ");
        await tx.query(
          `UPDATE document SET status = 'rejected', decided_by = $2, decided_by_name = $3, decided_at = now(),
                  version = version + 1, updated_at = now() WHERE id = $1`,
          [docId, a.sub, name],
        );
        await tx.query(
          `UPDATE approval_step SET status = 'rejected', decided_by = $2, decided_by_name = $3,
                  decided_at = now(), note = $4
            WHERE document_id = $1 AND status = 'pending'`,
          [docId, a.sub, name, note],
        );
        await addEvent(tx, a, docId, "reject", d.status, "rejected", note);
        await erpAudit(tx, a, "requisition_reject", "document", docId, { docNo: d.doc_no });
        return;
      }
      case "issue": {
        if (perm.selfIssueBlocked) throw new ErpError(403, SELF_ISSUE, "self_issue");
        if (!perm.canIssue) throw new ErpError(409, "จ่ายได้เฉพาะใบเบิกที่อนุมัติแล้วของคลังที่คุณดูแล");
        await activeStore(tx, d.store_id);
        const lines = await docLines(tx, docId);
        const qty = lineQuantities(
          lines,
          input,
          (l) => (l.qty_approved === null ? ZERO : toUnits(l.qty_approved, QTY_SCALE)),
          "จำนวนที่อนุมัติ",
        );
        // Header total = sum of the rounded line amounts.
        let totalCents = ZERO;
        // Lock order: ascending item id (items are unique per requisition).
        for (const l of [...lines].sort((x, y) => x.item_id - y.item_id)) {
          const q = qty.get(l.id) ?? ZERO;
          if (q === ZERO) {
            await tx.query(
              `UPDATE document_line SET qty_issued = 0, unit_cost = NULL, amount = 0 WHERE id = $1`,
              [l.id],
            );
            continue;
          }
          const bal = await lockBalance(tx, d.store_id, l.item_id);
          const { valueU } = await decreaseStock(
            tx,
            {
              actor: a,
              type: "ISSUE",
              storeId: d.store_id,
              itemId: l.item_id,
              documentId: docId,
              documentLineId: l.id,
              orgUnitId: d.org_unit_id,
              note: d.doc_no ?? "",
            },
            bal,
            q,
            `${l.code} ${l.name}`,
            // never hand out expired lots
            { allowExpired: false },
          );
          const lineCents = toCents(valueU);
          totalCents += lineCents;
          await tx.query(
            `UPDATE document_line SET qty_issued = $2, unit_cost = $3, amount = $4 WHERE id = $1`,
            [l.id, fromUnits(q, QTY_SCALE), fromUnits(unitCostOf(valueU, q), VALUE_SCALE), centsStr(lineCents)],
          );
        }
        await tx.query(
          `UPDATE document SET status = 'issued', total_amount = $2, completed_by = $3, completed_by_name = $4,
                  completed_at = now(), version = version + 1, updated_at = now() WHERE id = $1`,
          [docId, centsStr(totalCents), a.sub, name],
        );
        await addEvent(tx, a, docId, "issue", d.status, "issued", note);
        await erpAudit(tx, a, "requisition_issue", "document", docId, {
          docNo: d.doc_no,
          storeId: d.store_id,
          orgUnitId: d.org_unit_id,
          total: centsStr(totalCents),
        });
        return;
      }
      case "cancel": {
        if (!perm.canCancel) throw new ErpError(409, "ไม่สามารถยกเลิกใบเบิกนี้ได้");
        await tx.query(
          `UPDATE document SET status = 'cancelled', version = version + 1, updated_at = now() WHERE id = $1`,
          [docId],
        );
        await tx.query(
          `UPDATE approval_step SET status = 'cancelled' WHERE document_id = $1 AND status = 'pending'`,
          [docId],
        );
        await addEvent(tx, a, docId, "cancel", d.status, "cancelled", note);
        await erpAudit(tx, a, "requisition_cancel", "document", docId, { docNo: d.doc_no, from: d.status });
        return;
      }
    }
  });
}

// --- home -----------------------------------------------------------------------------------

export async function erpSummary(a: ErpActor): Promise<ErpSummary> {
  const opts = { status: null, page: 1, pageSize: 10 };
  const heads = unitIdsWithRole(a, ["unit_head"]);
  const stores = officerStoreIds(a);
  const approver = isAdjustmentApprover(a);
  const [toApprove, toIssue, mine, drafts, adjustments] = await Promise.all([
    heads.length > 0 ? listRequisitions(a, "approve", opts) : null,
    stores === null || stores.length > 0 ? listRequisitions(a, "issue", opts) : null,
    listRequisitions(a, "mine", opts),
    listRequisitions(a, "mine", { ...opts, status: "draft", pageSize: 1 }),
    approver ? listAdjustments(a, { status: "submitted", storeId: null, limit: 10 }) : null,
  ]);
  // only the ones I may approve (not my own)
  const pendingAdjustments = (adjustments?.rows ?? []).filter((r) => r.canApprove);
  return {
    me: toErpMe(a),
    toApprove: toApprove?.items ?? [],
    toIssue: toIssue?.items ?? [],
    mine: mine.items,
    adjustmentsToApprove: pendingAdjustments,
    counts: {
      toApprove: toApprove?.total ?? 0,
      toIssue: toIssue?.total ?? 0,
      drafts: drafts.total,
      adjustmentsToApprove: pendingAdjustments.length,
    },
  };
}
