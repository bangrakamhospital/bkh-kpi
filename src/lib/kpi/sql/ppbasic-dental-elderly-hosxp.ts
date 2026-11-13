import "server-only";

import type { PpBasicCode } from "@/lib/kpi/ppbasic-types";

import {
  buildPpBasicVillageSql,
  inFiscalYear as IN_FY,
  PPBASIC_CATCHMENT_THAI_WHERE as CATCHMENT_THAI,
  ppBasicBaseParams as baseParams,
  type PpBasicVillageSql,
} from "./ppbasic-common";
import {
  AGE_MAX_WHERE,
  AGE_MIN_WHERE,
  ageParams,
  sqlCodeList,
  type ScreeningSqlSpec,
} from "./screening-common";

/**
 * SQL for the "P&P Basic Services" page (/pp/basic), items 4–6
 * (FLUORIDE, SEALANT, ELDERLY_DEPRESSION) against HOSxP (--conn 1 only).
 * Definitions and FY2569 / FY2570 verification:
 * docs/kpi/pp-basic-dental-elderly.md. All codes verified with db-cli
 * (2026-11-13).
 *
 * Same pattern as the PPFS catchment items (./ppfs-hosxp): a
 * `ScreeningSqlSpec` (targetWhere on `person p` + screenedSubquery with
 * one row per person_id) turned into ONE per-village aggregate query; the
 * headline is the sum of the villages. Aggregates only, no person rows.
 *
 * Target population = PERSON_IN_CATCHMENT_WHERE + Thai (TYPEAREA 1/3,
 * living, real village), age in full years on :periodStart (1 Oct).
 * Done = at least one qualifying service in [:countFrom, :dataAsOf]
 * (persons, not visits).
 *
 * All SQL is static; code lists are source constants (sqlCodeList).
 * Named parameters (exactly these, see buildParams):
 *   :periodStart      'YYYY-MM-DD'  1 Oct of the fiscal year (age reference)
 *   :countFrom        'YYYY-MM-DD'  = :periodStart (services counted in FY)
 *   :dataAsOf         'YYYY-MM-DD'  30 Sep of the FY, or today if open (inclusive)
 *   :birthOnOrBefore  'YYYY-MM-DD'  periodStart − min age
 *   :birthAfter       'YYYY-MM-DD'  periodStart − (max age + 1); not used by
 *                                   ELDERLY_DEPRESSION (no upper bound)
 *
 * Result rows: { village_id, village_moo, village_name, eligible, numerator }
 * (builder and shared fragments: ./ppbasic-common).
 */

// --- codes (verified with db-cli) -------------------------------------------

/**
 * Dental procedures are recorded in dtmain (one row per procedure, hn +
 * vstdate, indexes ix_vstdate / ix_hn / ix_tmcode). dtmain.tmcode ->
 * dttm.code; dttm.icd10tm_operation_code is the ICD-10-TM procedure code
 * exported to the 43-file PROCEDURE_OPD. Matching on the ICD-10-TM code
 * (not on tmcode) keeps new local items with the same code included.
 *
 * Topical fluoride (whole mouth):
 *   2377020 primary dentition  — tmcode 000168 "เคลือบฟลูออไรด์วาร์นิช
 *           61101-เด็ก" (~all usage), 000024 "เคลือบฟลูออไรด์ทั้งปาก-เด็ก"
 *   2387020 permanent dentition — 000272 / 000273 (-ผู้ใหญ่), 000338
 *           (กลุ่มเสี่ยง 25-59 ปี); rare in children but valid
 */
const FLUORIDE_OP_CODES = ["2377020", "2387020"] as const;

/**
 * Pit and fissure sealant, permanent teeth: ICD-10-TM 2387030 (tmcode
 * 000101 "เคลือบหลุมร่องฟันแท้ (Sealant)") and the per-tooth variants
 * 238703A–238703H (tmcode 000293–000301, teeth 16/17/26/27/36/37/46/47).
 * Prefix match '238703%' on the 7-char code. Not counted: PRR 2387040
 * (resin restoration, not a sealant) and primary-teeth sealant 2377030
 * (9 rows since FY2565).
 */
const SEALANT_OP_PREFIX_WHERE = "t.icd10tm_operation_code LIKE '238703%'";

/**
 * Depression screening (pp_special_type.pp_special_code, SPECIALPP):
 *   1B0280 / 1B0281  2Q ผู้สูงอายุ ปกติ / ผิดปกติ (the HDC indicator codes)
 *   1B0282–1B0285    9Q ผู้สูงอายุ (9Q follows a positive 2Q)
 *   1B0210–1B0212    2Q ประชาชนทั่วไป / 2Q plus (also valid for 60+)
 * Not counted: 1B0286/1B0287 (ST5 stress), 1B0289 (unspecified incl. stress),
 * 1B026x / 1B027x (9Q / 8Q of patients, not population screening).
 */
const DEPRESSION_PP_CODES = [
  "1B0280",
  "1B0281",
  "1B0282",
  "1B0283",
  "1B0284",
  "1B0285",
  "1B0210",
  "1B0211",
  "1B0212",
] as const;

/**
 * depression_screen (HOSxP 2Q/9Q/8Q form, one row per screening, joined to
 * the visit by vn) has no index on screen_datetime, and a full scan
 * (362k rows) is far cheaper than an ovst date range join (0.3 s vs
 * 4.5 s). screen_datetime is therefore only a pre-filter, widened by this
 * many days on each side; the visit date (ovst.vstdate) decides the FY.
 * (screen date <> visit date in 0.3 % of rows.)
 */
const DEPRESSION_SCREEN_SLACK_DAYS = 7;

// --- fragments ---------------------------------------------------------------

/** Persons with a dtmain procedure whose dttm matches `dttmWhere` in the FY. */
function dentalScreened(dttmWhere: string): string {
  return `
  SELECT sp.person_id, MIN(d.vstdate) AS first_screen_date
  FROM dtmain d
  JOIN person sp
    ON sp.patient_hn = d.hn
  WHERE ${IN_FY("d.vstdate")}
    AND d.tmcode IN (SELECT t.code FROM dttm t WHERE ${dttmWhere})
  GROUP BY sp.person_id`;
}

/** SPECIALPP 2Q/9Q in the FY + depression_screen form in the FY. */
const DEPRESSION_SCREENED = `
  SELECT u.person_id, MIN(u.screen_date) AS first_screen_date
  FROM (
    SELECT sp.person_id, o.vstdate AS screen_date
    FROM pp_special ps
    JOIN pp_special_type pt
      ON pt.pp_special_type_id = ps.pp_special_type_id
    JOIN ovst o
      ON o.vn = ps.vn
    JOIN person sp
      ON sp.patient_hn = o.hn
    WHERE pt.pp_special_code IN (${sqlCodeList(DEPRESSION_PP_CODES)})
      AND ${IN_FY("o.vstdate")}
    UNION ALL
    SELECT sp.person_id, o.vstdate AS screen_date
    FROM depression_screen ds
    JOIN ovst o
      ON o.vn = ds.vn
    JOIN person sp
      ON sp.patient_hn = o.hn
    WHERE ds.screen_datetime >= DATE_SUB(:countFrom, INTERVAL ${DEPRESSION_SCREEN_SLACK_DAYS} DAY)
      AND ds.screen_datetime <  DATE_ADD(:dataAsOf, INTERVAL ${DEPRESSION_SCREEN_SLACK_DAYS + 1} DAY)
      AND ${IN_FY("o.vstdate")}
  ) u
  GROUP BY u.person_id`;

// --- items -----------------------------------------------------------------------

/**
 * 4. FLUORIDE — เด็กวัยเรียน 4–12 ปี ได้รับการเคลือบ/ทาฟลูออไรด์
 * Target: Thai catchment children aged 4–12 on 1 Oct (all children; HOSxP
 * has no caries-risk flag, so the NHSO "high-risk" restriction is not
 * applied). Done: >= 1 dtmain procedure with ICD-10-TM 2377020 / 2387020
 * in the FY (any place: clinic or school outreach, as long as it was
 * keyed into HOSxP).
 * Verified (db-cli): FY2569 552 / 754 = 73.2 %; FY2570 (to 2026-11-13)
 * 15 / 717 = 2.1 % (school rounds are mostly Dec–Jan and Jun–Sep).
 * Most fluoride rows are TYPEAREA 4 school children (FY2569: 2,012 of
 * 3,362 persons aged 4–12 on 1 Oct), outside this target by design.
 * Timing: 0.3–0.6 s (person ~ref, dtmain ix_vstdate range).
 */
const FLUORIDE_SPEC: ScreeningSqlSpec = {
  targetWhere: `${CATCHMENT_THAI}${AGE_MIN_WHERE}${AGE_MAX_WHERE}`,
  screenedSubquery: dentalScreened(
    `t.icd10tm_operation_code IN (${sqlCodeList(FLUORIDE_OP_CODES)})`,
  ),
  buildParams: (ctx) => ({
    ...baseParams(ctx),
    ...ageParams(ctx.periodStart, 4, 12),
  }),
};

/**
 * 5. SEALANT — เด็กวัยเรียน 6–12 ปี ได้รับการเคลือบหลุมร่องฟัน
 * Target: Thai catchment children aged 6–12 on 1 Oct. Children sealed in
 * earlier years are NOT removed from the target (no tooth-level history
 * check). Done: >= 1 permanent-tooth sealant (ICD-10-TM 238703*) in the
 * FY; several teeth on one or more days count as one person.
 * Verified (db-cli): FY2569 216 / 626 = 34.5 % (with PRR 219; ever sealed
 * by the end of FY2569 385 / 626 = 61.5 %); FY2570 (to 2026-11-13)
 * 27 / 623 = 4.3 %.
 * Timing: 0.3–0.9 s.
 */
const SEALANT_SPEC: ScreeningSqlSpec = {
  targetWhere: `${CATCHMENT_THAI}${AGE_MIN_WHERE}${AGE_MAX_WHERE}`,
  screenedSubquery: dentalScreened(SEALANT_OP_PREFIX_WHERE),
  buildParams: (ctx) => ({
    ...baseParams(ctx),
    ...ageParams(ctx.periodStart, 6, 12),
  }),
};

/**
 * 6. ELDERLY_DEPRESSION — ผู้สูงอายุ 60 ปีขึ้นไป ได้รับการคัดกรองโรคซึมเศร้า
 * Target: Thai catchment persons aged >= 60 on 1 Oct. Done: >= 1 depression
 * screening in the FY, either SPECIALPP (DEPRESSION_PP_CODES) or a HOSxP
 * depression_screen form (2Q, with or without 9Q/8Q) on a visit in the FY.
 * Verified (db-cli): FY2569 2,402 / 3,290 = 73.0 % (SPECIALPP 1B0280/1B0281
 * only = the HDC rule: 2,036 = 61.9 %; form only adds 366); FY2570 (to
 * 2026-11-13) 243 / 3,490 = 7.0 % (form only — the SPECIALPP elderly
 * campaign was Feb–Mar in FY2569; 0 SPECIALPP so far in FY2570).
 * Timing: 2–3 s, dominated by the pp_special full scan (682k rows, no
 * index on pp_special_type_id; driving from ovst by date was slower,
 * 3.1 s). Cache the result per FY.
 */
const ELDERLY_DEPRESSION_SPEC: ScreeningSqlSpec = {
  targetWhere: `${CATCHMENT_THAI}${AGE_MIN_WHERE}`,
  screenedSubquery: DEPRESSION_SCREENED,
  buildParams: (ctx) => ({
    ...baseParams(ctx),
    ...ageParams(ctx.periodStart, 60, null),
  }),
};

type DentalElderlyCode = Extract<
  PpBasicCode,
  "FLUORIDE" | "SEALANT" | "ELDERLY_DEPRESSION"
>;

export const PPBASIC_DENTAL_ELDERLY_SQL: Record<DentalElderlyCode, PpBasicVillageSql> = {
  FLUORIDE: buildPpBasicVillageSql(FLUORIDE_SPEC),
  SEALANT: buildPpBasicVillageSql(SEALANT_SPEC),
  ELDERLY_DEPRESSION: buildPpBasicVillageSql(ELDERLY_DEPRESSION_SPEC),
};
