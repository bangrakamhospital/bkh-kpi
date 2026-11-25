import { readJsonBody } from "@/lib/auth/admin-gate";
import { ErpError, erpAdminGate, erpHandle, erpJson, parseId } from "@/lib/erp/gate";
import { parseMasterBody, updateMaster } from "@/lib/erp/master";
import { isMasterEntity } from "@/lib/erp/master-schema";

const MAX_BODY = 8 * 1024;

type Ctx = { params: Promise<{ entity: string; id: string }> };

/**
 * PATCH /api/erp/admin/{entity}/{id} body { field?: value } -> 200 { row }
 * No DELETE: deactivate with { active: false } (documents keep their references).
 */
export async function PATCH(request: Request, { params }: Ctx): Promise<Response> {
  const route = "api/erp/admin/[entity]/[id]";
  const gate = await erpAdminGate(request, route, { mutation: true });
  if (!gate.ok) return gate.response;
  const { entity, id } = await params;
  const rowId = parseId(id);
  return erpHandle(route, async () => {
    if (!isMasterEntity(entity) || rowId === null) throw new ErpError(404, "ไม่พบข้อมูล");
    const values = parseMasterBody(entity, await readJsonBody(request, MAX_BODY), "patch");
    return erpJson({ row: await updateMaster(gate.actor, entity, rowId, values) });
  });
}
