import type { NextRequest } from "next/server";

import { requireSession } from "@/lib/auth/guard";
import {
  jsonError,
  parseScreeningQuery,
  routeErrorResponse,
} from "@/lib/kpi/screening-api";
import { getScreeningVillages } from "@/lib/kpi/screening-detail";
import type { VillageBreakdown } from "@/lib/kpi/types";

/**
 * GET /api/kpi/screening/villages?code=<ScreeningCode>&fy=2570
 * -> 200 VillageBreakdown[] (aggregates only, ordered by village number).
 * Data is cached server-side for ~1 hour ("use cache" in the data layer).
 * STEMI (small numbers, could identify a deceased patient) requires login
 * like the persons API: 401 without a valid session. Other codes are public.
 * Node.js runtime (default; `runtime` config is not allowed with Cache Components).
 */
export async function GET(request: NextRequest): Promise<Response> {
  const parsed = parseScreeningQuery(
    request.nextUrl.searchParams,
    "none",
    new Date(),
  );
  if (!parsed.ok) return jsonError(400, parsed.error);

  try {
    const { code, fiscalYear } = parsed.value;
    if (code === "STEMI") {
      const auth = await requireSession("api/kpi/screening/villages");
      if (!auth.ok) return auth.response;
    }
    const body: VillageBreakdown[] = await getScreeningVillages(
      code,
      fiscalYear,
    );
    return Response.json(body, {
      headers: { "Cache-Control": "private, max-age=0, must-revalidate" },
    });
  } catch (err) {
    return routeErrorResponse("api/kpi/screening/villages", err);
  }
}
