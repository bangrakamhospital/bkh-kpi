import type { NextRequest } from "next/server";

import {
  jsonError,
  parseScreeningQuery,
  routeErrorResponse,
} from "@/lib/kpi/screening-api";
import { getScreeningPersons } from "@/lib/kpi/screening-detail";
import type { ScreeningPerson } from "@/lib/kpi/types";

/**
 * GET /api/kpi/screening/persons?code=DM|HT|CX|BR&fy=2570&village=12
 * -> 200 ScreeningPerson[]: whole target group (eligible; for CX all women
 *    30–60, not only the 70% target) of the village with
 *    screening status, unscreened first then by name (max 5000 rows; header
 *    `X-Result-Truncated: true` when cut).
 *
 * Contains patient-identifiable data (HN, name): never cached anywhere
 * (no "use cache" in the data layer, `Cache-Control: private, no-store`).
 * Do not log the response body.
 */
export async function GET(request: NextRequest): Promise<Response> {
  const parsed = parseScreeningQuery(
    request.nextUrl.searchParams,
    "required",
    new Date(),
  );
  if (!parsed.ok) return jsonError(400, parsed.error);

  try {
    const { code, fiscalYear, villageId } = parsed.value;
    const { persons, truncated } = await getScreeningPersons(
      code,
      fiscalYear,
      villageId as number,
    );
    const body: ScreeningPerson[] = persons;
    const headers: Record<string, string> = {
      "Cache-Control": "private, no-store",
    };
    if (truncated) headers["X-Result-Truncated"] = "true";
    return Response.json(body, { headers });
  } catch (err) {
    return routeErrorResponse("api/kpi/screening/persons", err);
  }
}
