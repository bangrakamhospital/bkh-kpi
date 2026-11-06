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
 * Screening services are read from the SPECIALPP records of HOSxP
 * (`pp_special` + `pp_special_type.pp_special_code`, linked to the visit
 * via `ovst`), i.e. the same source HOSxP exports as the 43-file SPECIALPP
 * that HDC uses. Tables, columns and codes were verified with db-cli
 * against the production database — see docs/kpi/03-screening-cervical.md
 * and 04-screening-breast.md:
 *  - pp_special(vn [indexed], pp_special_type_id)
 *  - pp_special_type(pp_special_type_id PK, pp_special_code, name)
 *  - ovst(vn unique, hn, vstdate); person.patient_hn = ovst.hn
 *  - HPV DNA / Pap lab orders without a SPECIALPP record are NOT counted
 *    (HDC does not see them either); see docs for the size of that gap.
 */

/**
 * SPECIALPP codes counted as cervical cancer screening (any method, any
 * result), as defined in this site's pp_special_type:
 *  1B0040–1B0043, 1B0045 VIA; 1B0044 Pap (result pending);
 *  1B0046 HPV genotype testing; 1B0048 other method; 1B0049 unspecified;
 *  1B30 / 1B40 Pap result normal / abnormal (site-specific codes, Z014).
 * 1B0047 is not defined at this site (kept for forward compatibility).
 * The retired group code 1B004 is not counted.
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
  "1B30",
  "1B40",
] as const;

/**
 * SPECIALPP codes counted as clinical breast examination by health
 * personnel (CBE, Z123), any result: 1B0030–1B0037 = CBE normal/abnormal
 * combined with the client's self-exam history, 1B0039 = unspecified.
 * There is no separate BSE-only SPECIALPP code, so BSE is not counted by
 * code. The retired group code 1B003 is not counted. 1B0038 is not
 * defined at this site (kept for forward compatibility).
 *
 * CAVEAT (see docs/kpi/04-screening-breast.md): at this site almost all
 * 1B0030 records are generated from the women's breast-exam form where
 * the exam type is "ตรวจด้วยตนเอง"; HDC still counts them as CBE.
 */
export const BREAST_CBE_PP_CODES = [
  "1B0030",
  "1B0031",
  "1B0032",
  "1B0033",
  "1B0034",
  "1B0035",
  "1B0036",
  "1B0037",
  "1B0038",
  "1B0039",
] as const;

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
