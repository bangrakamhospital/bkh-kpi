import { readJsonBody } from "@/lib/auth/admin-gate";
import { ErpError, erpGate, erpHandle, erpJson, parseId } from "@/lib/erp/gate";
import { getRequisition, parseRequisitionInput, updateRequisition } from "@/lib/erp/requisitions";

const MAX_BODY = 32 * 1024;

type Ctx = { params: Promise<{ id: string }> };

/**
 * GET   /api/erp/requisitions/{id} -> 200 RequisitionDetail (404 when not visible)
 * PATCH /api/erp/requisitions/{id} body RequisitionInput & { version }
 *   -> 200 RequisitionDetail  (draft only; 409 stale version / wrong status)
 */
export async function GET(request: Request, { params }: Ctx): Promise<Response> {
  const route = "api/erp/requisitions/[id]";
  const gate = await erpGate(request, route);
  if (!gate.ok) return gate.response;
  const docId = parseId((await params).id);
  return erpHandle(route, async () => {
    if (docId === null) throw new ErpError(404, "ไม่พบใบเบิก");
    return erpJson(await getRequisition(gate.actor, docId));
  });
}

export async function PATCH(request: Request, { params }: Ctx): Promise<Response> {
  const route = "api/erp/requisitions/[id]";
  const gate = await erpGate(request, route, { mutation: true });
  if (!gate.ok) return gate.response;
  const docId = parseId((await params).id);
  return erpHandle(route, async () => {
    if (docId === null) throw new ErpError(404, "ไม่พบใบเบิก");
    const { version, ...input } = parseRequisitionInput(await readJsonBody(request, MAX_BODY), true);
    await updateRequisition(gate.actor, docId, version as number, input);
    return erpJson(await getRequisition(gate.actor, docId));
  });
}
