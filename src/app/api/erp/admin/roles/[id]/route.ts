import { ErpError, erpAdminGate, erpHandle, erpJson, parseId } from "@/lib/erp/gate";
import { revokeRole } from "@/lib/erp/roles";

type Ctx = { params: Promise<{ id: string }> };

/** DELETE /api/erp/admin/roles/{id} -> 200 { ok: true } (404). erp_admin only. */
export async function DELETE(request: Request, { params }: Ctx): Promise<Response> {
  const route = "api/erp/admin/roles/[id]";
  const gate = await erpAdminGate(request, route, { mutation: true });
  if (!gate.ok) return gate.response;
  const grantId = parseId((await params).id);
  return erpHandle(route, async () => {
    if (grantId === null) throw new ErpError(404, "ไม่พบสิทธิ์นี้");
    await revokeRole(gate.actor, grantId);
    return erpJson({ ok: true });
  });
}
