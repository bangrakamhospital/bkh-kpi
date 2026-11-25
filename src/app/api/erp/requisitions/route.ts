import { readJsonBody } from "@/lib/auth/admin-gate";
import { erpGate, erpHandle, erpJson } from "@/lib/erp/gate";
import { createRequisition, listRequisitions, parseRequisitionInput } from "@/lib/erp/requisitions";
import { isDocStatus, REQUISITION_SCOPES, type RequisitionScope } from "@/lib/erp/types";

const MAX_BODY = 32 * 1024;

/**
 * GET  /api/erp/requisitions?scope=mine|approve|issue|all&status=&page=&q=(doc no prefix, <= 30 chars)
 *   -> 200 { items: RequisitionSummary[], total, page, pageSize }   (403 scope not allowed)
 * POST /api/erp/requisitions  body RequisitionInput -> 201 { id }  (draft)
 *   recorder / unit_head of body.orgUnitId only; same-origin JSON <= 32 KB.
 */
export async function GET(request: Request): Promise<Response> {
  const route = "api/erp/requisitions";
  const gate = await erpGate(request, route);
  if (!gate.ok) return gate.response;
  const q = new URL(request.url).searchParams;
  const scopeRaw = q.get("scope") ?? "mine";
  const scope = (REQUISITION_SCOPES as readonly string[]).includes(scopeRaw)
    ? (scopeRaw as RequisitionScope)
    : "mine";
  const statusRaw = q.get("status");
  const status = isDocStatus(statusRaw) ? statusRaw : null;
  const pageRaw = Number(q.get("page") ?? "1");
  const page = Number.isInteger(pageRaw) && pageRaw >= 1 && pageRaw <= 10_000 ? pageRaw : 1;
  const docQuery = q.get("q") ?? undefined;
  return erpHandle(route, async () => erpJson(await listRequisitions(gate.actor, scope, { status, page, q: docQuery })));
}

export async function POST(request: Request): Promise<Response> {
  const route = "api/erp/requisitions";
  const gate = await erpGate(request, route, { mutation: true });
  if (!gate.ok) return gate.response;
  return erpHandle(route, async () => {
    const input = parseRequisitionInput(await readJsonBody(request, MAX_BODY), false);
    const res = await createRequisition(gate.actor, input);
    return erpJson(res, res.replayed ? 200 : 201);
  });
}
