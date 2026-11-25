import { erpGate, erpHandle, erpJson, toErpMe } from "@/lib/erp/gate";
import { getLookups } from "@/lib/erp/lookups";

/**
 * GET /api/erp/lookups -> 200 ErpLookups & { me: ErpMe }
 * Active org units, stores, items, categories and vendors for the forms.
 */
export async function GET(request: Request): Promise<Response> {
  const route = "api/erp/lookups";
  const gate = await erpGate(request, route);
  if (!gate.ok) return gate.response;
  return erpHandle(route, async () => erpJson({ ...(await getLookups()), me: toErpMe(gate.actor) }));
}
