import { readJsonBody } from "@/lib/auth/admin-gate";
import { ErpError, erpGate, erpHandle, erpJson, parseId } from "@/lib/erp/gate";
import { getRequisition, parseActionInput, requisitionAction } from "@/lib/erp/requisitions";

const MAX_BODY = 16 * 1024;

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/erp/requisitions/{id}/actions
 *   body { action: submit|approve|reject|issue|cancel, version, note?, lines?: [{ lineId, qty }] }
 *   -> 200 RequisitionDetail (after the change)
 *   400 invalid, 403 cross-origin, 404 not visible, 409 wrong status /
 *   not permitted / stale version / insufficient stock (code insufficient_stock).
 */
export async function POST(request: Request, { params }: Ctx): Promise<Response> {
  const route = "api/erp/requisitions/[id]/actions";
  const gate = await erpGate(request, route, { mutation: true });
  if (!gate.ok) return gate.response;
  const docId = parseId((await params).id);
  return erpHandle(route, async () => {
    if (docId === null) throw new ErpError(404, "ไม่พบใบเบิก");
    const input = parseActionInput(await readJsonBody(request, MAX_BODY));
    await requisitionAction(gate.actor, docId, input);
    return erpJson(await getRequisition(gate.actor, docId));
  });
}
