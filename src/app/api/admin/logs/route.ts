import type { NextRequest } from "next/server";

import { adminError, adminGate } from "@/lib/auth/admin-gate";
import { auditLogAccess } from "@/lib/auth/audit";
import { authJson, requestMeta } from "@/lib/auth/request";
import { auditReadFailure, staffNames } from "@/lib/audit/admin-api";
import {
  AUDIT_MAX_MATCHES,
  AUDIT_PAGE_SIZE,
  filterSummary,
  parseAuditFilter,
  queryAudit,
} from "@/lib/audit/query";
import type { AuditListResponse } from "@/lib/audit/types";

const ROUTE = "api/admin/logs";

/**
 * GET /api/admin/logs?from=YYYY-MM-DD&to=YYYY-MM-DD&user=<text>&action=<action|group:key>&page=1
 *   from / to: Asia/Bangkok dates, inclusive (default: last 7 days),
 *   range <= 366 days; user: substring of loginname / sub / display name.
 * -> 200 AuditListResponse (newest first, 100 per page)
 *    400 invalid filter, 401, 403 not admin, 429, 503 log unreadable.
 * Staff identity + parameters only. Each call is itself audited
 * (audit_view). Always `private, no-store`.
 */
export async function GET(request: NextRequest): Promise<Response> {
  const gate = await adminGate(ROUTE);
  if (!gate.ok) return gate.response;

  const parsed = parseAuditFilter(request.nextUrl.searchParams);
  if (!parsed.ok) return adminError(400, parsed.error);
  const filter = parsed.value;

  let result;
  try {
    result = await queryAudit(filter, await staffNames());
  } catch (err) {
    return auditReadFailure(ROUTE, err);
  }

  const lastPage = Math.max(1, Math.ceil(result.records.length / AUDIT_PAGE_SIZE));
  const page = Math.min(filter.page, lastPage);
  const start = (page - 1) * AUDIT_PAGE_SIZE;
  const items = result.records
    .slice(start, start + AUDIT_PAGE_SIZE)
    .map((r, i) => ({ ...r, id: `${r.ts}-${start + i}` }));

  auditLogAccess({
    action: "audit_view",
    actor: gate.admin.username,
    actorName: gate.admin.name,
    query: filterSummary({ ...filter, page }),
    rows: items.length,
    meta: requestMeta(request.headers),
  });

  const body: AuditListResponse = {
    items,
    total: result.total,
    page,
    pageSize: AUDIT_PAGE_SIZE,
    pages: lastPage,
    maxRecords: AUDIT_MAX_MATCHES,
    truncated: result.truncated,
    from: filter.from,
    to: filter.to,
  };
  return authJson(body);
}
