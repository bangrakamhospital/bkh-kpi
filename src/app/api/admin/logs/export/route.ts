import type { NextRequest } from "next/server";

import { adminError, adminGate } from "@/lib/auth/admin-gate";
import { auditLogAccess } from "@/lib/auth/audit";
import { requestMeta } from "@/lib/auth/request";
import {
  auditReadFailure,
  buildAuditWorkbook,
  staffNames,
} from "@/lib/audit/admin-api";
import { filterSummary, parseAuditFilter, queryAudit } from "@/lib/audit/query";

const ROUTE = "api/admin/logs/export";
const XLSX_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/**
 * GET /api/admin/logs/export?from=&to=&user=&action=   (same filter as
 * GET /api/admin/logs, `page` ignored)
 * -> .xlsx attachment of all matching records (newest first, at most
 *    AUDIT_MAX_MATCHES rows; sheet "เงื่อนไข" notes truncation).
 *    400 invalid filter, 401, 403 not admin, 429, 503 log unreadable.
 * Audited as audit_export. `private, no-store`.
 */
export async function GET(request: NextRequest): Promise<Response> {
  const gate = await adminGate(ROUTE);
  if (!gate.ok) return gate.response;

  const parsed = parseAuditFilter(request.nextUrl.searchParams);
  if (!parsed.ok) return adminError(400, parsed.error);
  const filter = { ...parsed.value, page: 1 };

  let buffer: Buffer;
  let rows: number;
  try {
    const result = await queryAudit(filter, await staffNames());
    rows = result.records.length;
    buffer = await buildAuditWorkbook(result.records, {
      from: filter.from,
      to: filter.to,
      truncated: result.truncated,
      total: result.total,
    });
  } catch (err) {
    return auditReadFailure(ROUTE, err);
  }

  auditLogAccess({
    action: "audit_export",
    actor: gate.admin.username,
    actorName: gate.admin.name,
    query: filterSummary(filter),
    rows,
    meta: requestMeta(request.headers),
  });

  // ASCII only, from validated dates -> no header injection.
  const filename = `kpi-audit-${filter.from}_${filter.to}.xlsx`;
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": XLSX_TYPE,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(buffer.byteLength),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
