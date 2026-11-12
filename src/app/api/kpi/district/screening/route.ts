import type { NextRequest } from "next/server";

import { requireSession } from "@/lib/auth/guard";
import {
  DISTRICT_KPI_CODES,
  getDistrictKpi,
  isDistrictKpiCode,
} from "@/lib/kpi/district";
import { HDC_MIN_FISCAL_YEAR } from "@/lib/kpi/district-areas";
import { currentFiscalYear } from "@/lib/kpi/screening";
import { jsonError, routeErrorResponse } from "@/lib/kpi/screening-api";
import type { DistrictKpiResult } from "@/lib/kpi/types";

const ROUTE = "api/kpi/district/screening";

/**
 * GET /api/kpi/district/screening?code=<DistrictKpiCode>&fy=2569
 * -> 200 DistrictKpiResult (discriminated by `kind`: "ratio" | "reduction"
 *    | "mortality"); aggregates only, HDC database only.
 * Ratio indicators and CKD5 are public. STEMI (district total, small
 * numbers) requires login like the hospital villages / persons APIs:
 * 401 without a valid session (checked before any data access).
 * fy: BE year in [2569 (first HDC year), current FY]; default current FY.
 * 400 invalid params, 500 when HDC cannot be queried.
 */
export async function GET(request: NextRequest): Promise<Response> {
  const params = request.nextUrl.searchParams;
  const code = params.get("code");
  if (!isDistrictKpiCode(code)) {
    return jsonError(
      400,
      `code ต้องเป็น ${DISTRICT_KPI_CODES.join(", ")} อย่างใดอย่างหนึ่ง`,
    );
  }
  if (code === "STEMI") {
    const auth = await requireSession(ROUTE);
    if (!auth.ok) return auth.response;
  }
  const currentFy = currentFiscalYear(new Date());
  const fyRaw = params.get("fy");
  const fy =
    fyRaw === null || fyRaw === ""
      ? currentFy
      : /^\d{4}$/.test(fyRaw)
        ? Number(fyRaw)
        : NaN;
  if (!Number.isInteger(fy) || fy < HDC_MIN_FISCAL_YEAR || fy > currentFy) {
    return jsonError(
      400,
      `fy ต้องเป็นปีงบประมาณ พ.ศ. ระหว่าง ${HDC_MIN_FISCAL_YEAR} ถึง ${currentFy}`,
    );
  }

  try {
    const body: DistrictKpiResult = await getDistrictKpi(code, fy);
    return Response.json(body, {
      headers: {
        "Cache-Control":
          code === "STEMI"
            ? "private, no-store"
            : "private, max-age=0, must-revalidate",
      },
    });
  } catch (err) {
    return routeErrorResponse(ROUTE, err);
  }
}
