import "server-only";

import { erpAudit } from "./audit";
import { erpQuery, withErpTransaction, type Queryable, type SqlParam } from "./db";
import {
  canViewAll,
  ERP_MESSAGES,
  ErpError,
  isErpAdmin,
  isStoreOfficer,
  officerStoreIds,
  type ErpActor,
} from "./gate";
import { idempotentCreate } from "./idempotency";
import {
  activeItems,
  activeStore,
  addEvent,
  decreaseStock,
  increaseStock,
  lockBalance,
  nextDocNo,
  replayPosted,
  type MovementContext,
} from "./stock";
import type {
  AdjustmentAction,
  AdjustmentInput,
  AdjustmentRow,
  DocStatus,
  PostedDocResponse,
} from "./types";
import { asObject, decimal, id, isoDate, QTY, text } from "./validate";
import { parseIdempotencyKey } from "./idempotency";
import {
  centsStr,
  fromUnits,
  lineValue,
  QTY_SCALE,
  toCents,
  toUnits,
  unitCostOf,
  VALUE_SCALE,
  ZERO,
} from "./units";

/**
 * Stock adjustment / stock count (ADJUSTMENT documents) with two-person
 * control:
 *
 *   store officer creates  -> submitted (number AJ<FY>-NNNNN, no stock change)
 *   finance / director, NOT the creator:
 *       approve -> posted (stock + ledger change now) | reject -> rejected
 *   creator / store officer / erp_admin: cancel (while submitted)
 *
 * Cost of an increase is never typed in: moving average of the store, or
 * the item's latest receipt price when the balance is 0. A count stores
 * the balance the officer saw (expected_qty); the approval re-checks it
 * against the locked balance and refuses (409) when stock moved since the
 * count (count again). Decreases may write off expired lots; a lot number
 * targets that lot only.
 */

const fmtQ = (u: bigint) => Number(fromUnits(u, QTY_SCALE)).toLocaleString("th-TH");

export function isAdjustmentApprover(a: ErpActor): boolean {
  return a.roles.some((r) => r.role === "finance" || r.role === "director");
}

export function parseAdjustmentBody(raw: unknown): AdjustmentInput {
  const body = asObject(raw, ["storeId", "itemId", "mode", "qty", "expectedQty", "lotNo", "expiryDate", "note", "idempotencyKey"]);
  if (body.mode !== "adjust" && body.mode !== "count") throw new ErpError(400, "ประเภทการปรับยอดไม่ถูกต้อง");
  const mode = body.mode;
  const qty =
    mode === "count"
      ? decimal(body.qty, "จำนวนที่นับได้", QTY).value
      : decimal(body.qty, "จำนวนที่ปรับ", { scale: 3, min: -999_999_999, max: 999_999_999 }).value;
  return {
    storeId: id(body.storeId, "คลัง"),
    itemId: id(body.itemId, "พัสดุ"),
    mode,
    qty,
    expectedQty: decimal(body.expectedQty, "ยอดในระบบ", QTY).value,
    lotNo: text(body.lotNo, "Lot", { max: 50 }),
    expiryDate: isoDate(body.expiryDate, "วันหมดอายุ"),
    note: text(body.note, "เหตุผลการปรับยอด", { max: 500, required: true, multiline: true }),
    idempotencyKey: parseIdempotencyKey(body.idempotencyKey),
  };
}

export function parseAdjustmentAction(raw: unknown): { action: AdjustmentAction; version: number; note: string } {
  const body = asObject(raw, ["action", "version", "note"]);
  if (body.action !== "approve" && body.action !== "reject" && body.action !== "cancel") {
    throw new ErpError(400, "action ไม่ถูกต้อง");
  }
  return {
    action: body.action,
    version: id(body.version, "version"),
    note: text(body.note, "หมายเหตุ", { max: 500, multiline: true }),
  };
}

function staleCount(systemU: bigint, expectedU: bigint): ErpError {
  return new ErpError(
    409,
    `ยอดในระบบเปลี่ยนไปแล้ว (ตอนนี้ ${fmtQ(systemU)} ตอนตรวจนับ ${fmtQ(expectedU)}) กรุณาโหลดใหม่แล้วตรวจนับอีกครั้ง`,
    "stale_count",
  );
}

// --- create -------------------------------------------------------------------------

export async function createAdjustment(a: ErpActor, input: AdjustmentInput): Promise<PostedDocResponse> {
  if (!isStoreOfficer(a, input.storeId)) throw new ErpError(403, ERP_MESSAGES.forbidden);
  return idempotentCreate(a, input.idempotencyKey, "ADJUSTMENT", () => insertAdjustment(a, input), replayPosted);
}

async function insertAdjustment(a: ErpActor, input: AdjustmentInput): Promise<PostedDocResponse> {
  return withErpTransaction(async (tx) => {
    const store = await activeStore(tx, input.storeId);
    const item = (await activeItems(tx, [input.itemId])).get(input.itemId)!;
    const bal = await lockBalance(tx, input.storeId, input.itemId);
    const expectedU = toUnits(input.expectedQty, QTY_SCALE);
    if (expectedU !== bal.qty) throw staleCount(bal.qty, expectedU);
    const inputU = toUnits(input.qty, QTY_SCALE);
    const deltaU = input.mode === "count" ? inputU - expectedU : inputU;
    if (deltaU === ZERO) {
      throw new ErpError(
        409,
        input.mode === "count" ? "ยอดตรวจนับตรงกับยอดคงเหลือในระบบ ไม่ต้องปรับยอด" : "จำนวนที่ปรับต้องไม่เป็นศูนย์",
      );
    }
    if (deltaU < ZERO && -deltaU > bal.qty) {
      throw new ErpError(409, `${item.code} ${item.name} มีคงเหลือไม่พอให้ลดยอด (คงเหลือ ${fmtQ(bal.qty)})`, "insufficient_stock");
    }
    const { docNo, fiscalYear } = await nextDocNo(tx, "ADJUSTMENT");
    const name = a.name.slice(0, 200);
    const [doc] = await tx.query<{ id: number }>(
      `INSERT INTO document
         (doc_type, doc_no, fiscal_year, status, org_unit_id, store_id, purpose,
          created_by, created_by_name, submitted_at, idempotency_key)
       VALUES ('ADJUSTMENT', $1, $2, 'submitted', $3, $4, $5, $6, $7, now(), $8::uuid)
       RETURNING id`,
      [docNo, fiscalYear, store.org_unit_id, input.storeId, input.note, a.sub, name, input.idempotencyKey],
    );
    await tx.query(
      `INSERT INTO document_line
         (document_id, line_no, item_id, qty, lot_no, expiry_date, adjust_mode, adjust_delta, expected_qty, counted_qty)
       VALUES ($1, 1, $2, $3, $4, $5::date, $6, $7, $8, $9)`,
      [
        doc.id,
        input.itemId,
        fromUnits(deltaU < ZERO ? -deltaU : deltaU, QTY_SCALE),
        input.lotNo ?? "",
        input.expiryDate ?? null,
        input.mode,
        fromUnits(deltaU, QTY_SCALE),
        fromUnits(expectedU, QTY_SCALE),
        input.mode === "count" ? fromUnits(inputU, QTY_SCALE) : null,
      ],
    );
    await tx.query(
      `INSERT INTO approval_step (document_id, step_no, required_role) VALUES ($1, 1, 'finance|director')`,
      [doc.id],
    );
    await addEvent(tx, a, doc.id, input.mode, null, "draft", input.note);
    await addEvent(tx, a, doc.id, "submit", "draft", "submitted");
    await erpAudit(tx, a, input.mode === "count" ? "stock_count_request" : "stock_adjust_request", "document", doc.id, {
      docNo,
      storeId: input.storeId,
      itemId: input.itemId,
      expectedQty: fromUnits(expectedU, QTY_SCALE),
      delta: fromUnits(deltaU, QTY_SCALE),
    });
    return { id: doc.id, docNo, movements: 0 };
  });
}

// --- approve / reject / cancel -----------------------------------------------------------

interface AdjDoc {
  id: number;
  status: DocStatus;
  version: number;
  store_id: number;
  created_by: string;
  doc_no: string;
}

function canSee(a: ErpActor, d: { store_id: number }) {
  return canViewAll(a) || isAdjustmentApprover(a) || isStoreOfficer(a, d.store_id);
}

function permissions(a: ErpActor, d: Pick<AdjDoc, "status" | "store_id" | "created_by">) {
  const pending = d.status === "submitted";
  return {
    canApprove: pending && isAdjustmentApprover(a) && d.created_by !== a.sub,
    canCancel: pending && (d.created_by === a.sub || isStoreOfficer(a, d.store_id) || isErpAdmin(a)),
  };
}

export async function adjustmentAction(
  a: ErpActor,
  docId: number,
  input: { action: AdjustmentAction; version: number; note: string },
): Promise<void> {
  await withErpTransaction(async (tx) => {
    const [d] = await tx.query<AdjDoc>(
      `SELECT id, status, version, store_id, created_by, doc_no
         FROM document WHERE id = $1 AND doc_type = 'ADJUSTMENT' FOR UPDATE`,
      [docId],
    );
    if (!d || !canSee(a, d)) throw new ErpError(404, "ไม่พบใบปรับยอด");
    if (d.version !== input.version) throw new ErpError(409, ERP_MESSAGES.stale, "stale");
    if (d.status !== "submitted") throw new ErpError(409, "ใบปรับยอดนี้ไม่อยู่ในสถานะรออนุมัติแล้ว");
    const perm = permissions(a, d);
    const name = a.name.slice(0, 200);

    if (input.action === "cancel") {
      if (!perm.canCancel) throw new ErpError(403, ERP_MESSAGES.forbidden);
      await setStatus(tx, a, d, "cancelled", input.note, false);
      await erpAudit(tx, a, "stock_adjust_cancel", "document", d.id, { docNo: d.doc_no });
      return;
    }
    if (d.created_by === a.sub) {
      throw new ErpError(403, "ผู้บันทึกใบปรับยอดอนุมัติเองไม่ได้ ต้องให้การเงินหรือผู้บริหารอีกคนอนุมัติ", "self_approval");
    }
    if (!perm.canApprove) throw new ErpError(403, "อนุมัติใบปรับยอดได้เฉพาะบทบาทการเงินหรือผู้บริหาร");
    if (input.action === "reject") {
      if (!input.note) throw new ErpError(400, "กรุณาระบุเหตุผลที่ไม่อนุมัติ");
      await setStatus(tx, a, d, "rejected", input.note, true);
      await erpAudit(tx, a, "stock_adjust_reject", "document", d.id, { docNo: d.doc_no });
      return;
    }

    // approve -> post now
    const [line] = await tx.query<{
      id: number;
      item_id: number;
      lot_no: string;
      expiry_date: string | null;
      adjust_mode: "adjust" | "count";
      delta: string;
      expected: string;
    }>(
      `SELECT id, item_id, lot_no, expiry_date, adjust_mode, adjust_delta::text AS delta, expected_qty::text AS expected
         FROM document_line WHERE document_id = $1 AND line_no = 1`,
      [d.id],
    );
    if (!line) throw new ErpError(500, ERP_MESSAGES.unavailable);
    await activeStore(tx, d.store_id);
    const item = (await activeItems(tx, [line.item_id])).get(line.item_id)!;
    const bal = await lockBalance(tx, d.store_id, line.item_id);
    const deltaU = toUnits(line.delta, QTY_SCALE);
    if (line.adjust_mode === "count") {
      const expectedU = toUnits(line.expected, QTY_SCALE);
      if (bal.qty !== expectedU) throw staleCount(bal.qty, expectedU);
    }
    const ctx: MovementContext = {
      actor: a,
      type: line.adjust_mode === "count" ? "COUNT" : "ADJUST",
      storeId: d.store_id,
      itemId: line.item_id,
      documentId: d.id,
      documentLineId: line.id,
      note: d.doc_no,
    };
    let valueU: bigint;
    let unitCostU: bigint;
    if (deltaU > ZERO) {
      // Never a typed price: moving average, or the latest receipt price when empty.
      unitCostU = bal.qty > ZERO ? unitCostOf(bal.value, bal.qty) : toUnits(item.last_unit_cost, VALUE_SCALE);
      valueU = lineValue(deltaU, unitCostU);
      await increaseStock(tx, ctx, bal, { qtyU: deltaU, valueU, lotNo: line.lot_no, expiry: line.expiry_date });
    } else {
      const specificLot = line.lot_no !== "" || line.expiry_date !== null;
      const res = await decreaseStock(tx, ctx, bal, -deltaU, `${item.code} ${item.name}`, {
        allowExpired: true,
        lot: specificLot ? { lotNo: line.lot_no, expiry: line.expiry_date } : null,
      });
      valueU = res.valueU;
      unitCostU = unitCostOf(res.valueU, -deltaU);
    }
    const amount = centsStr(toCents(valueU));
    await tx.query(`UPDATE document_line SET unit_cost = $2, amount = $3 WHERE id = $1`, [
      line.id,
      fromUnits(unitCostU, VALUE_SCALE),
      amount,
    ]);
    await tx.query(
      `UPDATE document SET status = 'posted', total_amount = $2,
              decided_by = $3, decided_by_name = $4, decided_at = now(),
              completed_by = $3, completed_by_name = $4, completed_at = now(),
              version = version + 1, updated_at = now()
        WHERE id = $1`,
      [d.id, amount, a.sub, name],
    );
    await tx.query(
      `UPDATE approval_step SET status = 'approved', decided_by = $2, decided_by_name = $3, decided_at = now(), note = $4
        WHERE document_id = $1 AND status = 'pending'`,
      [d.id, a.sub, name, input.note],
    );
    await addEvent(tx, a, d.id, "approve", "submitted", "posted", input.note);
    await erpAudit(tx, a, "stock_adjust_post", "document", d.id, {
      docNo: d.doc_no,
      itemId: line.item_id,
      qtyBefore: fromUnits(bal.qty, QTY_SCALE),
      delta: fromUnits(deltaU, QTY_SCALE),
      value: amount,
    });
  });
}

async function setStatus(
  tx: Queryable,
  a: ErpActor,
  d: AdjDoc,
  status: "rejected" | "cancelled",
  note: string,
  decided: boolean,
) {
  const name = a.name.slice(0, 200);
  await tx.query(
    decided
      ? `UPDATE document SET status = $2, decided_by = $3, decided_by_name = $4, decided_at = now(),
                version = version + 1, updated_at = now() WHERE id = $1`
      : `UPDATE document SET status = $2, version = version + 1, updated_at = now() WHERE id = $1`,
    decided ? [d.id, status, a.sub, name] : [d.id, status],
  );
  await tx.query(
    `UPDATE approval_step SET status = $2, decided_by = $3, decided_by_name = $4, decided_at = now(), note = $5
      WHERE document_id = $1 AND status = 'pending'`,
    [d.id, status, a.sub, name, note],
  );
  await addEvent(tx, a, d.id, status === "rejected" ? "reject" : "cancel", "submitted", status, note);
}

// --- list -------------------------------------------------------------------------------------

export async function listAdjustments(
  a: ErpActor,
  opts: { status: "submitted" | null; storeId: number | null; limit?: number },
): Promise<{ rows: AdjustmentRow[]; total: number }> {
  const params: SqlParam[] = [];
  const p = (v: SqlParam) => {
    params.push(v);
    return `$${params.length}`;
  };
  let storeCond = "TRUE";
  if (!canViewAll(a) && !isAdjustmentApprover(a)) {
    const stores = officerStoreIds(a);
    if (stores !== null) {
      if (stores.length === 0) throw new ErpError(403, ERP_MESSAGES.forbidden);
      storeCond = `d.store_id = ANY(${p(stores)}::bigint[])`;
    }
  }
  const rows = await erpQuery<{
    id: number;
    doc_no: string;
    status: DocStatus;
    version: number;
    store_id: number;
    store_name: string;
    item_id: number;
    code: string;
    name: string;
    unit: string;
    adjust_mode: "adjust" | "count";
    adjust_delta: number;
    expected_qty: number;
    counted_qty: number | null;
    on_hand: number | null;
    lot_no: string;
    expiry_date: string | null;
    purpose: string;
    total_amount: number | null;
    created_by: string;
    created_by_name: string;
    created_at: string;
    decided_by_name: string | null;
    decided_at: string | null;
    total: number;
  }>(
    `SELECT d.id, d.doc_no, d.status, d.version, d.store_id, s.name AS store_name,
            l.item_id, i.code, i.name, i.unit, l.adjust_mode, l.adjust_delta, l.expected_qty, l.counted_qty,
            b.qty_on_hand AS on_hand, l.lot_no, l.expiry_date, d.purpose, d.total_amount,
            d.created_by, d.created_by_name, d.created_at, d.decided_by_name, d.decided_at,
            count(*) OVER () AS total
       FROM document d
       JOIN store s ON s.id = d.store_id
       JOIN document_line l ON l.document_id = d.id AND l.line_no = 1
       JOIN item i ON i.id = l.item_id
       LEFT JOIN stock_balance b ON b.store_id = d.store_id AND b.item_id = l.item_id
      WHERE d.doc_type = 'ADJUSTMENT' AND l.adjust_mode IS NOT NULL AND ${storeCond}
        AND (${p(opts.status)}::text IS NULL OR d.status = ${`$${params.length}`})
        AND (${p(opts.storeId)}::bigint IS NULL OR d.store_id = ${`$${params.length}`})
      ORDER BY d.created_at DESC, d.id DESC
      LIMIT ${p(opts.limit ?? 500)}`,
    params,
  );
  return {
    total: rows[0]?.total ?? 0,
    rows: rows.map((r) => {
      const perm = permissions(a, r);
      return {
        id: r.id,
        docNo: r.doc_no,
        status: r.status,
        version: r.version,
        storeId: r.store_id,
        storeName: r.store_name,
        itemId: r.item_id,
        itemCode: r.code,
        itemName: r.name,
        unit: r.unit,
        mode: r.adjust_mode,
        delta: r.adjust_delta,
        expectedQty: r.expected_qty,
        countedQty: r.counted_qty,
        onHand: r.on_hand ?? 0,
        lotNo: r.lot_no,
        expiryDate: r.expiry_date,
        note: r.purpose,
        totalAmount: r.total_amount,
        createdBy: r.created_by,
        createdByName: r.created_by_name,
        createdAt: r.created_at,
        decidedByName: r.decided_by_name,
        decidedAt: r.decided_at,
        ...perm,
      };
    }),
  };
}
