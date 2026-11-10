import type { NextRequest } from "next/server";

import { auditDataAccess } from "@/lib/auth/audit";
import { requestMeta } from "@/lib/auth/request";
import { requireSession } from "@/lib/auth/guard";
import {
  jsonError,
  parseScreeningQuery,
  routeErrorResponse,
} from "@/lib/kpi/screening-api";
import { getScreeningExport } from "@/lib/kpi/screening-detail";
import { buildScreeningWorkbook } from "@/lib/kpi/screening-excel";

/**
 * GET /api/kpi/screening/export?code=<ScreeningCode>&fy=2570[&village=12]
 * -> .xlsx attachment with sheets "สรุปรายหมู่" and "รายชื่อ".
 * With `village`: only that village.
 *
 * Contains patient-identifiable data (HN, name): never cached
 * (`Cache-Control: private, no-store`).
 *
 * Requires login (Auth.js session): 401 { error: "กรุณาเข้าสู่ระบบ" } without a valid session,
 * 503 when auth is not configured. Each success is audit-logged.
 */
const XLSX_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export async function GET(request: NextRequest): Promise<Response> {
  // Login required (patient-identifiable data). Checked here, not only in UI.
  const auth = await requireSession("api/kpi/screening/export");
  if (!auth.ok) return auth.response;

  const parsed = parseScreeningQuery(
    request.nextUrl.searchParams,
    "optional",
    new Date(),
  );
  if (!parsed.ok) return jsonError(400, parsed.error);

  try {
    const { code, fiscalYear, villageId } = parsed.value;
    const data = await getScreeningExport(code, fiscalYear, villageId);
    const buffer = await buildScreeningWorkbook(data);

    // ASCII only, built from validated values (moo used only if all digits)
    // -> no header injection. Uses the real village number when known.
    let suffix = "";
    if (villageId !== null) {
      const moo = data.villages[0]?.moo ?? "";
      suffix = /^\d{1,4}$/.test(moo) ? `-moo${moo}` : `-village${villageId}`;
    }
    auditDataAccess(
      {
        action: "export",
        loginname: auth.user.username,
        name: auth.user.name,
        code,
        fiscalYear,
        villageId,
        rows: data.persons.length,
      },
      requestMeta(request.headers),
    );
    const filename = `kpi-${code}-${fiscalYear}${suffix}.xlsx`;

    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": XLSX_TYPE,
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(buffer.byteLength),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err) {
    return routeErrorResponse("api/kpi/screening/export", err);
  }
}
