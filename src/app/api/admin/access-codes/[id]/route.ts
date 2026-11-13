import {
  ACCESS_CODE_MESSAGES,
  accessCodeStoreFailure,
  toAccessCodeView,
} from "@/lib/access-codes/admin-api";
import { isValidAccessCodeId, revokeAccessCode } from "@/lib/access-codes/store";
import type { AccessCodeResponse } from "@/lib/access-codes/types";
import { adminError, adminMutationGate } from "@/lib/auth/admin-gate";
import { auditAccessCode } from "@/lib/auth/audit";
import { authJson, requestMeta } from "@/lib/auth/request";

/**
 * DELETE /api/admin/access-codes/{id}
 *   Revokes the code (the record is KEPT for the audit trail). The
 *   auditor's session ends on its next request (resolveAccess).
 *   Idempotent: revoking a revoked code -> 200, not audited again.
 * -> 200 { code: AccessCodeView }
 *    401 not logged in, 403 not admin / cross-origin, 404, 429, 503.
 * Same-origin only; `private, no-store`.
 */

type Ctx = { params: Promise<{ id: string }> };

export async function DELETE(request: Request, { params }: Ctx): Promise<Response> {
  const gate = await adminMutationGate(request, "api/admin/access-codes/[id]");
  if (!gate.ok) return gate.response;

  const { id } = await params;
  if (!isValidAccessCodeId(id)) {
    return adminError(404, ACCESS_CODE_MESSAGES.notFound);
  }
  let result;
  try {
    result = await revokeAccessCode(id, {
      sub: gate.admin.username,
      name: gate.admin.name,
    });
  } catch (err) {
    return accessCodeStoreFailure(err);
  }
  if (!result.ok) return adminError(404, ACCESS_CODE_MESSAGES.notFound);
  if (result.changed) {
    auditAccessCode({
      action: "access_code_revoke",
      actor: gate.admin.username,
      actorName: gate.admin.name,
      id,
      name: result.record.name,
      org: result.record.org,
      expiresAt: result.record.expiresAt,
      meta: requestMeta(request.headers),
    });
  }
  const body: AccessCodeResponse = { code: toAccessCodeView(result.record) };
  return authJson(body);
}
