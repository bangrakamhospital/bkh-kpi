import "server-only";

import {
  AGE_MIN_WHERE,
  ageParams,
  buildScreeningSql,
  NO_PRIOR_CLINIC_MEMBER_WHERE,
  NO_PRIOR_DIAGNOSIS_WHERE,
  PERSON_IN_CATCHMENT_WHERE,
  type ScreeningSqlSet,
} from "./screening-common";
import { SCREENING_INDICATORS } from "@/lib/kpi/screening-indicators";

/**
 * SQL for KPI 1–2 (DM/HT screening, age >= 35) against HOSxP (MySQL/MariaDB).
 *
 * Verified with db-cli against the production database
 * (see docs/kpi/01-screening-dm-ht.md section 7):
 *  - Screening results live in the HOSxP DM/HT screening module
 *    `person_dmht_risk_screen_head` (one row per screening, screen_date,
 *    last_bps/last_bpd, last_fgc/last_fgc_no_food_limit/last_fpg/ppg),
 *    linked to the person via `person_dmht_screen_summary`
 *    (person_dmht_screen_summary_id -> person_id). This is what HOSxP
 *    exports as the 43-file NCDSCREEN. Child tables
 *    (person_dm_fgc_screen, person_ht_risk_bp_screen, ...) only hold
 *    repeated measurements of the same head row.
 *  - The site screens in campaigns (mostly Mar–May), so early in a fiscal
 *    year A is legitimately 0 until the campaign starts.
 *  - opdscreen (OPD vital signs) is NOT counted: it is not NCDSCREEN.
 *
 * Parameters (besides the common ones in ./screening-common):
 *   :birthOnOrBefore 'YYYY-MM-DD'  periodStart minus 35 years
 *   :icdFrom         e.g. 'E10'    inclusive
 *   :icdToExclusive  e.g. 'E15'    exclusive (covers E10..E14 incl. subcodes)
 *   :clinicCode      '001' (DM) / '002' (HT)
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

/** clinicmember.clinic codes of the chronic clinics at this site (verified). */
export const SCREENING_CLINIC_CODE: Record<DmHtCode, string> = {
  DM: "001", // โรคเบาหวาน
  HT: "002", // โรคความดันโลหิตสูง
};

/**
 * Target population (B) on `person p`: catchment, alive, age >= 35 on
 * 1 Oct, not diagnosed with the disease before 1 Oct (OPD diagnosis or
 * chronic clinic registration).
 */
const DMHT_TARGET_WHERE = `${PERSON_IN_CATCHMENT_WHERE}${AGE_MIN_WHERE}${NO_PRIOR_DIAGNOSIS_WHERE}${NO_PRIOR_CLINIC_MEMBER_WHERE}`;

/**
 * Valid screening result on `person_dmht_risk_screen_head h`.
 * DM: any blood glucose value (NCDSCREEN BSTEST 1–4: fasting / non-fasting
 * capillary, fasting plasma, post-prandial). HT: both SBP and DBP.
 */
const SCREEN_RESULT_WHERE: Record<DmHtCode, string> = {
  DM: "(h.last_fgc > 0 OR h.last_fgc_no_food_limit > 0 OR h.last_fpg > 0 OR h.ppg > 0)",
  HT: "h.last_bps > 0 AND h.last_bpd > 0",
};

/** People with a valid DM/HT screening in [:countFrom, :dataAsOf]. */
function screenedSubquery(code: DmHtCode): string {
  return `
  SELECT s.person_id, MIN(h.screen_date) AS first_screen_date
  FROM person_dmht_risk_screen_head h
  JOIN person_dmht_screen_summary s
    ON s.person_dmht_screen_summary_id = h.person_dmht_screen_summary_id
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
      clinicCode: SCREENING_CLINIC_CODE[code],
    }),
  });
}

export const DM_SQL: ScreeningSqlSet = dmHtSql("DM");
export const HT_SQL: ScreeningSqlSet = dmHtSql("HT");
