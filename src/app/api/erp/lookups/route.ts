import { erpErrorResponse, erpGate, erpHandle, erpJson, isErpAdmin, toErpMe } from "@/lib/erp/gate";
import { getLookups } from "@/lib/erp/lookups";

/**
 * GET /api/erp/lookups -> 200 ErpLookups & { me: ErpMe }
 * 403 no_erp_role when the user has no ERP role (and is not an admin).
 * Active org units, stores, items, categories and vendors for the forms.
 */
export async function GET(request: Request): Promise<Response> {
  const route = "api/erp/lookups";
  const gate = await erpGate(request, route);
  if (!gate.ok) return gate.response;
  // Master data only for people who work in the ERP (any role, or admin).
  if (gate.actor.roles.length === 0 && !isErpAdmin(gate.actor)) {
    return erpErrorResponse(403, "คุณยังไม่มีบทบาทในระบบ ERP กรุณาติดต่อผู้ดูแลระบบ ERP", "no_erp_role");
  }
  return erpHandle(route, async () => erpJson({ ...(await getLookups()), me: toErpMe(gate.actor) }));
}
