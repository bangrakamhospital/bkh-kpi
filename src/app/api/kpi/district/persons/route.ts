import type { NextRequest } from "next/server";

import { auditDataAccess } from "@/lib/auth/audit";
import { requireSession } from "@/lib/auth/guard";
import {
  DistrictAreaNotFoundError,
  getDistrictPersons,
  parseDistrictPersonsQuery,
  scopeLabel,
} from "@/lib/kpi/district-persons";
import { jsonError, routeErrorResponse } from "@/lib/kpi/screening-api";
import type { DistrictPersonsResponse } from "@/lib/kpi/types";

const ROUTE = "api/kpi/district/persons";

/**
 * GET /api/kpi/district/persons?code=<DistrictCode>&fy=2569&vid=65040203
 *     (or &tambon=650402 instead of vid)
 * -> 200 DistrictPersonsResponse: the target group B of the area with A
 *    status, from the district HDC database (same definition as the
 *    aggregates). Patient-identifiable (names): login required (401),
 *    `Cache-Control: private, no-store`, never cached server-side, each
 *    success audit-logged (no names).
 * 400 invalid params, 404 area not in อ.บางระกำ / village without target
 * group, 500 HDC error. Errors are { error: "<Thai text>" }.
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
    auditDataAccess({
      action: "persons",
      loginname: auth.user.username,
      code: `district:${code}`,
      fiscalYear,
      villageId: scopeLabel(scope),
      rows: data.persons.length,
    });
    const body: DistrictPersonsResponse = {
      code: data.code,
      fiscalYear: data.fiscalYear,
      scope: data.scope,
      dataAsOf: data.dataAsOf,
      persons: data.persons,
      truncated: data.truncated,
    };
    return Response.json(body, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (err) {
    if (err instanceof DistrictAreaNotFoundError) {
      return jsonError(404, "ไม่พบพื้นที่นี้ในอำเภอบางระกำ หรือไม่มีกลุ่มเป้าหมาย");
    }
    return routeErrorResponse(ROUTE, err);
  }
}
