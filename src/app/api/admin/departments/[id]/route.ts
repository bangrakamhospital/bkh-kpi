import { auditDepartment } from "@/lib/auth/audit";
import {
  adminError,
  adminMutationGate,
  readJsonBody,
} from "@/lib/auth/admin-gate";
import { authJson, clientIp } from "@/lib/auth/request";
import {
  DEPARTMENT_MESSAGES,
  departmentStoreFailure,
  MAX_DEPARTMENT_BODY_BYTES,
} from "@/lib/departments/admin-api";
import {
  deleteDepartment,
  isValidDepartmentId,
  parseDepartmentBody,
  updateDepartment,
} from "@/lib/departments/store";
import type { DepartmentResponse } from "@/lib/departments/types";

/**
 * PATCH  /api/admin/departments/{id}  body { name?, color?, codes? }
 *   -> 200 { department }   (400 / 404 / 409 duplicate name)
 * DELETE /api/admin/departments/{id}
 *   -> 200 { ok: true }     (404)
 * Both: 401 not logged in, 403 not admin / cross-origin, 429, 503.
 * Same-origin only; `private, no-store`.
 */

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Ctx): Promise<Response> {
  const gate = await adminMutationGate(request, "api/admin/departments/[id]");
  if (!gate.ok) return gate.response;

  const { id } = await params;
  if (!isValidDepartmentId(id)) {
    return adminError(404, DEPARTMENT_MESSAGES.notFound);
  }
  const parsed = parseDepartmentBody(
    await readJsonBody(request, MAX_DEPARTMENT_BODY_BYTES),
    "patch",
  );
  if (!parsed.ok) return adminError(400, parsed.error);

  let result;
  try {
    result = await updateDepartment(id, parsed.value);
  } catch (err) {
    return departmentStoreFailure(err);
  }
  if (!result.ok) {
    return result.error === "not_found"
      ? adminError(404, DEPARTMENT_MESSAGES.notFound)
      : adminError(409, DEPARTMENT_MESSAGES.duplicateName);
  }
  if (result.changed) {
    auditDepartment({
      action: "department_update",
      actor: gate.admin.username,
      id,
      name: result.department.name,
      ip: clientIp(request.headers),
    });
  }
  const body: DepartmentResponse = { department: result.department };
  return authJson(body);
}

export async function DELETE(request: Request, { params }: Ctx): Promise<Response> {
  const gate = await adminMutationGate(request, "api/admin/departments/[id]");
  if (!gate.ok) return gate.response;

  const { id } = await params;
  if (!isValidDepartmentId(id)) {
    return adminError(404, DEPARTMENT_MESSAGES.notFound);
  }
  let result;
  try {
    result = await deleteDepartment(id);
  } catch (err) {
    return departmentStoreFailure(err);
  }
  if (!result.ok) return adminError(404, DEPARTMENT_MESSAGES.notFound);
  auditDepartment({
    action: "department_delete",
    actor: gate.admin.username,
    id,
    name: result.department.name,
    ip: clientIp(request.headers),
  });
  return authJson({ ok: true });
}
