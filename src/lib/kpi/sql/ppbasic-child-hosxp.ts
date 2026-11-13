import "server-only";

import type { PpBasicCode } from "@/lib/kpi/ppbasic-types";

import {
  buildPpBasicVillageSql,
  inFiscalYear as inFy,
  PPBASIC_CATCHMENT_THAI_WHERE as CATCHMENT_THAI,
  ppBasicBaseParams as baseParams,
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
 * ป.6 cohort = the class of the school year that ends in the fiscal year
 * (school year starts mid-May of periodStart's calendar year; ป.1 entry
 * age cut-off 16 May): born in (Y−12-05-16, Y−11-05-16], Y = calendar
 * year of :periodStart. Verified: 169 of the 175 children given dT ป.6
 * (024) in FY2569 (Feb–Mar 2026) were born in this window; no catchment
 * child born before May 2013 or from Jun 2014 received it.
 */
const P6_DOSES: readonly EpiDose[] = ["DT_P6"];
const P6_CUTOFF_MMDD = "-05-16";

const EPI_ALL_CODES = [
  ...new Set(Object.values(EPI_DOSE).flatMap((c) => [...c])),
];

const P6_WHERE = (col: string) =>
  `(${col} > :p6BornAfter AND ${col} <= :p6BornOnOrBefore)`;

const dosesAll = (doses: readonly EpiDose[]) =>
  doses.map((d) => `MAX(vx.code IN (${sqlCodeList(EPI_DOSE[d])}))`).join(" AND ");

/**
 * EPI — วัคซีนพื้นฐาน, แรกเกิด – ป.6.
 *  Target: catchment Thai children in one of the cohorts of the fiscal
 *    year: turning 1, 2, 3 or 5 years in [:periodStart, :dataAsOf], or the
 *    ป.6 class (P6_WHERE). Each child is in at most one cohort.
 *  Done:   received ALL doses required for the cohort (EPI_AGE_COHORTS /
 *    P6_DOSES) at any date up to :dataAsOf, from
 *      ovst_vaccine (via ovst.vn -> hn; also holds the WBC / EPI clinic /
 *        school vaccines, which HOSxP mirrors into it) and
 *      person_vaccine_elsewhere (doses given elsewhere, typed in by staff)
 *    joined to person_vaccine.export_vaccine_code.
 *  FY2568: 298 target, 171 done (57.4%): 1 y 38/43, 2 y 39/46, 3 y 25/45,
 *    5 y 69/78, ป.6 0/86 (dT ป.6 was not recorded in HOSxP in FY2568).
 *  FY2569: 287 target, 234 done (81.5%): 1 y 29/29, 2 y 38/43, 3 y 39/46,
 *    5 y 40/49, ป.6 88/120.
 *  FY2570 (data to 2026-11-13): full-year target 263, done 102 (doses
 *    already given before the birthday count); due so far (dataAsOf
 *    2026-11-12) 130 target (104 of them ป.6, vaccinated Feb–Mar), 24 done.
 *  ~3 s: ovst_vaccine (199k rows, mostly adult rabies / dT / influenza)
 *  has no vaccine or date index and is fully scanned, then ovst by vn.
 */
const EPI_SPEC: ScreeningSqlSpec = {
  targetWhere: `${CATCHMENT_THAI}${BORN_WINDOW_WHERE}
  AND (${EPI_AGE_COHORTS.map((c) => reachesAge(c.years, "YEAR")).join(`
    OR `)}
    OR ${P6_WHERE("p.birthdate")})`,
  // first_screen_date = latest counted dose (informational only).
  screenedSubquery: `
  SELECT vx.person_id, MAX(vx.dose_date) AS first_screen_date
  FROM (
    SELECT sp.person_id, sp.birthdate, pv.export_vaccine_code AS code,
           o.vstdate AS dose_date
    FROM person sp
    JOIN ovst o
      ON o.hn = sp.patient_hn
    JOIN ovst_vaccine ov
      ON ov.vn = o.vn
    JOIN person_vaccine pv
      ON pv.person_vaccine_id = ov.person_vaccine_id
    WHERE sp.birthdate >  :bornAfter
      AND sp.birthdate <= :dataAsOf
      AND o.vstdate < DATE_ADD(:dataAsOf, INTERVAL 1 DAY)
      AND pv.export_vaccine_code IN (${sqlCodeList(EPI_ALL_CODES)})
    UNION ALL
    SELECT sp.person_id, sp.birthdate, pv.export_vaccine_code,
           e.vaccine_date
    FROM person_vaccine_elsewhere e
    JOIN person sp
      ON sp.person_id = e.person_id
    JOIN person_vaccine pv
      ON pv.person_vaccine_id = e.person_vaccine_id
    WHERE sp.birthdate >  :bornAfter
      AND sp.birthdate <= :dataAsOf
      AND (e.vaccine_date IS NULL
           OR e.vaccine_date < DATE_ADD(:dataAsOf, INTERVAL 1 DAY))
      AND pv.export_vaccine_code IN (${sqlCodeList(EPI_ALL_CODES)})
  ) vx
  GROUP BY vx.person_id, vx.birthdate
  HAVING CASE${EPI_AGE_COHORTS.map(
    (c) => `
    WHEN ${reachesAge(c.years, "YEAR", "vx.birthdate")}
      THEN ${dosesAll(c.doses)}`,
  ).join("")}
    WHEN ${P6_WHERE("vx.birthdate")}
      THEN ${dosesAll(P6_DOSES)}
    ELSE 0 END = 1`,
  buildParams: (ctx) => {
    const y = Number(ctx.periodStart.slice(0, 4));
    return {
      periodStart: ctx.periodStart,
      dataAsOf: ctx.dataAsOf,
      // Oldest cohort is ป.6 (born after Y−12-05-16 > periodStart − 13 y).
      bornAfter: minusYears(ctx.periodStart, 13),
      p6BornAfter: `${y - 12}${P6_CUTOFF_MMDD}`,
      p6BornOnOrBefore: `${y - 11}${P6_CUTOFF_MMDD}`,
    };
  },
};

// --- exports ----------------------------------------------------------------

export type PpBasicChildCode = Extract<PpBasicCode, "CHILD_DEV" | "CHILD_GROWTH" | "EPI">;

export const PPBASIC_CHILD_DEV_SQL = buildPpBasicVillageSql(CHILD_DEV_SPEC);
export const PPBASIC_CHILD_GROWTH_SQL = buildPpBasicVillageSql(CHILD_GROWTH_SPEC);
export const PPBASIC_EPI_SQL = buildPpBasicVillageSql(EPI_SPEC);

export const PPBASIC_CHILD_SQL: Record<PpBasicChildCode, PpBasicVillageSql> = {
  CHILD_DEV: PPBASIC_CHILD_DEV_SQL,
  CHILD_GROWTH: PPBASIC_CHILD_GROWTH_SQL,
  EPI: PPBASIC_EPI_SQL,
};
