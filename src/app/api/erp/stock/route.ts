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
import { listBalances } from "@/lib/erp/stock";

/**
 * GET /api/erp/stock?storeId=&includeZero=1
 *   -> 200 { rows: StockBalanceRow[] } (คงคลังรายคลัง, moving-average cost)
 * Store officer of the store, finance, director, erp_admin.
 */
export async function GET(request: Request): Promise<Response> {
  const route = "api/erp/stock";
  const gate = await erpGate(request, route);
  if (!gate.ok) return gate.response;
  const q = new URL(request.url).searchParams;
  const storeId = parseId(q.get("storeId"));
  return erpHandle(route, async () => {
    if (storeId === null) throw new ErpError(400, "กรุณาเลือกคลัง");
    if (!canViewAll(gate.actor) && !isStoreOfficer(gate.actor, storeId)) {
      throw new ErpError(403, ERP_MESSAGES.forbidden);
    }
    return erpJson({ rows: await listBalances(storeId, q.get("includeZero") === "1") });
  });
}
