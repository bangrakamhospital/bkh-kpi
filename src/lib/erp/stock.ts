import "server-only";

import { fiscalYearOf, todayIsoDate } from "@/lib/kpi/fiscal-year";
import { erpAudit } from "./audit";
import { erpQuery, withErpTransaction, type Queryable } from "./db";
import { ERP_MESSAGES, ErpError, isStoreOfficer, type ErpActor } from "./gate";
import type {
  AdjustmentInput,
  MovementType,
  PostedDocResponse,
  ReceiptInput,
  StockBalanceRow,
  StockDocType,
  StockDocumentRow,
  StockMovementRow,
} from "./types";
import {
  fromUnits,
  lineValue,
  money2,
  QTY_SCALE,
  roundDiv,
  toUnits,
  unitCostOf,
  VALUE_SCALE,
  ZERO,
} from "./units";

/**
 * Stock engine. Costing = MOVING WEIGHTED AVERAGE per (store, item):
 *   receive   total_value += qty * price
 *   decrease  value out = total_value * qty / qty_on_hand
 *             (the whole remaining value when the store is emptied)
 * Lots (lot_no, expiry) track quantities only and are consumed FEFO.
 *
 * Concurrency: every change of an item in a store first locks its
 * stock_balance row (SELECT .. FOR UPDATE) inside the caller's
 * transaction; multi-item operations lock in ascending item id order (no
 * deadlocks between two issues). The CHECK constraints (qty / value >= 0)
 * are the last line of defence against a negative balance.
 * All math is BigInt fixed point (./units), never floats.
 */

export interface Balance {
  qty: bigint;
  value: bigint;
}

/** Lock (creating if needed) the balance row of an item in a store. */
export async function lockBalance(tx: Queryable, storeId: number, itemId: number): Promise<Balance> {
  await tx.query(
    `INSERT INTO stock_balance (store_id, item_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [storeId, itemId],
  );
  const [row] = await tx.query<{ q: string; v: string }>(
    `SELECT qty_on_hand::text AS q, total_value::text AS v
       FROM stock_balance WHERE store_id = $1 AND item_id = $2 FOR UPDATE`,
    [storeId, itemId],
  );
  if (!row) throw new ErpError(500, ERP_MESSAGES.unavailable);
  return { qty: toUnits(row.q, QTY_SCALE), value: toUnits(row.v, VALUE_SCALE) };
}

export interface MovementContext {
  actor: ErpActor;
  type: MovementType;
  storeId: number;
  itemId: number;
  documentId: number;
  documentLineId?: number | null;
  orgUnitId?: number | null;
  vendorId?: number | null;
  note?: string;
}

async function insertMovement(
  tx: Queryable,
  ctx: MovementContext,
  m: { qtyU: bigint; valueU: bigint; after: Balance; lotNo: string; expiry: string | null },
) {
  const absQty = m.qtyU < ZERO ? -m.qtyU : m.qtyU;
  const absValue = m.valueU < ZERO ? -m.valueU : m.valueU;
  await tx.query(
    `INSERT INTO stock_movement
       (movement_type, store_id, item_id, qty_change, value_change, unit_cost,
        qty_after, value_after, lot_no, expiry_date, document_id, document_line_id,
        org_unit_id, vendor_id, note, created_by, created_by_name)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
    [
      ctx.type,
      ctx.storeId,
      ctx.itemId,
      fromUnits(m.qtyU, QTY_SCALE),
      fromUnits(m.valueU, VALUE_SCALE),
      fromUnits(unitCostOf(absValue, absQty), VALUE_SCALE),
      fromUnits(m.after.qty, QTY_SCALE),
      fromUnits(m.after.value, VALUE_SCALE),
      m.lotNo,
      m.expiry,
      ctx.documentId,
      ctx.documentLineId ?? null,
      ctx.orgUnitId ?? null,
      ctx.vendorId ?? null,
      ctx.note ?? "",
      ctx.actor.sub,
      ctx.actor.name.slice(0, 200),
    ],
  );
}

async function writeBalance(tx: Queryable, storeId: number, itemId: number, b: Balance) {
  await tx.query(
    `UPDATE stock_balance SET qty_on_hand = $3, total_value = $4, updated_at = now()
      WHERE store_id = $1 AND item_id = $2`,
    [storeId, itemId, fromUnits(b.qty, QTY_SCALE), fromUnits(b.value, VALUE_SCALE)],
  );
}

/** Increase (receive / positive adjustment) of a LOCKED balance. Returns the new balance. */
export async function increaseStock(
  tx: Queryable,
  ctx: MovementContext,
  bal: Balance,
  p: { qtyU: bigint; valueU: bigint; lotNo: string; expiry: string | null },
): Promise<Balance> {
  if (p.qtyU <= ZERO || p.valueU < ZERO) throw new ErpError(400, ERP_MESSAGES.invalidBody);
  const after = { qty: bal.qty + p.qtyU, value: bal.value + p.valueU };
  const updated = await tx.query(
    `UPDATE stock_lot SET qty_on_hand = qty_on_hand + $5
      WHERE store_id = $1 AND item_id = $2 AND lot_no = $3
        AND expiry_date IS NOT DISTINCT FROM $4::date
      RETURNING id`,
    [ctx.storeId, ctx.itemId, p.lotNo, p.expiry, fromUnits(p.qtyU, QTY_SCALE)],
  );
  if (updated.length === 0) {
    await tx.query(
      `INSERT INTO stock_lot (store_id, item_id, lot_no, expiry_date, qty_on_hand)
       VALUES ($1, $2, $3, $4::date, $5)`,
      [ctx.storeId, ctx.itemId, p.lotNo, p.expiry, fromUnits(p.qtyU, QTY_SCALE)],
    );
  }
  await writeBalance(tx, ctx.storeId, ctx.itemId, after);
  await insertMovement(tx, ctx, { qtyU: p.qtyU, valueU: p.valueU, after, lotNo: p.lotNo, expiry: p.expiry });
  return after;
}

/**
 * Decrease (issue / negative adjustment) of a LOCKED balance, FEFO over
 * lots (one movement row per lot touched). Throws 409 when short.
 * Returns the value taken out (scale 4) and the new balance.
 */
export async function decreaseStock(
  tx: Queryable,
  ctx: MovementContext,
  bal: Balance,
  qtyU: bigint,
  itemLabel: string,
): Promise<{ valueU: bigint; after: Balance; movements: number }> {
  if (qtyU <= ZERO) throw new ErpError(400, ERP_MESSAGES.invalidBody);
  if (qtyU > bal.qty) {
    throw new ErpError(
      409,
      `${itemLabel} มีคงเหลือในคลังไม่พอ (คงเหลือ ${Number(fromUnits(bal.qty, QTY_SCALE)).toLocaleString("th-TH")} ต้องการ ${Number(fromUnits(qtyU, QTY_SCALE)).toLocaleString("th-TH")})`,
      "insufficient_stock",
    );
  }
  const valueU = qtyU === bal.qty ? bal.value : roundDiv(bal.value * qtyU, bal.qty);
  const lots = await tx.query<{ id: number; lot_no: string; expiry_date: string | null; q: string }>(
    `SELECT id, lot_no, expiry_date, qty_on_hand::text AS q
       FROM stock_lot
      WHERE store_id = $1 AND item_id = $2 AND qty_on_hand > 0
      ORDER BY expiry_date ASC NULLS LAST, received_at, id
      FOR UPDATE`,
    [ctx.storeId, ctx.itemId],
  );
  let remainingQty = qtyU;
  let remainingValue = valueU;
  let running: Balance = { ...bal };
  let movements = 0;
  for (const lot of lots) {
    if (remainingQty === ZERO) break;
    const lotQty = toUnits(lot.q, QTY_SCALE);
    const take = lotQty < remainingQty ? lotQty : remainingQty;
    const last = take === remainingQty;
    const takeValue = last ? remainingValue : roundDiv(valueU * take, qtyU);
    remainingQty -= take;
    remainingValue -= takeValue;
    running = { qty: running.qty - take, value: running.value - takeValue };
    await tx.query(`UPDATE stock_lot SET qty_on_hand = qty_on_hand - $2 WHERE id = $1`, [
      lot.id,
      fromUnits(take, QTY_SCALE),
    ]);
    await insertMovement(tx, ctx, {
      qtyU: -take,
      valueU: -takeValue,
      after: running,
      lotNo: lot.lot_no,
      expiry: lot.expiry_date,
    });
    movements += 1;
  }
  if (remainingQty !== ZERO) {
    // Lots out of sync with the balance: refuse rather than guess.
    console.error(`[erp-stock] lot quantities do not cover the balance store=${ctx.storeId} item=${ctx.itemId}`);
    throw new ErpError(409, `${itemLabel}: ยอดตามล็อตไม่ตรงกับยอดคงเหลือ กรุณาแจ้งผู้ดูแลระบบ`);
  }
  await writeBalance(tx, ctx.storeId, ctx.itemId, running);
  return { valueU, after: running, movements };
}

// --- numbering ------------------------------------------------------------------

/** Next running number of a document type in the current fiscal year (BE). */
export async function nextDocNo(
  tx: Queryable,
  docType: string,
): Promise<{ docNo: string; fiscalYear: number }> {
  const fiscalYear = fiscalYearOf(todayIsoDate());
  const [row] = await tx.query<{ last_no: number; prefix: string }>(
    `WITH seq AS (
       INSERT INTO document_sequence (doc_type, fiscal_year, last_no) VALUES ($1, $2, 1)
       ON CONFLICT (doc_type, fiscal_year)
       DO UPDATE SET last_no = document_sequence.last_no + 1
       RETURNING last_no)
     SELECT seq.last_no, t.prefix FROM seq, document_type t WHERE t.code = $1`,
    [docType, fiscalYear],
  );
  if (!row) throw new ErpError(500, ERP_MESSAGES.unavailable);
  return { docNo: `${row.prefix}${fiscalYear}-${String(row.last_no).padStart(5, "0")}`, fiscalYear };
}

export async function addEvent(
  tx: Queryable,
  actor: ErpActor,
  documentId: number,
  action: string,
  fromStatus: string | null,
  toStatus: string | null,
  note = "",
) {
  await tx.query(
    `INSERT INTO document_event (document_id, action, from_status, to_status, actor_sub, actor_name, note)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [documentId, action, fromStatus, toStatus, actor.sub, actor.name.slice(0, 200), note],
  );
}

// --- shared lookups -------------------------------------------------------------

export async function activeStore(tx: Queryable, storeId: number) {
  const [s] = await tx.query<{ id: number; name: string; org_unit_id: number | null }>(
    `SELECT id, name, org_unit_id FROM store WHERE id = $1 AND active`,
    [storeId],
  );
  if (!s) throw new ErpError(400, "ไม่พบคลัง หรือคลังถูกปิดใช้งาน");
  return s;
}

export interface ItemInfo {
  id: number;
  code: string;
  name: string;
  unit: string;
  last_unit_cost: string;
}

/** Active items by id (400 when any is missing / inactive). */
export async function activeItems(tx: Queryable, ids: number[]): Promise<Map<number, ItemInfo>> {
  const unique = [...new Set(ids)];
  const rows = await tx.query<ItemInfo>(
    `SELECT id, code, name, unit, last_unit_cost::text AS last_unit_cost
       FROM item WHERE id = ANY($1::bigint[]) AND active`,
    [unique],
  );
  const map = new Map(rows.map((r) => [r.id, r]));
  if (map.size !== unique.length) throw new ErpError(400, "มีรายการพัสดุที่ไม่พบหรือถูกปิดใช้งาน");
  return map;
}

// --- receipts ---------------------------------------------------------------------

/** รับของเข้าคลัง: one RECEIPT document, posted immediately. Store officer of the store. */
export async function postReceipt(actor: ErpActor, input: ReceiptInput): Promise<PostedDocResponse> {
  if (!isStoreOfficer(actor, input.storeId)) throw new ErpError(403, ERP_MESSAGES.forbidden);
  return withErpTransaction(async (tx) => {
    const store = await activeStore(tx, input.storeId);
    if (input.vendorId !== null) {
      const [v] = await tx.query(`SELECT 1 FROM vendor WHERE id = $1 AND active`, [input.vendorId]);
      if (!v) throw new ErpError(400, "ไม่พบผู้ขาย หรือผู้ขายถูกปิดใช้งาน");
    }
    const items = await activeItems(tx, input.lines.map((l) => l.itemId));
    const { docNo, fiscalYear } = await nextDocNo(tx, "RECEIPT");

    const lines = input.lines.map((l, i) => {
      const qtyU = toUnits(l.qty, QTY_SCALE);
      const costU = toUnits(l.unitCost, VALUE_SCALE);
      return { ...l, lineNo: i + 1, qtyU, costU, valueU: lineValue(qtyU, costU) };
    });
    const total = lines.reduce((s, l) => s + l.valueU, ZERO);

    const [doc] = await tx.query<{ id: number }>(
      `INSERT INTO document
         (doc_type, doc_no, fiscal_year, status, org_unit_id, store_id, vendor_id, ref_no, ref_date,
          purpose, total_amount, created_by, created_by_name, completed_by, completed_by_name, completed_at)
       VALUES ('RECEIPT', $1, $2, 'posted', $3, $4, $5, $6, $7::date, $8, $9, $10, $11, $10, $11, now())
       RETURNING id`,
      [
        docNo,
        fiscalYear,
        store.org_unit_id,
        input.storeId,
        input.vendorId,
        input.refNo,
        input.refDate,
        input.note,
        money2(total),
        actor.sub,
        actor.name.slice(0, 200),
      ],
    );

    const lineIds = new Map<number, number>();
    for (const l of lines) {
      const [row] = await tx.query<{ id: number }>(
        `INSERT INTO document_line
           (document_id, line_no, item_id, qty, qty_issued, unit_cost, amount, lot_no, expiry_date)
         VALUES ($1, $2, $3, $4, $4, $5, $6, $7, $8::date) RETURNING id`,
        [
          doc.id,
          l.lineNo,
          l.itemId,
          fromUnits(l.qtyU, QTY_SCALE),
          fromUnits(l.costU, VALUE_SCALE),
          money2(l.valueU),
          l.lotNo ?? "",
          l.expiryDate ?? null,
        ],
      );
      lineIds.set(l.lineNo, row.id);
    }

    // Lock order: ascending item id.
    let movements = 0;
    for (const l of [...lines].sort((a, b) => a.itemId - b.itemId || a.lineNo - b.lineNo)) {
      const bal = await lockBalance(tx, input.storeId, l.itemId);
      await increaseStock(
        tx,
        {
          actor,
          type: "RECEIVE",
          storeId: input.storeId,
          itemId: l.itemId,
          documentId: doc.id,
          documentLineId: lineIds.get(l.lineNo),
          vendorId: input.vendorId,
          note: input.refNo ? `ใบส่งของ ${input.refNo}` : "",
        },
        bal,
        { qtyU: l.qtyU, valueU: l.valueU, lotNo: l.lotNo ?? "", expiry: l.expiryDate ?? null },
      );
      movements += 1;
    }
    // Latest receipt price per item (last line wins).
    const lastCost = new Map(lines.map((l) => [l.itemId, l.costU]));
    for (const [itemId, costU] of lastCost) {
      await tx.query(`UPDATE item SET last_unit_cost = $2, updated_at = now() WHERE id = $1`, [
        itemId,
        fromUnits(costU, VALUE_SCALE),
      ]);
    }

    await addEvent(tx, actor, doc.id, "post", null, "posted", input.note);
    await erpAudit(tx, actor, "receipt_post", "document", doc.id, {
      docNo,
      storeId: input.storeId,
      vendorId: input.vendorId,
      lines: lines.length,
      total: money2(total),
      items: [...items.keys()].length,
    });
    return { id: doc.id, docNo, movements };
  });
}

// --- adjustments / stock count ----------------------------------------------------

export async function postAdjustment(actor: ErpActor, input: AdjustmentInput): Promise<PostedDocResponse> {
  if (!isStoreOfficer(actor, input.storeId)) throw new ErpError(403, ERP_MESSAGES.forbidden);
  return withErpTransaction(async (tx) => {
    const store = await activeStore(tx, input.storeId);
    const item = (await activeItems(tx, [input.itemId])).get(input.itemId)!;
    const bal = await lockBalance(tx, input.storeId, input.itemId);
    const inputU = toUnits(input.qty, QTY_SCALE);
    const deltaU = input.mode === "count" ? inputU - bal.qty : inputU;
    if (deltaU === ZERO) {
      throw new ErpError(
        409,
        input.mode === "count" ? "ยอดตรวจนับตรงกับยอดคงเหลือในระบบ ไม่ต้องปรับยอด" : "จำนวนที่ปรับต้องไม่เป็นศูนย์",
      );
    }
    const { docNo, fiscalYear } = await nextDocNo(tx, "ADJUSTMENT");
    const type: MovementType = input.mode === "count" ? "COUNT" : "ADJUST";
    const [doc] = await tx.query<{ id: number }>(
      `INSERT INTO document
         (doc_type, doc_no, fiscal_year, status, org_unit_id, store_id, purpose,
          created_by, created_by_name, completed_by, completed_by_name, completed_at)
       VALUES ('ADJUSTMENT', $1, $2, 'posted', $3, $4, $5, $6, $7, $6, $7, now())
       RETURNING id`,
      [docNo, fiscalYear, store.org_unit_id, input.storeId, input.note, actor.sub, actor.name.slice(0, 200)],
    );
    const ctx: MovementContext = {
      actor,
      type,
      storeId: input.storeId,
      itemId: input.itemId,
      documentId: doc.id,
      note: input.note,
    };
    let valueU: bigint;
    let movements = 1;
    if (deltaU > ZERO) {
      const costU =
        input.unitCost !== undefined && input.unitCost !== null
          ? toUnits(input.unitCost, VALUE_SCALE)
          : bal.qty > ZERO
            ? unitCostOf(bal.value, bal.qty)
            : toUnits(item.last_unit_cost, VALUE_SCALE);
      valueU = lineValue(deltaU, costU);
      await increaseStock(tx, ctx, bal, {
        qtyU: deltaU,
        valueU,
        lotNo: input.lotNo ?? "",
        expiry: input.expiryDate ?? null,
      });
    } else {
      const res = await decreaseStock(tx, ctx, bal, -deltaU, `${item.code} ${item.name}`);
      valueU = -res.valueU;
      movements = res.movements;
    }
    await tx.query(`UPDATE document SET total_amount = $2 WHERE id = $1`, [
      doc.id,
      money2(valueU < ZERO ? -valueU : valueU),
    ]);
    await addEvent(tx, actor, doc.id, input.mode, null, "posted", input.note);
    await erpAudit(tx, actor, input.mode === "count" ? "stock_count" : "stock_adjust", "document", doc.id, {
      docNo,
      storeId: input.storeId,
      itemId: input.itemId,
      qtyBefore: fromUnits(bal.qty, QTY_SCALE),
      qtyChange: fromUnits(deltaU, QTY_SCALE),
      value: fromUnits(valueU, VALUE_SCALE),
    });
    return { id: doc.id, docNo, movements };
  });
}

// --- queries ------------------------------------------------------------------------

export async function listBalances(storeId: number, includeZero: boolean): Promise<StockBalanceRow[]> {
  const rows = await erpQuery<{
    store_id: number;
    item_id: number;
    code: string;
    name: string;
    unit: string;
    category_name: string | null;
    qty_on_hand: number;
    total_value: number;
    reorder_point: number;
    nearest_expiry: string | null;
  }>(
    `SELECT b.store_id, i.id AS item_id, i.code, i.name, i.unit, c.name AS category_name,
            b.qty_on_hand, b.total_value, i.reorder_point,
            (SELECT min(l.expiry_date) FROM stock_lot l
              WHERE l.store_id = b.store_id AND l.item_id = b.item_id AND l.qty_on_hand > 0) AS nearest_expiry
       FROM stock_balance b
       JOIN item i ON i.id = b.item_id
       LEFT JOIN item_category c ON c.id = i.category_id
      WHERE b.store_id = $1 AND ($2::boolean OR b.qty_on_hand > 0)
      ORDER BY i.code
      LIMIT 10000`,
    [storeId, includeZero],
  );
  return rows.map((r) => ({
    storeId: r.store_id,
    itemId: r.item_id,
    itemCode: r.code,
    itemName: r.name,
    unit: r.unit,
    categoryName: r.category_name,
    qtyOnHand: r.qty_on_hand,
    totalValue: r.total_value,
    avgCost: r.qty_on_hand > 0 ? Math.round((r.total_value / r.qty_on_hand) * 10000) / 10000 : 0,
    reorderPoint: r.reorder_point,
    nearestExpiry: r.nearest_expiry,
  }));
}

export interface MovementFilter {
  storeId: number;
  itemId: number | null;
  type: MovementType | null;
  /** "YYYY-MM-DD" inclusive, Bangkok dates. */
  from: string;
  to: string;
}

export const MOVEMENT_LIMIT = 5000;

export async function listMovements(f: MovementFilter): Promise<{ rows: StockMovementRow[]; truncated: boolean }> {
  const rows = await erpQuery<{
    id: number;
    movement_type: MovementType;
    store_id: number;
    store_name: string;
    item_id: number;
    code: string;
    name: string;
    unit: string;
    qty_change: number;
    value_change: number;
    unit_cost: number;
    qty_after: number;
    lot_no: string;
    expiry_date: string | null;
    document_id: number | null;
    doc_no: string | null;
    org_unit_name: string | null;
    vendor_name: string | null;
    note: string;
    created_by_name: string;
    created_at: string;
  }>(
    `SELECT m.id, m.movement_type, m.store_id, s.name AS store_name, m.item_id, i.code, i.name, i.unit,
            m.qty_change, m.value_change, m.unit_cost, m.qty_after, m.lot_no, m.expiry_date,
            m.document_id, d.doc_no, u.name AS org_unit_name, v.name AS vendor_name,
            m.note, m.created_by_name, m.created_at
       FROM stock_movement m
       JOIN store s ON s.id = m.store_id
       JOIN item i ON i.id = m.item_id
       LEFT JOIN document d ON d.id = m.document_id
       LEFT JOIN org_unit u ON u.id = m.org_unit_id
       LEFT JOIN vendor v ON v.id = m.vendor_id
      WHERE m.store_id = $1
        AND ($2::bigint IS NULL OR m.item_id = $2)
        AND ($3::text IS NULL OR m.movement_type = $3)
        AND m.created_at >= $4::date
        AND m.created_at < $5::date + 1
      ORDER BY m.created_at DESC, m.id DESC
      LIMIT ${MOVEMENT_LIMIT + 1}`,
    [f.storeId, f.itemId, f.type, f.from, f.to],
  );
  const truncated = rows.length > MOVEMENT_LIMIT;
  return {
    truncated,
    rows: rows.slice(0, MOVEMENT_LIMIT).map((r) => ({
      id: r.id,
      type: r.movement_type,
      storeId: r.store_id,
      storeName: r.store_name,
      itemId: r.item_id,
      itemCode: r.code,
      itemName: r.name,
      unit: r.unit,
      qtyChange: r.qty_change,
      valueChange: r.value_change,
      unitCost: r.unit_cost,
      qtyAfter: r.qty_after,
      lotNo: r.lot_no,
      expiryDate: r.expiry_date,
      docId: r.document_id,
      docNo: r.doc_no,
      orgUnitName: r.org_unit_name,
      vendorName: r.vendor_name,
      note: r.note,
      createdByName: r.created_by_name,
      createdAt: r.created_at,
    })),
  };
}

export const STOCK_DOC_LIMIT = 2000;

/** Receipt / adjustment documents of a store (newest first). Dates "YYYY-MM-DD" inclusive. */
export async function listStockDocuments(f: {
  storeId: number;
  type: StockDocType;
  from: string;
  to: string;
}): Promise<{ rows: StockDocumentRow[]; truncated: boolean }> {
  const rows = await erpQuery<{
    id: number;
    doc_no: string;
    doc_type: StockDocType;
    store_id: number;
    vendor_name: string | null;
    ref_no: string;
    purpose: string;
    line_count: number;
    total_amount: number | null;
    created_by_name: string;
    created_at: string;
  }>(
    `SELECT d.id, d.doc_no, d.doc_type, d.store_id, v.name AS vendor_name, d.ref_no, d.purpose,
            (SELECT count(*)::int FROM document_line l WHERE l.document_id = d.id) AS line_count,
            d.total_amount, d.created_by_name, d.created_at
       FROM document d
       LEFT JOIN vendor v ON v.id = d.vendor_id
      WHERE d.doc_type = $2 AND d.store_id = $1
        AND d.created_at >= $3::date
        AND d.created_at < $4::date + 1
      ORDER BY d.created_at DESC, d.id DESC
      LIMIT ${STOCK_DOC_LIMIT + 1}`,
    [f.storeId, f.type, f.from, f.to],
  );
  return {
    truncated: rows.length > STOCK_DOC_LIMIT,
    rows: rows.slice(0, STOCK_DOC_LIMIT).map((r) => ({
      id: r.id,
      docNo: r.doc_no,
      docType: r.doc_type,
      storeId: r.store_id,
      vendorName: r.vendor_name,
      refNo: r.ref_no,
      note: r.purpose,
      lineCount: r.line_count,
      totalAmount: r.total_amount ?? 0,
      createdByName: r.created_by_name,
      createdAt: r.created_at,
    })),
  };
}
