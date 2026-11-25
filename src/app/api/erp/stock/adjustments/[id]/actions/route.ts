import { readJsonBody } from "@/lib/auth/admin-gate";
import { adjustmentAction, parseAdjustmentAction } from "@/lib/erp/adjustments";
import { ErpError, erpGate, erpHandle, erpJson, parseId } from "@/lib/erp/gate";

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/erp/stock/adjustments/{id}/actions body { action: approve|reject|cancel, version, note? }
 *   approve / reject: finance or director, never the creator (403 self_approval)
 *   approve posts the adjustment to the stock ledger (409 stale_count when
 *   the balance moved since the count, 409 insufficient stock / lot)
 *   cancel: creator, store officer of the store, erp_admin
 *   -> 200 { ok: true }
 */
export async function POST(request: Request, { params }: Ctx): Promise<Response> {
  const route = "api/erp/stock/adjustments/[id]/actions";
  const gate = await erpGate(request, route, { mutation: true });
  if (!gate.ok) return gate.response;
  const docId = parseId((await params).id);
  return erpHandle(route, async () => {
    if (docId === null) throw new ErpError(404, "ไม่พบใบปรับยอด");
    await adjustmentAction(gate.actor, docId, parseAdjustmentAction(await readJsonBody(request, 4096)));
    return erpJson({ ok: true });
  });
}
