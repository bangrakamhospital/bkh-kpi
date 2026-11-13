import {
  ACCESS_CODE_MESSAGES,
  accessCodeStoreFailure,
  MAX_ACCESS_CODE_BODY_BYTES,
  parseAccessCodeCreate,
  toAccessCodeView,
} from "@/lib/access-codes/admin-api";
import { accessCodeHashingReady } from "@/lib/access-codes/code";
import { createAccessCode, listAccessCodes } from "@/lib/access-codes/store";
import type {
  AccessCodeCreateResponse,
  AccessCodesResponse,
} from "@/lib/access-codes/types";
import {
  adminError,
  adminGate,
  adminMutationGate,
  readJsonBody,
} from "@/lib/auth/admin-gate";
import { auditAccessCode } from "@/lib/auth/audit";
import { authJson, requestMeta } from "@/lib/auth/request";

/**
 * External-auditor access codes (admin only).
 *
 * GET  /api/admin/access-codes
 *   -> 200 { codes: AccessCodeView[] } newest first (never hashes / codes)
 * POST /api/admin/access-codes   body { name, org, expiresOn: "YYYY-MM-DD" }
 *   expiresOn = Bangkok day in [today, today + 90]; valid until its end.
 *   -> 201 { code: AccessCodeView, plaintext } — the ONLY time the
 *      plaintext code is returned (only its HMAC is stored).
 *    400 invalid body, 409 too many records, 503 store / secret missing.
 * Both: 401 not logged in, 403 not admin / cross-origin, 429.
 * Same-origin JSON only; `private, no-store`.
 */

export async function GET(): Promise<Response> {
  const gate = await adminGate("api/admin/access-codes");
  if (!gate.ok) return gate.response;
  try {
    const now = Date.now();
    const body: AccessCodesResponse = {
      codes: (await listAccessCodes()).map((r) => toAccessCodeView(r, now)),
    };
    return authJson(body);
  } catch (err) {
    return accessCodeStoreFailure(err);
  }
}

export async function POST(request: Request): Promise<Response> {
  const gate = await adminMutationGate(request, "api/admin/access-codes");
  if (!gate.ok) return gate.response;
  if (!accessCodeHashingReady()) {
    return adminError(503, ACCESS_CODE_MESSAGES.notConfigured);
  }

  const parsed = parseAccessCodeCreate(
    await readJsonBody(request, MAX_ACCESS_CODE_BODY_BYTES),
  );
  if (!parsed.ok) return adminError(400, parsed.error);

  let result;
  try {
    result = await createAccessCode(parsed.value, {
      sub: gate.admin.username,
      name: gate.admin.name,
    });
  } catch (err) {
    return accessCodeStoreFailure(err);
  }
  if (!result.ok) return adminError(409, ACCESS_CODE_MESSAGES.tooMany);

  auditAccessCode({
    action: "access_code_create",
    actor: gate.admin.username,
    actorName: gate.admin.name,
    id: result.record.id,
    name: result.record.name,
    org: result.record.org,
    expiresAt: result.record.expiresAt,
    meta: requestMeta(request.headers),
  });
  const body: AccessCodeCreateResponse = {
    code: toAccessCodeView(result.record),
    plaintext: result.plaintext,
  };
  return authJson(body, 201);
}
