import { todayIsoDate } from "@/lib/kpi/fiscal-year";
import {
  canViewAll,
  ERP_MESSAGES,
  ErpError,
  erpGate,
  erpHandle,
  erpJson,
  isStoreOfficer,
  parseId,
} from "@/lib/erp/gate";
import { listStockDocuments } from "@/lib/erp/stock";
import type { StockDocType } from "@/lib/erp/types";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

function validDate(v: string | null): string | null {
  if (!v || !DATE_RE.test(v)) return null;
  const d = new Date(`${v}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v ? null : v;
}

/**
 * GET /api/erp/stock/documents?storeId=&type=RECEIPT|ADJUSTMENT&from=&to=
 *   -> 200 { rows: StockDocumentRow[], truncated, from, to }
 * Default range: last 30 days; at most 366 days. Same access as /api/erp/stock.
 */
export async function GET(request: Request): Promise<Response> {
  const route = "api/erp/stock/documents";
  const gate = await erpGate(request, route);
  if (!gate.ok) return gate.response;
  const q = new URL(request.url).searchParams;
  return erpHandle(route, async () => {
    const storeId = parseId(q.get("storeId"));
    if (storeId === null) throw new ErpError(400, "กรุณาเลือกคลัง");
    if (!canViewAll(gate.actor) && !isStoreOfficer(gate.actor, storeId)) {
      throw new ErpError(403, ERP_MESSAGES.forbidden);
    }
    const typeRaw = q.get("type");
    if (typeRaw !== "RECEIPT" && typeRaw !== "ADJUSTMENT") throw new ErpError(400, "ชนิดเอกสารไม่ถูกต้อง");
    const type: StockDocType = typeRaw;
    const to = validDate(q.get("to")) ?? todayIsoDate();
    const from =
      validDate(q.get("from")) ??
      new Date(Date.parse(`${to}T00:00:00Z`) - 30 * DAY_MS).toISOString().slice(0, 10);
    const span = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS;
    if (span < 0) throw new ErpError(400, "วันที่เริ่มต้องไม่หลังวันที่สิ้นสุด");
    if (span > 366) throw new ErpError(400, "เลือกช่วงวันที่ได้ไม่เกิน 1 ปี");
    return erpJson({ ...(await listStockDocuments({ storeId, type, from, to })), from, to });
  });
}
