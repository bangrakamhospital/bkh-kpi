import "server-only";

import { erpQuery } from "./db";
import type { ErpLookups } from "./types";
import { array, asObject, COST, decimal, id, isoDate, optionalId, QTY, text } from "./validate";
import type { AdjustmentInput, ReceiptInput } from "./types";
import { ErpError } from "./gate";

/** Active master data for dropdowns (any ERP user; no personal data). */
export async function getLookups(): Promise<ErpLookups> {
  const [orgUnits, stores, items, categories, vendors] = await Promise.all([
    erpQuery<{ id: number; code: string; name: string; parent_id: number | null }>(
      `SELECT id, code, name, parent_id FROM org_unit WHERE active ORDER BY code`,
    ),
    erpQuery<{ id: number; code: string; name: string }>(
      `SELECT id, code, name FROM store WHERE active ORDER BY code`,
    ),
    erpQuery<{ id: number; code: string; name: string; unit: string; category_id: number | null; last_unit_cost: number }>(
      `SELECT id, code, name, unit, category_id, last_unit_cost FROM item WHERE active ORDER BY code LIMIT 10000`,
    ),
    erpQuery<{ id: number; code: string; name: string }>(
      `SELECT id, code, name FROM item_category WHERE active ORDER BY code`,
    ),
    erpQuery<{ id: number; code: string | null; name: string }>(
      `SELECT id, code, name FROM vendor WHERE active ORDER BY name`,
    ),
  ]);
  return {
    orgUnits: orgUnits.map((u) => ({ id: u.id, code: u.code, name: u.name, parentId: u.parent_id })),
    stores,
    items: items.map((i) => ({
      id: i.id,
      code: i.code,
      name: i.name,
      unit: i.unit,
      categoryId: i.category_id,
      lastUnitCost: i.last_unit_cost,
    })),
    categories,
    vendors,
  };
}

// --- stock request bodies ----------------------------------------------------------

export function parseReceiptBody(raw: unknown): ReceiptInput {
  const body = asObject(raw, ["storeId", "vendorId", "refNo", "refDate", "note", "lines"]);
  const lines = array(body.lines, "รายการรับเข้า", { min: 1, max: 200 }).map((l, i) => {
    const n = i + 1;
    const line = asObject(l, ["itemId", "qty", "unitCost", "lotNo", "expiryDate"], `รายการที่ ${n} `);
    return {
      itemId: id(line.itemId, `พัสดุรายการที่ ${n}`),
      qty: decimal(line.qty, `จำนวนรายการที่ ${n}`, { ...QTY, minExclusive: true }).value,
      unitCost: decimal(line.unitCost, `ราคาต่อหน่วยรายการที่ ${n}`, COST).value,
      lotNo: text(line.lotNo, `Lot รายการที่ ${n}`, { max: 50 }),
      expiryDate: isoDate(line.expiryDate, `วันหมดอายุรายการที่ ${n}`),
    };
  });
  return {
    storeId: id(body.storeId, "คลัง"),
    vendorId: optionalId(body.vendorId, "ผู้ขาย"),
    refNo: text(body.refNo, "เลขที่ใบส่งของ", { max: 50 }),
    refDate: isoDate(body.refDate, "วันที่ใบส่งของ"),
    note: text(body.note, "หมายเหตุ", { max: 500, multiline: true }),
    lines,
  };
}

export function parseAdjustmentBody(raw: unknown): AdjustmentInput {
  const body = asObject(raw, ["storeId", "itemId", "mode", "qty", "unitCost", "lotNo", "expiryDate", "note"]);
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
    unitCost:
      body.unitCost === undefined || body.unitCost === null ? null : decimal(body.unitCost, "ราคาต่อหน่วย", COST).value,
    lotNo: text(body.lotNo, "Lot", { max: 50 }),
    expiryDate: isoDate(body.expiryDate, "วันหมดอายุ"),
    note: text(body.note, "เหตุผลการปรับยอด", { max: 500, required: true, multiline: true }),
  };
}
