import "server-only";

import { SCREENING_INDICATORS } from "@/lib/kpi/screening-indicators";
import {
  AGE_MAX_WHERE,
  AGE_MIN_WHERE,
  ageParams,
  buildScreeningSql,
  NO_PRIOR_DIAGNOSIS_WHERE,
  PERSON_FEMALE_WHERE,
  PERSON_IN_CATCHMENT_WHERE,
  PERSON_THAI_WHERE,
  sqlCodeList,
  type ScreeningSqlContext,
  type ScreeningSqlSet,
} from "./screening-common";

/**
 * SQL for KPI 3 (CX, cervical cancer screening) and KPI 4 (BR, clinical
 * breast examination) against HOSxP (MySQL/MariaDB).
 *
 * !!! UNVERIFIED !!!
 * Screening services are read from the SPECIALPP records of HOSxP
 * (`pp_special` + `pp_special_type.pp_special_code`, linked to the visit
 * via `ovst`), i.e. the same source HOSxP exports as the 43-file SPECIALPP
 * that HDC uses. Every table, column and code below is an assumption that
 * has NOT been checked against the real database (db-cli not available).
 * See docs/kpi/03-screening-cervical.md and 04-screening-breast.md.
 *
 * VERIFY:
 *  - pp_special(vn, pp_special_type_id)
 *  - pp_special_type(pp_special_type_id, pp_special_code)
 *  - ovst(vn, hn, vstdate); person.patient_hn = ovst.hn
 *  - the code lists below (list pp_special_type rows with code '1B00%')
 *  - whether the site records Pap / VIA / HPV in another place instead
 *    (person_women_service, lab results, HPV self-sampling projects)
 */

/**
 * SPECIALPP codes counted as cervical cancer screening (any method:
 * HPV DNA, Pap smear, VIA; any result). VERIFY — assumed 1B0040–1B0049.
 */
export const CERVICAL_SCREENING_PP_CODES = [
  "1B0040",
  "1B0041",
  "1B0042",
  "1B0043",
  "1B0044",
  "1B0045",
  "1B0046",
  "1B0047",
  "1B0048",
  "1B0049",
] as const;

/**
 * SPECIALPP codes counted as clinical breast examination by health
 * personnel (CBE, any result). Self-examination (BSE, Service Plan 2.1)
 * must NOT be in this list. VERIFY — assumed 1B0030–1B0031.
 */
export const BREAST_CBE_PP_CODES = ["1B0030", "1B0031"] as const;

/** Known breast cancer (excluded from BR target): ICD-10 C50 incl. subcodes. */
export const BREAST_CANCER_ICD_RANGE = {
  icdFrom: "C50",
  icdToExclusive: "C51",
} as const;

/**
 * People with at least one SPECIALPP service from `codes` in
 * [:countFrom, :dataAsOf], with the date of the first one.
 */
function ppSpecialScreenedSubquery(codes: readonly string[]): string {
  return `
  SELECT sp.person_id, MIN(o.vstdate) AS first_screen_date
  FROM pp_special ps
  JOIN pp_special_type pt
    ON pt.pp_special_type_id = ps.pp_special_type_id
  JOIN ovst o
    ON o.vn = ps.vn
  JOIN person sp
    ON sp.patient_hn = o.hn
  WHERE pt.pp_special_code IN (${sqlCodeList(codes)})
    AND o.vstdate >= :countFrom
    AND o.vstdate <  DATE_ADD(:dataAsOf, INTERVAL 1 DAY)
  GROUP BY sp.person_id`;
}

function commonParams(ctx: ScreeningSqlContext, code: "CX" | "BR") {
  const meta = SCREENING_INDICATORS[code];
  return {
    periodStart: ctx.periodStart,
    countFrom: ctx.countFrom,
    dataAsOf: ctx.dataAsOf,
    ...ageParams(ctx.periodStart, meta.minAge, meta.maxAge),
  };
}

/**
 * CX target group (eligible): Thai women aged 30–60 on 1 Oct of the fiscal
 * year, catchment, alive. No disease exclusion (the official B is 70% of
 * the registered population, see docs). B = round(0.7 × eligible) is
 * applied in code. A = eligible women screened since the phase start
 * (:countFrom = 1 Oct of the phase's first fiscal year).
 */
export const CX_SQL: ScreeningSqlSet = buildScreeningSql({
  targetWhere: `${PERSON_IN_CATCHMENT_WHERE}${PERSON_FEMALE_WHERE}${PERSON_THAI_WHERE}${AGE_MIN_WHERE}${AGE_MAX_WHERE}`,
  screenedSubquery: ppSpecialScreenedSubquery(CERVICAL_SCREENING_PP_CODES),
  buildParams: (ctx) => commonParams(ctx, "CX"),
});

/**
 * BR target group (= B): women aged 40–70 on 1 Oct of the fiscal year,
 * catchment, alive, without a breast cancer (C50) diagnosis before 1 Oct.
 * A = those with a CBE in the fiscal year (:countFrom = :periodStart).
 */
export const BR_SQL: ScreeningSqlSet = buildScreeningSql({
  targetWhere: `${PERSON_IN_CATCHMENT_WHERE}${PERSON_FEMALE_WHERE}${AGE_MIN_WHERE}${AGE_MAX_WHERE}${NO_PRIOR_DIAGNOSIS_WHERE}`,
  screenedSubquery: ppSpecialScreenedSubquery(BREAST_CBE_PP_CODES),
  buildParams: (ctx) => ({
    ...commonParams(ctx, "BR"),
    ...BREAST_CANCER_ICD_RANGE,
  }),
});
