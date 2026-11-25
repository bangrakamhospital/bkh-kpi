import { readJsonBody } from "@/lib/auth/admin-gate";
import { ErpError, erpAdminGate, erpHandle, erpJson } from "@/lib/erp/gate";
import { createMaster, listMaster, parseMasterBody } from "@/lib/erp/master";
import { isMasterEntity } from "@/lib/erp/master-schema";

const MAX_BODY = 8 * 1024;

type Ctx = { params: Promise<{ entity: string }> };

/**
 * GET  /api/erp/admin/{entity} -> 200 { rows: MasterRow[] } (active and inactive)
 * POST /api/erp/admin/{entity} body { field: value } -> 201 { row }
 * entity: org-units | stores | categories | items | vendors | staff
 * (fields: src/lib/erp/master-schema.ts). erp_admin / web-app admin only.
 * 409 duplicate code.
 */
export async function GET(request: Request, { params }: Ctx): Promise<Response> {
  const route = "api/erp/admin/[entity]";
  const gate = await erpAdminGate(request, route);
  if (!gate.ok) return gate.response;
  const { entity } = await params;
  return erpHandle(route, async () => {
    if (!isMasterEntity(entity)) throw new ErpError(404, "ไม่พบข้อมูล");
    return erpJson({ rows: await listMaster(entity) });
  });
}

export async function POST(request: Request, { params }: Ctx): Promise<Response> {
  const route = "api/erp/admin/[entity]";
  const gate = await erpAdminGate(request, route, { mutation: true });
  if (!gate.ok) return gate.response;
  const { entity } = await params;
  return erpHandle(route, async () => {
    if (!isMasterEntity(entity)) throw new ErpError(404, "ไม่พบข้อมูล");
    const values = parseMasterBody(entity, await readJsonBody(request, MAX_BODY), "create");
    return erpJson({ row: await createMaster(gate.actor, entity, values) }, 201);
  });
}
