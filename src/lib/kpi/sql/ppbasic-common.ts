import "server-only";

import type { QueryParams } from "@/lib/db/his";

import {
  PERSON_IN_CATCHMENT_WHERE,
  PERSON_THAI_WHERE,
  type ScreeningSqlContext,
  type ScreeningSqlSpec,
} from "./screening-common";

/**
 * Shared pieces of the "P&P Basic Services" (/pp/basic) SQL modules
 * (./ppbasic-child-hosxp, ./ppbasic-dental-elderly-hosxp). HOSxP only.
 * Every item is ONE per-village aggregate query; no person rows.
 */

export interface PpBasicVillageSql {
  /** -> rows { village_id, village_moo, village_name, eligible, numerator } */
  village: string;
  buildParams(ctx: ScreeningSqlContext): QueryParams;
}

/**
 * Per-village aggregates of one item; same grouping as
 * buildScreeningSql().village (village_id 0 = unknown village, a safety net
 * only: the catchment filter already requires a real village). The joined
 * screened subquery has one row per person_id, so there is no fan-out.
 */
export function buildPpBasicVillageSql(spec: ScreeningSqlSpec): PpBasicVillageSql {
  const village = `
SELECT CASE WHEN v.village_id IS NULL THEN 0 ELSE p.village_id END AS village_id,
       MAX(CAST(v.village_moo AS CHAR)) AS village_moo,
       MAX(v.village_name)              AS village_name,
       COUNT(DISTINCT p.person_id)      AS eligible,
       COUNT(DISTINCT sc.person_id)     AS numerator
FROM person p
LEFT JOIN village v
  ON v.village_id = p.village_id
LEFT JOIN (${spec.screenedSubquery}
) sc
  ON sc.person_id = p.person_id
WHERE ${spec.targetWhere}
GROUP BY CASE WHEN v.village_id IS NULL THEN 0 ELSE p.village_id END
`;
  return { village, buildParams: spec.buildParams };
}

/** Target population of every item: living catchment residents (TYPEAREA 1/3), Thai. */
export const PPBASIC_CATCHMENT_THAI_WHERE = `${PERSON_IN_CATCHMENT_WHERE}${PERSON_THAI_WHERE}`;

/** Service date in [:countFrom, :dataAsOf] (dataAsOf inclusive). */
export const inFiscalYear = (col: string) =>
  `${col} >= :countFrom AND ${col} < DATE_ADD(:dataAsOf, INTERVAL 1 DAY)`;

/** :periodStart, :countFrom, :dataAsOf straight from the context. */
export function ppBasicBaseParams(ctx: ScreeningSqlContext): QueryParams {
  return {
    periodStart: ctx.periodStart,
    countFrom: ctx.countFrom,
    dataAsOf: ctx.dataAsOf,
  };
}
