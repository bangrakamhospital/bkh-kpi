import "server-only";

import { cacheLife, cacheTag } from "next/cache";

import { loadStaticStrategy } from "@/lib/kpi/sources/strategy-static";
import type { StrategyDashboardData } from "@/lib/kpi/strategy-types";

/**
 * "ยุทธศาสตร์ & HA" (/strategy) — strategic KPIs 2568–2569 and HA
 * Part I–IV indicators 2565–2569. Aggregates only.
 *
 * Source today: the verified static dataset (sources/strategy-static.*).
 * To move to the HIS database later, add a source next to it (e.g.
 * sources/strategy-his.ts using query() from src/lib/db/his) that returns
 * the same StrategyDashboardData and call it here. Then also `await io()`
 * before the cached call (see ppfs.ts / screening.ts) so the database is
 * never queried during prerender. The UI does not change.
 */
export const STRATEGY_CACHE_TAG = "kpi-strategy";

export async function getStrategyDashboard(): Promise<StrategyDashboardData> {
  "use cache";
  cacheTag(STRATEGY_CACHE_TAG);
  cacheLife("days");
  return loadStaticStrategy();
}
