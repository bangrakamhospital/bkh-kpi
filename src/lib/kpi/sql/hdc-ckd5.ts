import "server-only";

import type { QueryParams } from "@/lib/db/read-only-pool";
import {
  hdcDateParam,
  HDC_DATA_START_ISO,
  RESIDENTS_INCL_DEAD_CTE,
} from "./hdc-common";
import { minusYears, sqlCodeList } from "./screening-common";

/**
 * KPI 10 (CKD stage 5 new cases, reduction vs previous fiscal year) on the
 * district HDC database, per sub-district / village of residence.
 *
 * HOSxP (ckd5-hosxp.ts) derives stage 5 from the eGFR history (since 2017)
 * of every hospital patient. HDC has LABFU eGFR only from 2025-10, too
 * short for the 90-day / 3-month chronicity rules, so the district page
 * uses the DIAGNOSIS instead:
 *   case date = first N18.5 evidence of the person at any unit:
 *     CHRONIC.date_diag (full history), DIAGNOSIS_OPD.date_serv,
 *     DIAGNOSIS_IPD admit date (both only since 2025-10)
 *   new case of a fiscal year = case date inside that fiscal year.
 * Population = district residents (TYPEAREA 1/3, real village) INCLUDING
 * people who died since (incidence), de-duplicated by CID.
 * Because DIAGNOSIS has no history before 2025-10, a patient first coded
 * in FY 2569 may be an old patient: FY 2569 counts are inflated and the
 * previous year of FY 2569 (FY 2568) is not comparable at all — callers
 * must check `previousYearComparable`.
 *
 * Parameters ('YYYYMMDD'): :prevStart :periodStart :dataAsOf :prevSameDayEnd
 * -> rows { vid, current_cases, previous_cases, previous_same_period }
 */

/** ICD-10 (no dot) of CKD stage 5. */
export const HDC_CKD5_ICD10: readonly string[] = ["N185"];

const ICD = sqlCodeList(HDC_CKD5_ICD10);

export const HDC_CKD5_VILLAGE_SQL = `${RESIDENTS_INCL_DEAD_CTE},
ev AS (
  SELECT x.cid, MIN(x.d) AS case_date
  FROM (
    SELECT c.cid, c.date_diag AS d
    FROM chronic c
    WHERE c.chronic IN (${ICD})
      AND c.date_diag >= '19000101'
    UNION ALL
    SELECT o.cid, o.date_serv AS d
    FROM diagnosis_opd o
    WHERE o.diagcode IN (${ICD})
    UNION ALL
    SELECT i.cid, LEFT(i.datetime_admit, 8) AS d
    FROM diagnosis_ipd i
    WHERE i.diagcode IN (${ICD})
  ) x
  WHERE x.d <= :dataAsOf
  GROUP BY x.cid
)
SELECT r.vid AS vid,
       SUM(ev.case_date >= :periodStart) AS current_cases,
       SUM(ev.case_date >= :prevStart AND ev.case_date < :periodStart) AS previous_cases,
       SUM(ev.case_date >= :prevStart AND ev.case_date <= :prevSameDayEnd) AS previous_same_period
FROM residents r
JOIN ev ON ev.cid = r.cid
WHERE ev.case_date >= :prevStart
GROUP BY r.vid
`;

export interface HdcCkd5Context {
  /** ISO 1 Oct of the selected fiscal year. */
  periodStart: string;
  /** ISO inclusive cutoff. */
  dataAsOf: string;
}

export function hdcCkd5Params(ctx: HdcCkd5Context): QueryParams {
  return {
    prevStart: hdcDateParam(minusYears(ctx.periodStart, 1)),
    periodStart: hdcDateParam(ctx.periodStart),
    dataAsOf: hdcDateParam(ctx.dataAsOf),
    prevSameDayEnd: hdcDateParam(minusYears(ctx.dataAsOf, 1)),
  };
}

/**
 * The previous fiscal year can only be compared when it lies entirely in
 * the HDC diagnosis period (FY >= 2570).
 */
export function previousYearComparable(periodStart: string): boolean {
  return minusYears(periodStart, 1) >= HDC_DATA_START_ISO;
}
