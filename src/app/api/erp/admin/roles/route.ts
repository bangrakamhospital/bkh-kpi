import { readJsonBody } from "@/lib/auth/admin-gate";
import { erpAdminGate, erpHandle, erpJson } from "@/lib/erp/gate";
import { grantRole, listRoleCandidates, listRoleGrants, parseGrantBody } from "@/lib/erp/roles";
import type { RolesResponse } from "@/lib/erp/types";

/**
 * GET  /api/erp/admin/roles -> 200 RolesResponse { grants, users (approved web-app accounts) }
 * POST /api/erp/admin/roles body { sub, role, orgUnitId?, storeId? } -> 201 { id }
 *   recorder / unit_head need orgUnitId; storeId only for store_officer
 *   (null = every store). 409 duplicate grant. erp_admin / web-app admin only.
 */
export async function GET(request: Request): Promise<Response> {
  const route = "api/erp/admin/roles";
  const gate = await erpAdminGate(request, route);
  if (!gate.ok) return gate.response;
  return erpHandle(route, async () => {
    const [grants, users] = await Promise.all([listRoleGrants(), listRoleCandidates()]);
    const body: RolesResponse = { grants, users };
    return erpJson(body);
  });
}

export async function POST(request: Request): Promise<Response> {
  const route = "api/erp/admin/roles";
  const gate = await erpAdminGate(request, route, { mutation: true });
  if (!gate.ok) return gate.response;
  return erpHandle(route, async () => {
    const input = parseGrantBody(await readJsonBody(request, 2048));
    return erpJson({ id: await grantRole(gate.actor, input) }, 201);
  });
}
