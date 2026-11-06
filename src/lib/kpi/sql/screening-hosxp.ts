import "server-only";

import {
  AGE_MIN_WHERE,
  ageParams,
  buildScreeningSql,
  NO_PRIOR_DIAGNOSIS_WHERE,
  PERSON_IN_CATCHMENT_WHERE,
  type ScreeningSqlSet,
} from "./screening-common";
import { SCREENING_INDICATORS } from "@/lib/kpi/screening-indicators";

/**
 * SQL for KPI 1–2 (DM/HT screening, age >= 35) against HOSxP (MySQL/MariaDB).
 *
 * !!! UNVERIFIED !!!
 * Table and column names below are assumptions based on common HOSxP /
 * HOSxP PCU schemas. They have NOT been checked against the real database
 * (db-cli is not available yet). Verify every item marked VERIFY via the
 * `db-cli` skill before relying on the numbers.
 * See docs/kpi/01-screening-dm-ht.md section 7.
 *
 * Parameters (besides the common ones in ./screening-common):
 *   :birthOnOrBefore 'YYYY-MM-DD'  periodStart minus 35 years
 *   :icdFrom         e.g. 'E10'    inclusive
 *   :icdToExclusive  e.g. 'E15'    exclusive (covers E10..E14 incl. subcodes)
 * For DM/HT :countFrom always equals :periodStart.
 */

type DmHtCode = "DM" | "HT";

/** ICD-10 ranges for "already diagnosed" exclusion (sargable string range). */
export const SCREENING_ICD_RANGE: Record<
  DmHtCode,
  { icdFrom: string; icdToExclusive: string }
> = {
  DM: { icdFrom: "E10", icdToExclusive: "E15" }, // E10–E14
  HT: { icdFrom: "I10", icdToExclusive: "I16" }, // I10–I15
};

/**
 * Target population (B) on `person p`: catchment, alive, age >= 35 on
 * 1 Oct, not diagnosed with the disease before 1 Oct.
 * Consider also excluding by clinicmember / person_chronic (site-specific).
 */
const DMHT_TARGET_WHERE = `${PERSON_IN_CATCHMENT_WHERE}${AGE_MIN_WHERE}${NO_PRIOR_DIAGNOSIS_WHERE}`;

/**
 * Valid screening result on `person_dmht_risk_screen_head h`.
 * VERIFY: column names for blood sugar and blood pressure.
 */
const SCREEN_RESULT_WHERE: Record<DmHtCode, string> = {
  DM: "h.last_fgc > 0",
  HT: "h.last_bps > 0 AND h.last_bpd > 0",
};

/**
 * People with a valid DM/HT screening in [:countFrom, :dataAsOf].
 * VERIFY:
 *  - person_dmht_screen_summary(person_dmht_screen_summary_id, person_id)
 *  - person_dmht_risk_screen_head(person_dmht_screen_summary_id, screen_date)
 */
function screenedSubquery(code: DmHtCode): string {
  return `
  SELECT s.person_id, MIN(h.screen_date) AS first_screen_date
  FROM person_dmht_screen_summary s
  JOIN person_dmht_risk_screen_head h
    ON h.person_dmht_screen_summary_id = s.person_dmht_screen_summary_id
  WHERE h.screen_date >= :countFrom
    AND h.screen_date <  DATE_ADD(:dataAsOf, INTERVAL 1 DAY)
    AND ${SCREEN_RESULT_WHERE[code]}
  GROUP BY s.person_id`;
}

function dmHtSql(code: DmHtCode): ScreeningSqlSet {
  return buildScreeningSql({
    targetWhere: DMHT_TARGET_WHERE,
    screenedSubquery: screenedSubquery(code),
    buildParams: (ctx) => ({
      periodStart: ctx.periodStart,
      countFrom: ctx.countFrom,
      dataAsOf: ctx.dataAsOf,
      ...ageParams(
        ctx.periodStart,
        SCREENING_INDICATORS[code].minAge,
        SCREENING_INDICATORS[code].maxAge,
      ),
      ...SCREENING_ICD_RANGE[code],
    }),
  });
}

export const DM_SQL: ScreeningSqlSet = dmHtSql("DM");
export const HT_SQL: ScreeningSqlSet = dmHtSql("HT");
