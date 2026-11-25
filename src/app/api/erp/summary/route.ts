import { erpGate, erpHandle, erpJson } from "@/lib/erp/gate";
import { erpSummary } from "@/lib/erp/requisitions";

/**
 * GET /api/erp/summary -> 200 ErpSummary (home page /erp: my roles, work
 * waiting for me, my unit's latest requisitions).
 * 401 / 403 auditor / 429 / 503 (code erp_not_configured when ERP_DATABASE_URL is empty).
 */
export async function GET(request: Request): Promise<Response> {
  const route = "api/erp/summary";
  const gate = await erpGate(request, route);
  if (!gate.ok) return gate.response;
  return erpHandle(route, async () => erpJson(await erpSummary(gate.actor)));
}
