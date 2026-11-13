import "server-only";

import type { QueryParams } from "@/lib/db/his";
import type { PpBasicCode } from "@/lib/kpi/ppbasic-types";

import {
  buildPpBasicVillageSql,
  inFiscalYear as inFy,
  PPBASIC_CATCHMENT_THAI_WHERE as CATCHMENT_THAI,
  ppBasicBaseParams as baseParams,
  type PpBasicMoneySql,
  type PpBasicVillageSql,
} from "./ppbasic-common";
import { minusYears, sqlCodeList, type ScreeningSqlSpec } from "./screening-common";

/**
 * SQL for the child items (1-3) of "P&P Basic Services" (/pp/basic)
 * against HOSxP (hospital only, never HDC). Definitions, data sources and
 * FY2569/FY2570 verification (db-cli, 2026-11-13):
 * docs/kpi/pp-basic-child.md.
 *
 * Same pattern as the PPFS catchment items (./ppfs-hosxp): a
 * `ScreeningSqlSpec` (targetWhere on `person p` + one-row-per-person
 * screenedSubquery) turned into ONE per-village aggregate query. No
 * person-level query is generated: this page returns aggregates only.
 *
 * Population: PERSON_IN_CATCHMENT_WHERE + Thai (TYPEAREA 1/3, living, real
 * catchment village), like the PPFS catchment items. Target / done are
 * distinct persons (person_id).
 *
 * All SQL is static: code lists are source constants (validated by
 * sqlCodeList); only values are bound as named parameters:
 *   :periodStart  'YYYY-MM-DD'  1 Oct of the fiscal year
 *   :countFrom    'YYYY-MM-DD'  = :periodStart (services counted in FY)
 *   :dataAsOf     'YYYY-MM-DD'  inclusive end of the counted data: 30 Sep
 *                 for a closed year, today for the running year (loader
 *                 rule, ../ppbasic.ts). Also ends the "due" windows
 *                 (milestone / birthday in [:periodStart, :dataAsOf]), so
 *                 for the running year CHILD_DEV / EPI age cohorts hold
 *                 only the children already due (EPI ป.6 is a school-class
 *                 window, not bounded by :dataAsOf).
 * plus item-specific ones (see each spec's buildParams).
 *
 * Result columns of every query (builder: ./ppbasic-common):
 *   village_id, village_moo, village_name, eligible, numerator
 * EPI also has a one-row money query (EPI_MONEY: due_units, done_units,
 * catchment_done_units; vaccine doses, not persons).
 * (village_id 0 = unknown village; safety net only, the catchment filter
 * already requires a real village).
 */

/** "Reaches `n` <unit> of age in [:periodStart, :dataAsOf]". */
const reachesAge = (n: number, unit: "MONTH" | "YEAR", col = "p.birthdate") => {
  if (!Number.isInteger(n) || n < 0) throw new Error(`invalid age: ${n}`);
  return `DATE_ADD(${col}, INTERVAL ${n} ${unit}) BETWEEN :periodStart AND :dataAsOf`;
};

/**
 * Sargable pre-filter on the birth date: born in (:bornAfter, :dataAsOf]
 * (children born during the fiscal year are included).
 */
const BORN_WINDOW_WHERE = `
  AND p.birthdate >  :bornAfter
  AND p.birthdate <= :dataAsOf`;

// --- 1. CHILD_DEV: DSPM -----------------------------------------------------

/** DSPM key ages (months), MOPH / HDC "คัดกรองพัฒนาการ 9, 18, 30, 42, 60 เดือน". */
const DSPM_AGES_MONTHS = [9, 18, 30, 42, 60] as const;

/**
 * pp_special_type.pp_special_code of a DSPM screening (SPECIALPP): the
 * overall result 1B260 ปกติ / 1B261 สงสัยล่าช้า / 1B262 สงสัยล่าช้า (ส่งต่อ)
 * plus the per-domain codes 1B20x (GM), 1B21x (FM), 1B22x (RL), 1B23x (EL),
 * 1B24x (PS). TEDA4I (1B27x) is follow-up stimulation, not screening.
 */
const DSPM_PP_CODES = [
  "1B200", "1B201", "1B202",
  "1B210", "1B211", "1B212",
  "1B220", "1B221", "1B222",
  "1B230", "1B231", "1B232",
  "1B240", "1B241", "1B242",
  "1B260", "1B261", "1B262",
] as const;

/**
 * CHILD_DEV — ตรวจพัฒนาการ (DSPM), เด็ก 0-5 ปี.
 *  Target: catchment Thai children who reach 9, 18, 30, 42 or 60 months
 *    of age in [:periodStart, :dataAsOf] (HDC s_childdev_specialpp).
 *  Done:   a DSPM SPECIALPP code (DSPM_PP_CODES) on a visit in the fiscal
 *    year while the child's completed age in months is one of those key
 *    ages (TIMESTAMPDIFF(MONTH, birthdate, vstdate) IN (9,18,30,42,60)).
 *  A child with two key ages in one year (9 and 18 months) counts once.
 *  Tables: pp_special -> pp_special_type, ovst (vn, hn) -> person.
 *  FY2568: 245 target, 228 done (93.1%).
 *  FY2569: 207 target, 200 done (96.6%); any DSPM in the FY at any age
 *    would give 203, allowing one extra month (10, 19, ...) 202.
 *  FY2570 (data to 2026-11-13): full-year target 185, done 21;
 *    due so far (dataAsOf 2026-11-12) 25 target, 16 done.
 *  ~0.1 s (MariaDB turns the subquery into a LATERAL DERIVED driven by
 *  person -> ovst ix_hn_vstdate -> pp_special ix_vn).
 */
const CHILD_DEV_SPEC: ScreeningSqlSpec = {
  targetWhere: `${CATCHMENT_THAI}${BORN_WINDOW_WHERE}
  AND (${DSPM_AGES_MONTHS.map((m) => reachesAge(m, "MONTH")).join(`
    OR `)})`,
  screenedSubquery: `
  SELECT sp.person_id, MIN(o.vstdate) AS first_screen_date
  FROM pp_special ps
  JOIN pp_special_type pt
    ON pt.pp_special_type_id = ps.pp_special_type_id
  JOIN ovst o
    ON o.vn = ps.vn
  JOIN person sp
    ON sp.patient_hn = o.hn
  WHERE pt.pp_special_code IN (${sqlCodeList(DSPM_PP_CODES)})
    AND ${inFy("o.vstdate")}
    AND TIMESTAMPDIFF(MONTH, sp.birthdate, o.vstdate) IN (${DSPM_AGES_MONTHS.join(", ")})
  GROUP BY sp.person_id`,
  buildParams: (ctx) => ({
    ...baseParams(ctx),
    // 60 months + margin; the exact window is the reachesAge() list.
    bornAfter: minusYears(ctx.periodStart, 6),
  }),
};

// --- 2. CHILD_GROWTH: weight + height ---------------------------------------

/** Children 0-12 years on 1 Oct (born after periodStart − 13 years). */
const GROWTH_MAX_AGE = 12;

/**
 * CHILD_GROWTH — ชั่งน้ำหนักและวัดส่วนสูง, เด็ก 0-12 ปี.
 *  Target: catchment Thai children aged 0-12 on :periodStart, plus those
 *    born during the fiscal year (birthdate in (periodStart − 13y,
 *    :dataAsOf]).
 *  Done:   at least one record with body_weight > 0 AND height > 0 in the
 *    fiscal year in one of the three HOSxP sources of the 43-file
 *    NUTRITION (= what HDC counts):
 *      person_wbc_nutrition  (person_wbc.person_id, nutrition_date)  0-1 y
 *      person_epi_nutrition  (person_epi.person_id, nutrition_date)  1-5 y
 *      village_student_screen (village_student.person_id, screen_date) school
 *    Weight/height typed only in OPD screening (opdscreen bw/height) is
 *    NOT counted: it is not exported as NUTRITION (FY2569, age 0-12 on
 *    1 Oct only: 618/916 = 67% from the 3 tables, 801/916 = 87% if
 *    opdscreen were added).
 *  FY2568: 1,040 target, 815 done (78.4%).
 *  FY2569: 958 target, 660 done (68.9%); born in the FY: 42/42.
 *  FY2570 (data to 2026-11-13): 877 target, 44 done (school screening
 *    runs Dec–Feb and Jul).
 *  ~0.4 s (small tables, full scans).
 */
const CHILD_GROWTH_SPEC: ScreeningSqlSpec = {
  targetWhere: `${CATCHMENT_THAI}${BORN_WINDOW_WHERE}`,
  screenedSubquery: `
  SELECT g.person_id, MIN(g.measure_date) AS first_screen_date
  FROM (
    SELECT w.person_id, n.nutrition_date AS measure_date
    FROM person_wbc_nutrition n
    JOIN person_wbc w
      ON w.person_wbc_id = n.person_wbc_id
    WHERE ${inFy("n.nutrition_date")}
      AND n.body_weight > 0 AND n.height > 0
    UNION ALL
    SELECT e.person_id, n.nutrition_date
    FROM person_epi_nutrition n
    JOIN person_epi e
      ON e.person_epi_id = n.person_epi_id
    WHERE ${inFy("n.nutrition_date")}
      AND n.body_weight > 0 AND n.height > 0
    UNION ALL
    SELECT vs.person_id, s.screen_date
    FROM village_student_screen s
    JOIN village_student vs
      ON vs.village_student_id = s.village_student_id
    WHERE ${inFy("s.screen_date")}
      AND s.body_weight > 0 AND s.height > 0
  ) g
  GROUP BY g.person_id`,
  buildParams: (ctx) => ({
    countFrom: ctx.countFrom,
    dataAsOf: ctx.dataAsOf,
    bornAfter: minusYears(ctx.periodStart, GROWTH_MAX_AGE + 1),
  }),
};

// --- 3. EPI: basic vaccines by age cohort -----------------------------------

/**
 * person_vaccine.export_vaccine_code (43-file EPI VACCINETYPE) per dose;
 * a dose is satisfied by any code of its list (combined / older vaccines).
 */
const EPI_DOSE = {
  BCG: ["010"],
  HBV1: ["041"],
  DTP_HB3: ["D23", "093"], // DTP-HB-Hib3 / DTP-HB3
  OPV3: ["083"],
  IPV: ["I11", "I12"],
  MMR1: ["061", "076"], // MMR 9 months / MMRC
  JE1: ["J11", "051"], // LA-JE1 / JE (killed) 1
  DTP4: ["034"],
  OPV4: ["084"],
  MMR2: ["073"],
  JE2: ["J12", "052"], // LA-JE2 / JE (killed) 2
  DTP5: ["035"],
  OPV5: ["085"],
  DT_P6: ["024"], // dT ป.6
} as const;
type EpiDose = keyof typeof EPI_DOSE;

/**
 * Cohorts (HDC "ความครอบคลุมวัคซีน" age groups). A child belongs to the
 * cohort whose birthday falls in [:periodStart, :dataAsOf]; the 1/2/3/5
 * year windows never overlap. Required doses may have been given at any
 * time up to :dataAsOf.
 */
const EPI_AGE_COHORTS: readonly { years: number; doses: readonly EpiDose[] }[] = [
  { years: 1, doses: ["BCG", "HBV1", "DTP_HB3", "OPV3", "IPV", "MMR1"] },
  { years: 2, doses: ["JE1", "DTP4", "OPV4"] },
  { years: 3, doses: ["MMR2", "JE2"] },
  { years: 5, doses: ["DTP5", "OPV5"] },
];
/**
 * School classes = the class of the school year that ends in the fiscal
 * year (school year starts mid-May of periodStart's calendar year; ป.1
 * entry age cut-off 16 May). Y = calendar year of :periodStart:
 *   ป.6 born in (Y−12-05-16, Y−11-05-16]
 *   ป.5 born in (Y−11-05-16, Y−10-05-16]
 * Verified: 169 of the 175 children given dT ป.6 (024) in FY2569
 * (Feb–Mar 2026) were born in the ป.6 window (no catchment child born
 * before May 2013 or from Jun 2014 received it); 77 of the 80 HPV ป.5
 * doses (310) of FY2569 went to girls born in the ป.5 window.
 */
const P6_DOSES: readonly EpiDose[] = ["DT_P6"];
const SCHOOL_CUTOFF_MMDD = "-05-16";

const EPI_COHORT_CODES = [
  ...new Set(Object.values(EPI_DOSE).flatMap((c) => [...c])),
];

const P6_WHERE = (col: string) =>
  `(${col} > :p6BornAfter AND ${col} <= :p6BornOnOrBefore)`;
const P5_WHERE = (col: string) =>
  `(${col} > :p5BornAfter AND ${col} <= :p5BornOnOrBefore)`;

/** :p6BornAfter / :p6BornOnOrBefore, plus the ป.5 pair when `withP5`. */
function schoolClassParams(periodStart: string, withP5: boolean): QueryParams {
  const y = Number(periodStart.slice(0, 4));
  const p6 = {
    p6BornAfter: `${y - 12}${SCHOOL_CUTOFF_MMDD}`,
    p6BornOnOrBefore: `${y - 11}${SCHOOL_CUTOFF_MMDD}`,
  };
  return withP5
    ? {
        ...p6,
        p5BornAfter: `${y - 11}${SCHOOL_CUTOFF_MMDD}`,
        p5BornOnOrBefore: `${y - 10}${SCHOOL_CUTOFF_MMDD}`,
      }
    : p6;
}

/** One cohort branch: birth-date condition (on `col`) + required doses. */
interface EpiCohort {
  when: (col: string) => string;
  doses: readonly EpiDose[];
}
const EPI_COHORTS: readonly EpiCohort[] = [
  ...EPI_AGE_COHORTS.map((c) => ({
    when: (col: string) => reachesAge(c.years, "YEAR", col),
    doses: c.doses,
  })),
  { when: P6_WHERE, doses: P6_DOSES },
];

/** CASE over the cohorts of the birth date in `col` (no cohort -> 0). */
const byCohort = (col: string, expr: (doses: readonly EpiDose[]) => string) =>
  `CASE${EPI_COHORTS.map(
    (c) => `
      WHEN ${c.when(col)} THEN ${expr(c.doses)}`,
  ).join("")}
      ELSE 0 END`;

/** 1 when every dose of the list was received (any record, any date). */
const allDosesReceived = (doses: readonly EpiDose[]) =>
  `(${doses
    .map((d) => `COALESCE(MAX(vx.code IN (${sqlCodeList(EPI_DOSE[d])})), 0)`)
    .join(" + ")}) = ${doses.length}`;

/**
 * EPI — วัคซีนพื้นฐาน, แรกเกิด – ป.6 (coverage, persons).
 *  Target: catchment Thai children in one of the cohorts of the fiscal
 *    year: turning 1, 2, 3 or 5 years in [:periodStart, :dataAsOf], or the
 *    ป.6 class (P6_WHERE). Each child is in at most one cohort.
 *  Done:   received ALL doses required for the cohort (EPI_AGE_COHORTS /
 *    P6_DOSES) at any date up to :dataAsOf, from
 *      ovst_vaccine (via ovst.vn -> hn; also holds the WBC / EPI clinic /
 *        school vaccines, which HOSxP mirrors into it) and
 *      person_vaccine_elsewhere (doses given elsewhere, typed in by staff)
 *    joined to person_vaccine.export_vaccine_code.
 *  Money (20 baht per dose) is NOT based on these cohorts: see EPI_MONEY.
 *  FY2568: 298 target, 171 done (57.4%): 1 y 38/43, 2 y 39/46, 3 y 25/45,
 *    5 y 69/78, ป.6 0/86 (dT ป.6 was not recorded in HOSxP in FY2568).
 *  FY2569: 287 target, 234 done (81.5%): 1 y 29/29, 2 y 38/43, 3 y 39/46,
 *    5 y 40/49, ป.6 88/120.
 *  FY2570 (data to 2026-11-13): full-year target 263, done 102 (doses
 *    already given before the birthday count); due so far (dataAsOf
 *    2026-11-12) 130 target (104 of them ป.6, vaccinated Feb–Mar), 24 done.
 *  Speed: the hospital branch is driven ovst_vaccine -> person_vaccine
 *  (the code filter keeps ~7.5k of ~209k rows), then ovst by vn and person
 *  by patient_hn (STRAIGHT_JOIN). ovst_vaccine has no vaccine / date
 *  index; the optimizer's own order (all ovst_vaccine rows -> ovst) took
 *  ~3 s.
 */
const EPI_SPEC: ScreeningSqlSpec = {
  targetWhere: `${CATCHMENT_THAI}${BORN_WINDOW_WHERE}
  AND (${EPI_COHORTS.map((c) => c.when("p.birthdate")).join(`
    OR `)})`,
  // One row per child with any cohort dose (complete or not).
  screenedSubquery: `
  SELECT vx.person_id,
    ${byCohort("vx.birthdate", allDosesReceived)} AS complete
  FROM (
    SELECT STRAIGHT_JOIN sp.person_id, sp.birthdate, pv.export_vaccine_code AS code
    FROM ovst_vaccine ov
    JOIN person_vaccine pv
      ON pv.person_vaccine_id = ov.person_vaccine_id
    JOIN ovst o
      ON o.vn = ov.vn
    JOIN person sp
      ON sp.patient_hn = o.hn
    WHERE pv.export_vaccine_code IN (${sqlCodeList(EPI_COHORT_CODES)})
      AND o.vstdate < DATE_ADD(:dataAsOf, INTERVAL 1 DAY)
      AND sp.birthdate >  :bornAfter
      AND sp.birthdate <= :dataAsOf
    UNION ALL
    SELECT sp.person_id, sp.birthdate, pv.export_vaccine_code
    FROM person_vaccine_elsewhere e
    JOIN person sp
      ON sp.person_id = e.person_id
    JOIN person_vaccine pv
      ON pv.person_vaccine_id = e.person_vaccine_id
    WHERE sp.birthdate >  :bornAfter
      AND sp.birthdate <= :dataAsOf
      AND (e.vaccine_date IS NULL
           OR e.vaccine_date < DATE_ADD(:dataAsOf, INTERVAL 1 DAY))
      AND pv.export_vaccine_code IN (${sqlCodeList(EPI_COHORT_CODES)})
  ) vx
  GROUP BY vx.person_id, vx.birthdate`,
  buildParams: (ctx) => ({
    periodStart: ctx.periodStart,
    dataAsOf: ctx.dataAsOf,
    // Oldest cohort is ป.6 (born after Y−12-05-16 > periodStart − 13 y).
    bornAfter: minusYears(ctx.periodStart, 13),
    ...schoolClassParams(ctx.periodStart, false),
  }),
};

// --- 3b. EPI money: every EPI dose given to UC children ---------------------

/**
 * EPI vaccines of the NHSO announcement table 1 (= the national EPI
 * programme) as person_vaccine.export_vaccine_code: NHSO PPFS item 25
 * pays 20 baht per dose of these. All codes that exist in this HOSxP
 * (person_vaccine, db-cli 2026-11-13). Not EPI, so excluded: rabies
 * (111–117), influenza (815), adult / ANC dT (106), aP (P41), COVID-19
 * (C19).
 */
const EPI_FEE_CODES = [
  "010", "011", // BCG, BCG school
  "041", "042", "043", // HBV1-3
  "D21", "D22", "D23", // DTP-HB-Hib1-3
  "091", "092", "093", // DTP-HB1-3 (older combined vaccine)
  "031", "032", "033", "034", "035", // DTP1-5
  "081", "082", "083", "084", "085", // OPV1-5
  "086", "087", "088", "089", // OPV school 1-3, OPV campaign
  "I11", "I12", "I13", "I14", "I15", // IPV1-5
  "R11", "R12", // Rota, 2-dose vaccine
  "R21", "R22", "R23", // Rota, 3-dose vaccine
  "061", "076", // MMR 9 months (MEAS code) / MMRC
  "072", "073", "074", // MMR ป.1, MMR2 2.5 y, MR campaign
  "J11", "J12", // LA-JE1-2
  "051", "052", "053", // JE (killed) 1-3
  "024", // dT ป.6
  "310", "311", "320", // HPV ป.5 dose 1 / additional / dose 2
] as const;

/** Child / school-age scope: age at the visit ≤ 14 completed years. */
const EPI_FEE_MAX_AGE = 14;

/**
 * Birth doses (BCG, HBV1): given by the hospital where the child is born,
 * so they are not "due" here for catchment newborns (most catchment babies
 * are born elsewhere: FY2569 42 newborns, 17 birth doses given here).
 * Birth doses given here still count as money (own target, no gap).
 */
const EPI_BIRTH_CODES = ["010", "041"] as const;

/**
 * National EPI schedule as given at this hospital (checked against the
 * ages at vaccination in FY2569): doses due when the child reaches each
 * age (months), after the birth doses. 2 and 4: DTP-HB-Hib + IPV + Rota;
 * 6: DTP-HB-Hib3 + OPV3 + Rota3 (3-dose Rota, ~80% of the Rota given
 * here); 9: MMR1; 12: LA-JE1; 18: DTP4 + OPV4; 30: MMR2 + LA-JE2; 48:
 * DTP5 + OPV5. School: HPV ป.5 girls (1), dT ป.6 (1). Catch-up doses
 * (MMR / OPV ป.1, HBV2/3, campaigns) have no slot, so they are never due.
 */
const EPI_SCHEDULE: readonly { months: number; doses: number }[] = [
  { months: 2, doses: 3 },
  { months: 4, doses: 3 },
  { months: 6, doses: 3 },
  { months: 9, doses: 1 },
  { months: 12, doses: 1 },
  { months: 18, doses: 2 },
  { months: 30, doses: 2 },
  { months: 48, doses: 2 },
];

/** Doses due in [:periodStart, :dataAsOf] for the person p (0/1 flags × doses). */
const EPI_DUE_DOSES = `(${EPI_SCHEDULE.map(
  (s) => `
      (${reachesAge(s.months, "MONTH")}) * ${s.doses}`,
).join(" +")} +
      (p.sex = '2' AND ${P5_WHERE("p.birthdate")}) +
      ${P6_WHERE("p.birthdate")})`;

/** 1 when the visit's hn is a catchment Thai person (current registration). */
const VISIT_IN_CATCHMENT = `EXISTS (
      SELECT 1
      FROM person p
      WHERE p.patient_hn = o.hn
        AND ${CATCHMENT_THAI}
    )`;

/**
 * EPI money units (doses; NHSO PPFS item 25 = 20 baht per dose given).
 *  done_units: every dose of EPI_FEE_CODES given BY THIS HOSPITAL
 *    (ovst_vaccine, incl. the mirrored WBC / EPI / school vaccines) in
 *    [:countFrom, :dataAsOf] to a child aged ≤ EPI_FEE_MAX_AGE at the
 *    visit whose visit right is UC (ovst.pttype -> pttype.hipdata_code
 *    'UCS'), ALL areas (service population, like PPFS ANC); one dose
 *    per (vn, vaccine code), duplicate rows of a visit are dropped.
 *  catchment_done_units: the part of done_units whose hn is a catchment
 *    Thai person (VISIT_IN_CATCHMENT); out of area = done − catchment.
 *  catchment_birth_units: the birth doses (EPI_BIRTH_CODES) within
 *    catchment_done_units.
 *  due_units: doses due in [:periodStart, :dataAsOf] by EPI_SCHEDULE for
 *    the catchment Thai children whose registered right is UC or not set
 *    (person.pttype; infants usually have no right recorded yet). ป.5 /
 *    ป.6 are school-class windows, due for the whole year (Feb–Mar).
 *  Loader (../ppbasic.ts, toDoseUnits): scheduled catchment done =
 *    catchment_done − catchment_birth; gap = max(0, due − scheduled
 *    catchment done) (catchment compared with catchment, same schedule);
 *    target = done + gap. Out-of-area and birth doses have no schedule
 *    here, so they are their own target.
 *  Figures: docs/kpi/pp-basic-services.md § มูลค่า.
 *  ~0.4 s (ovst_vaccine -> person_vaccine first, see EPI_SPEC).
 */
const EPI_MONEY: PpBasicMoneySql = {
  sql: `
SELECT d.due_units, g.done_units, g.catchment_done_units, g.catchment_birth_units
FROM (
  SELECT COALESCE(SUM(${EPI_DUE_DOSES}), 0) AS due_units
  FROM person p
  LEFT JOIN pttype rt
    ON rt.pttype = p.pttype
  WHERE ${CATCHMENT_THAI}${BORN_WINDOW_WHERE}
    AND COALESCE(NULLIF(rt.hipdata_code, ''), 'UCS') = 'UCS'
) d
CROSS JOIN (
  SELECT
    COUNT(*) AS done_units,
    COALESCE(SUM(${VISIT_IN_CATCHMENT}), 0) AS catchment_done_units,
    COALESCE(SUM(o.code IN (${sqlCodeList(EPI_BIRTH_CODES)})
      AND ${VISIT_IN_CATCHMENT}), 0) AS catchment_birth_units
  FROM (
    -- One dose per (visit, vaccine): the same dose is often recorded twice
    -- on one visit (once directly, once from the vaccine plan; FY2568 44,
    -- FY2569 6 extra rows).
    SELECT STRAIGHT_JOIN DISTINCT ov.vn, o.hn, pv.export_vaccine_code AS code
    FROM ovst_vaccine ov
    JOIN person_vaccine pv
      ON pv.person_vaccine_id = ov.person_vaccine_id
    JOIN ovst o
      ON o.vn = ov.vn
    JOIN pttype vt
      ON vt.pttype = o.pttype
    JOIN patient pt
      ON pt.hn = o.hn
    WHERE pv.export_vaccine_code IN (${sqlCodeList(EPI_FEE_CODES)})
      AND vt.hipdata_code = 'UCS'
      AND ${inFy("o.vstdate")}
      AND pt.birthday > DATE_SUB(o.vstdate, INTERVAL ${EPI_FEE_MAX_AGE + 1} YEAR)
  ) o
) g
`,
  buildParams: (ctx) => ({
    periodStart: ctx.periodStart,
    countFrom: ctx.countFrom,
    dataAsOf: ctx.dataAsOf,
    // Oldest due child is ป.6 (born after Y−12-05-16 > periodStart − 13 y).
    bornAfter: minusYears(ctx.periodStart, 13),
    ...schoolClassParams(ctx.periodStart, true),
  }),
};

// --- exports ----------------------------------------------------------------

export type PpBasicChildCode = Extract<PpBasicCode, "CHILD_DEV" | "CHILD_GROWTH" | "EPI">;

export const PPBASIC_CHILD_DEV_SQL = buildPpBasicVillageSql(CHILD_DEV_SPEC);
export const PPBASIC_CHILD_GROWTH_SQL = buildPpBasicVillageSql(CHILD_GROWTH_SPEC);
export const PPBASIC_EPI_SQL = buildPpBasicVillageSql(EPI_SPEC, {
  numerator: "COUNT(DISTINCT CASE WHEN sc.complete = 1 THEN sc.person_id END)",
  money: EPI_MONEY,
});

export const PPBASIC_CHILD_SQL: Record<PpBasicChildCode, PpBasicVillageSql> = {
  CHILD_DEV: PPBASIC_CHILD_DEV_SQL,
  CHILD_GROWTH: PPBASIC_CHILD_GROWTH_SQL,
  EPI: PPBASIC_EPI_SQL,
};
