import type { NextRequest } from "next/server";

import { auditDataAccess } from "@/lib/auth/audit";
import { requestMeta } from "@/lib/auth/request";
import { requireSession } from "@/lib/auth/guard";
import { buildDistrictPersonsWorkbook } from "@/lib/kpi/district-excel";
import {
  DistrictAreaNotFoundError,
  getDistrictPersons,
  parseDistrictPersonsQuery,
  scopeLabel,
} from "@/lib/kpi/district-persons";
import { jsonError, routeErrorResponse } from "@/lib/kpi/screening-api";

const ROUTE = "api/kpi/district/export";
const XLSX_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/**
 * GET /api/kpi/district/export?code=<DistrictCode>&fy=2569&tambon=650402
 *     (or &vid=65040203)
 * -> .xlsx attachment (sheets "สรุปรายหมู่", "รายชื่อ") of the district HDC
 *    person list. Patient-identifiable: login required (401),
 *    `Cache-Control: private, no-store`, audit-logged (no names).
 * Errors: JSON { error } with 400 / 404 / 500 like the persons API.
 */
export async function GET(request: NextRequest): Promise<Response> {
  const auth = await requireSession(ROUTE);
  if (!auth.ok) return auth.response;

  const parsed = parseDistrictPersonsQuery(
    request.nextUrl.searchParams,
    new Date(),
  );
  if (!parsed.ok) return jsonError(400, parsed.error);

  try {
    const { code, fiscalYear, scope } = parsed.value;
    const data = await getDistrictPersons(code, fiscalYear, scope);
    const buffer = await buildDistrictPersonsWorkbook(data);
    auditDataAccess(
      {
        action: "export",
        loginname: auth.user.username,
        name: auth.user.name,
        code: `district:${code}`,
        fiscalYear,
        villageId: scopeLabel(scope),
        rows: data.persons.length,
      },
      requestMeta(request.headers),
    );
    // ASCII only, from validated values (code from a fixed list, digits).
    const filename = `kpi-district-${code}-${fiscalYear}-${scopeLabel(scope)}.xlsx`;
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
    if (err instanceof DistrictAreaNotFoundError) {
      return jsonError(404, "ไม่พบพื้นที่นี้ในอำเภอบางระกำ หรือไม่มีกลุ่มเป้าหมาย");
    }
    return routeErrorResponse(ROUTE, err);
  }
}
