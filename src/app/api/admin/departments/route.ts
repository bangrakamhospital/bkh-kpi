import { auditDepartment } from "@/lib/auth/audit";
import {
  adminError,
  adminMutationGate,
  readJsonBody,
} from "@/lib/auth/admin-gate";
import { authJson, requestMeta } from "@/lib/auth/request";
import {
  DEPARTMENT_MESSAGES,
  departmentStoreFailure,
  MAX_DEPARTMENT_BODY_BYTES,
} from "@/lib/departments/admin-api";
import { createDepartment, parseDepartmentBody } from "@/lib/departments/store";
import type { DepartmentResponse } from "@/lib/departments/types";

/**
 * POST /api/admin/departments  body { name, color?, codes }
 *   name 1–60 chars (trimmed), unique case-insensitive; color one of
 *   DEPARTMENT_COLORS or null; codes = known ScreeningCodes (deduped).
 * -> 201 { department }
 *    400 invalid body, 401 not logged in, 403 not admin / cross-origin,
 *    409 duplicate name or too many departments, 429, 503.
 * Same-origin JSON only; `private, no-store`. (List: GET /api/departments.)
 */
export async function POST(request: Request): Promise<Response> {
  const gate = await adminMutationGate(request, "api/admin/departments");
  if (!gate.ok) return gate.response;

  const parsed = parseDepartmentBody(
    await readJsonBody(request, MAX_DEPARTMENT_BODY_BYTES),
    "create",
  );
  if (!parsed.ok) return adminError(400, parsed.error);

  let result;
  try {
    result = await createDepartment(parsed.value);
  } catch (err) {
    return departmentStoreFailure(err);
  }
  if (!result.ok) {
    return adminError(
      409,
      result.error === "duplicate_name"
        ? DEPARTMENT_MESSAGES.duplicateName
        : DEPARTMENT_MESSAGES.tooMany,
    );
  }
  auditDepartment({
    action: "department_create",
    actor: gate.admin.username,
    actorName: gate.admin.name,
    id: result.department.id,
    name: result.department.name,
    meta: requestMeta(request.headers),
  });
  const body: DepartmentResponse = { department: result.department };
  return authJson(body, 201);
}
