import { readJsonBody } from "@/lib/auth/admin-gate";
import { erpGate, erpHandle, erpJson } from "@/lib/erp/gate";
import { parseAdjustmentBody } from "@/lib/erp/lookups";
import { postAdjustment } from "@/lib/erp/stock";

const MAX_BODY = 4 * 1024;

/**
 * POST /api/erp/stock/adjustments body AdjustmentInput
 *   mode "adjust": qty = +/- change; mode "count": qty = counted quantity
 *   -> 201 PostedDocResponse (ADJUSTMENT document)
 *   409 count equals the balance / decrease larger than the stock.
 * Store officer of body.storeId; note (reason) required.
 */
export async function POST(request: Request): Promise<Response> {
  const route = "api/erp/stock/adjustments";
  const gate = await erpGate(request, route, { mutation: true });
  if (!gate.ok) return gate.response;
  return erpHandle(route, async () => {
    const input = parseAdjustmentBody(await readJsonBody(request, MAX_BODY));
    return erpJson(await postAdjustment(gate.actor, input), 201);
  });
}
