import "server-only";

import type { QueryParams } from "@/lib/db/read-only-pool";
import {
  hdcDateParam,
  HDC_UNIT_CODE,
  HDC_UNIT_LIST,
  RESIDENTS_CTE,
  targetCte,
  type HdcScreeningSqlContext,
} from "./hdc-common";
import {
  DSPM_AGES_MONTHS,
  DSPM_PP_CODES,
  EPI_AGE_COHORTS,
  EPI_BIRTH_CODES,
  EPI_DOSE,
  EPI_FEE_CODES,
  EPI_FEE_MAX_AGE,
  EPI_SCHEDULE,
  GROWTH_MAX_AGE,
  P6_DOSES,
  SCHOOL_CUTOFF_MMDD,
  type EpiDose,
} from "./ppbasic-child-hosxp";
import {
  FLUORIDE_OP_CODES,
  SEALANT_OP_PREFIX,
} from "./ppbasic-dental-elderly-hosxp";
import { minusYears, sqlCodeList } from "./screening-common";

/**
 * District P&P Basic Services (/district/pp, page "basic") on the HDC
 * 43-file database ONLY (`sub_hdc`, never HOSxP). Same definitions as the
 * hospital page (./ppbasic-child-hosxp, ./ppbasic-dental-elderly-hosxp) as
 * far as the 43 files allow; codes / ages / schedule are imported from
 * those files so both pages use the same constants. Definitions and
 * FY2569 figures (db-cli --conn 2, 2026-11-13): docs/kpi/district-pp-basic.md.
 *
 * Population = `residents` (./hdc-common: PERSON typearea 1/3, alive,
 * de-duplicated by CID, village of the HOME address) + Thai, like the
 * hospital's catchment Thai population. A service counts at ANY unit of
 * the district (matched by CID inside SQL; the CID is never returned).
 *
 * Every query returns one row per village × responsible unit (only those
 * with target people / doses): { vid, hospcode, target, done } (numbers
 * may come back as decimal strings: SUM(EXISTS …)). `hospcode` = 5-digit
 * unit of the person's chosen PERSON record ("GA00…" normalised, same as
 * ./district-ppfs-hdc.ts): five villages of 650404 are served by both
 * 07529 and 11803. Aggregates only, no person rows.
 *
 * Speed: the "done" side is always a correlated EXISTS / COUNT on the
 * service file's (cid, date_serv) index, driven by the target persons.
 * A JOIN / IN on a CTE built from residents made MariaDB rebuild residents
 * as a LATERAL DERIVED once per service row (24–27 s); the correlated form
 * takes 2–4 s (residents itself ~1.2 s).
 *
 * Dates: HDC columns are 'YYYYMMDD' varchar, so every parameter is
 * 'YYYYMMDD' (hdcDateParam). Date arithmetic on a varchar birth date
 * (DATE_ADD) returns 'YYYY-MM-DD', so it is always wrapped in
 * DATE_FORMAT(…, '%Y%m%d') before comparing with a parameter.
 *
 * Parameters (all 'YYYYMMDD'): :periodStart :countFrom :dataAsOf plus
 * item-specific ones (see each buildParams). Static fragments come from
 * source constants only; values are bound.
 */

export type DistrictPpBasicCode =
  | "CHILD_DEV"
  | "CHILD_GROWTH"
  | "EPI"
  | "FLUORIDE"
  | "SEALANT"
  | "ELDERLY_DEPRESSION";

/** One item's per-village × unit query. -> rows { vid, hospcode, target, done }. */
export interface DistrictPpCellSql {
  sql: string;
  buildParams(ctx: HdcScreeningSqlContext): QueryParams;
}

/** Per-unit query (DISTRICT_EPI_NONRESIDENT_SQL). -> rows { hospcode, done }. */
export interface DistrictPpUnitSql {
  sql: string;
  buildParams(ctx: HdcScreeningSqlContext): QueryParams;
}

/** PERSON nation code of Thai nationals. */
const THAI = "'099'";

/** UC right in SERVICE.instype / CARD.instype_new (c_instype 0100). */
const UC_INSTYPE = "0100";

/**
 * HPV codes that exist only in HDC (the รพ.สต. programs), added to the
 * hospital's EPI_FEE_CODES (310 / 311 / 320) for the HPV ป.5 school dose:
 * 2-valent Cecolin / Cervarix (no FY2569 doses).
 */
const HDC_EXTRA_HPV_CODES = ["HPVC21", "HPVC22", "HPVV21"] as const;

/**
 * EXCLUDED from EPI money (owner decision 2026-11-13): HPV 9-valent
 * (Gardasil 9, c_epi_vaccinetype HPVG91–93). FY2569: HPVG91 118 doses to
 * school-age girls at รพ.สต. (ages 10–18, 117 ≤ 14). ยังไม่ยืนยันว่า
 * สปสช. จ่ายค่าบริการฉีด (PPFS ข้อ 25) สำหรับวัคซีนนี้ — add the codes to
 * HDC_EXTRA_HPV_CODES once NHSO confirms.
 */
export const HDC_EXCLUDED_HPV9_CODES = ["HPVG91", "HPVG92", "HPVG93"] as const;

const DISTRICT_EPI_FEE_CODES = [...EPI_FEE_CODES, ...HDC_EXTRA_HPV_CODES];

/** 'YYYY-MM-DD' -> 'YYYYMMDD' for the three common dates. */
function baseParams(ctx: HdcScreeningSqlContext): QueryParams {
  return {
    periodStart: hdcDateParam(ctx.periodStart),
    countFrom: hdcDateParam(ctx.countFrom),
    dataAsOf: hdcDateParam(ctx.dataAsOf),
  };
}

/** 'YYYYMMDD' of periodStart − `years` (same day). */
const yearsBefore = (periodStart: string, years: number) =>
  hdcDateParam(minusYears(periodStart, years));

/** `col` + n months / years as 'YYYYMMDD' (NULL for an invalid date). */
const plus = (col: string, n: number, unit: "MONTH" | "YEAR") => {
  if (!Number.isInteger(n) || n < 0) throw new Error(`invalid age: ${n}`);
  return `DATE_FORMAT(DATE_ADD(${col}, INTERVAL ${n} ${unit}), '%Y%m%d')`;
};

/** "Reaches n <unit> of age in [:periodStart, :dataAsOf]". */
const reachesAge = (col: string, n: number, unit: "MONTH" | "YEAR") =>
  `${plus(col, n, unit)} BETWEEN :periodStart AND :dataAsOf`;

/** Service date in [:countFrom, :dataAsOf] (inclusive, 'YYYYMMDD'). */
const inFy = (col: string) =>
  `${col} >= :countFrom AND ${col} <= :dataAsOf`;

/**
 * Final per-village × unit SELECT over CTE `target(cid, vid, hospcode, …)`;
 * `done` is a 0/1 expression on `t`.
 */
function personVillageSql(withClause: string, done: string): string {
  return `${withClause}
SELECT t.vid AS vid,
       ${HDC_UNIT_CODE("t.hospcode")} AS hospcode,
       COUNT(*) AS target,
       SUM(${done}) AS done
FROM target t
GROUP BY 1, 2
`;
}

/**
 * School-class windows ('YYYYMMDD'), same rule as the hospital
 * (ppbasic-child-hosxp schoolClassParams): Y = calendar year of
 * periodStart; ป.6 born in (Y−12-05-16, Y−11-05-16], ป.5 one year later.
 */
function schoolClassParams(periodStart: string): QueryParams {
  const y = Number(periodStart.slice(0, 4));
  const d = (year: number) => hdcDateParam(`${year}${SCHOOL_CUTOFF_MMDD}`);
  return {
    p6BornAfter: d(y - 12),
    p6BornOnOrBefore: d(y - 11),
    p5BornAfter: d(y - 11),
    p5BornOnOrBefore: d(y - 10),
  };
}
const P6_WHERE = (col: string) =>
  `(${col} > :p6BornAfter AND ${col} <= :p6BornOnOrBefore)`;
const P5_WHERE = (col: string) =>
  `(${col} > :p5BornAfter AND ${col} <= :p5BornOnOrBefore)`;

// --- 1. CHILD_DEV -------------------------------------------------------------

/**
 * CHILD_DEV — ตรวจพัฒนาการ (DSPM), เด็ก 0-5 ปี (persons).
 *  Target: Thai residents who reach 9, 18, 30, 42 or 60 months of age in
 *    [:periodStart, :dataAsOf] (= hospital / HDC s_childdev_specialpp).
 *  Done:   SPECIALPP with a DSPM code (DSPM_PP_CODES: 1B20x–1B24x
 *    per-domain 0–2, 1B260–1B262 overall) in the FY, at any unit, while
 *    the completed age in months is one of the key ages.
 *  FY2569: 1,780 target, 1,216 done (68.3%); any DSPM in the FY at any
 *  age would give 1,300. ~3.5 s.
 */
const CHILD_DEV: DistrictPpCellSql = {
  sql: personVillageSql(
    `${RESIDENTS_CTE},
target AS (
  SELECT r.cid, r.vid, r.hospcode, r.birth
  FROM residents r
  WHERE r.nation = ${THAI}
    AND r.birth > :bornAfter
    AND r.birth <= :dataAsOf
    AND (${DSPM_AGES_MONTHS.map((m) => reachesAge("r.birth", m, "MONTH")).join(`
      OR `)})
)`,
    `EXISTS (
    SELECT 1 FROM specialpp s
    WHERE s.cid = t.cid
      AND ${inFy("s.date_serv")}
      AND s.ppspecial IN (${sqlCodeList(DSPM_PP_CODES)})
      AND TIMESTAMPDIFF(MONTH, t.birth, s.date_serv) IN (${DSPM_AGES_MONTHS.join(", ")})
  )`,
  ),
  buildParams: (ctx) => ({
    ...baseParams(ctx),
    // 60 months + margin; the exact window is the reachesAge() list.
    bornAfter: yearsBefore(ctx.periodStart, 6),
  }),
};

// --- 2. CHILD_GROWTH ----------------------------------------------------------

/**
 * CHILD_GROWTH — ชั่งน้ำหนักและวัดส่วนสูง, เด็ก 0-12 ปี (persons).
 *  Target: Thai residents aged 0–12 on :periodStart plus those born in the
 *    FY (birth in (periodStart − 13 y, :dataAsOf]).
 *  Done:   >= 1 NUTRITION record with weight > 0 AND height > 0 in the FY,
 *    any unit. (HDC NUTRITION = what HOSxP exports from the WBC / EPI /
 *    school-screening tables, the same source the hospital page uses.)
 *  FY2569: 6,364 target, 5,938 done (93.3%). ~3 s (a JOIN on the
 *  nutrition date range took 24 s, see the header).
 */
const CHILD_GROWTH: DistrictPpCellSql = {
  sql: personVillageSql(
    `${RESIDENTS_CTE},
target AS (
  SELECT r.cid, r.vid, r.hospcode
  FROM residents r
  WHERE r.nation = ${THAI}
    AND r.birth > :bornAfter
    AND r.birth <= :dataAsOf
)`,
    `EXISTS (
    SELECT 1 FROM nutrition n
    WHERE n.cid = t.cid
      AND ${inFy("n.date_serv")}
      AND n.weight + 0 > 0
      AND n.height + 0 > 0
  )`,
  ),
  buildParams: (ctx) => ({
    countFrom: hdcDateParam(ctx.countFrom),
    dataAsOf: hdcDateParam(ctx.dataAsOf),
    bornAfter: yearsBefore(ctx.periodStart, GROWTH_MAX_AGE + 1),
  }),
};

// --- 3. EPI money units (doses) ----------------------------------------------

/**
 * Doses due in [:periodStart, :dataAsOf] for child `k` by EPI_SCHEDULE +
 * ป.5 girls (HPV) + ป.6 (dT). A ป.5 girl who already got HPV 9-valent
 * (HDC_EXCLUDED_HPV9_CODES, any unit, up to :dataAsOf) is NOT due: she is
 * vaccinated, only the dose is not paid, so she must not show as a gap
 * (FY2569: 89 of 309 Thai ป.5 girls).
 */
const EPI_DUE_DOSES = `(${EPI_SCHEDULE.map(
  (s) => `
        (${reachesAge("k.birth", s.months, "MONTH")}) * ${s.doses}`,
).join(" +")} +
        (k.sex = '2' AND ${P5_WHERE("k.birth")} AND NOT EXISTS (
          SELECT 1 FROM epi h
          WHERE h.cid = k.cid
            AND h.vaccinetype IN (${sqlCodeList(HDC_EXCLUDED_HPV9_CODES)})
            AND h.date_serv <= :dataAsOf)) +
        ${P6_WHERE("k.birth")})`;

/**
 * Doses of child `k` (correlated) matching `codes`: EPI rows in the FY
 * given BY a district unit (RIGHT(vaccineplace, 5) in the unit list, so
 * history rows of doses given elsewhere are dropped), before the 15th
 * birthday (age ≤ EPI_FEE_MAX_AGE), on a UC visit: SERVICE.instype 0100
 * of the same visit (hospcode + seq + date_serv = SERVICE PK) or, when
 * the EPI row has no SERVICE row (~3% of the giving unit's rows), a UC
 * CARD of the child (by CID, see DUE_RIGHT_WHERE). One dose per (vaccine, date): the same dose
 * is often in two units' files (FY2569 6,678 rows -> 6,531 doses).
 */
function epiDoseCount(codes: readonly string[]): string {
  return `(
      SELECT COUNT(DISTINCT e.vaccinetype, e.date_serv)
      FROM epi e
      LEFT JOIN service s
        ON s.hospcode = e.hospcode AND s.seq = e.seq AND s.date_serv = e.date_serv
      WHERE e.cid = k.cid
        AND ${inFy("e.date_serv")}
        AND e.date_serv < ${plus("k.birth", EPI_FEE_MAX_AGE + 1, "YEAR")}
        AND e.vaccinetype IN (${sqlCodeList(codes)})
        AND RIGHT(e.vaccineplace, 5) IN (${HDC_UNIT_LIST})
        AND (s.instype = '${UC_INSTYPE}'
             OR (s.hospcode IS NULL AND EXISTS (
                   SELECT 1 FROM card c
                   WHERE c.cid = e.cid
                     AND c.instype_new = '${UC_INSTYPE}')))
    )`;
}

/**
 * Registered right of the child (CARD of ANY unit, by CID): a UC card, or
 * no card at all (infants). CARD uses the "GA00…" hospcode of PERSON while
 * EPI / SERVICE use the 5-digit code for unit 14056, so CARD is always
 * matched by CID, never by hospcode + pid.
 */
const DUE_RIGHT_WHERE = `(EXISTS (
            SELECT 1 FROM card c
            WHERE c.cid = k.cid
              AND c.instype_new = '${UC_INSTYPE}')
          OR NOT EXISTS (
            SELECT 1 FROM card c
            WHERE c.cid = k.cid))`;

/**
 * EPI — money units = vaccine doses (NHSO PPFS item 25, 20 baht per dose),
 * per village of the child's home × responsible unit. Same rule as the hospital EPI_MONEY
 * (../ppbasic.ts toDoseUnits), per village:
 *  done   = EPI doses (DISTRICT_EPI_FEE_CODES) given by ANY district unit
 *           in the FY to UC resident children aged ≤ 14 at the visit
 *           (epiDoseCount; any nationality — UC implies Thai).
 *  birth  = the birth doses (BCG 010, HBV1 041) within done (own target).
 *  due    = doses due in [:periodStart, :dataAsOf] by EPI_SCHEDULE for the
 *           village's Thai resident children with a UC CARD or no CARD;
 *           ป.5 girls (HPV) / ป.6 (dT) are school-class windows, due for
 *           the whole year; a ป.5 girl with HPV 9-valent is not due
 *           (vaccinated, unpaid: see EPI_DUE_DOSES).
 *  target = done + max(0, due − (done − birth))   (gap per village)
 * Doses to children who are NOT district residents (out of district,
 * TYPEAREA 4, no valid HOME) have no village and are NOT in these cells:
 * DISTRICT_EPI_NONRESIDENT_SQL gives them per giving unit.
 * FY2569 (HPV 9-valent excluded, its ป.5 girls not due): done 5,097 doses
 * (101,940 baht), due 6,456, target 6,666 doses (133,320 baht);
 * non-residents another 1,706 doses. (With HPVG91 the author had done
 * 5,186 / target 6,754 / non-residents 1,732.) ~1.5–2 s.
 */
const EPI: DistrictPpCellSql = {
  sql: `${RESIDENTS_CTE},
kids AS (
  SELECT r.cid, r.vid, r.hospcode, r.pid, r.birth, r.sex, r.nation
  FROM residents r
  WHERE r.birth > :kidsBornAfter
    AND r.birth <= :dataAsOf
),
per_kid AS (
  SELECT k.vid,
    ${HDC_UNIT_CODE("k.hospcode")} AS hospcode,
    CASE WHEN k.nation = ${THAI}
          AND k.birth > :dueBornAfter
          AND ${DUE_RIGHT_WHERE}
         THEN ${EPI_DUE_DOSES}
         ELSE 0 END AS due_units,
    ${epiDoseCount(DISTRICT_EPI_FEE_CODES)} AS done_units,
    ${epiDoseCount(EPI_BIRTH_CODES)} AS birth_units
  FROM kids k
),
cells AS (
  SELECT vid, hospcode,
         SUM(due_units) AS due_units,
         SUM(done_units) AS done_units,
         SUM(birth_units) AS birth_units
  FROM per_kid
  GROUP BY vid, hospcode
)
SELECT vid, hospcode,
       done_units + GREATEST(0, due_units - (done_units - birth_units)) AS target,
       done_units AS done
FROM cells
WHERE due_units > 0 OR done_units > 0
`,
  buildParams: (ctx) => ({
    ...baseParams(ctx),
    // Doses count up to the 15th birthday: children born after periodStart − 15 y.
    kidsBornAfter: yearsBefore(ctx.periodStart, EPI_FEE_MAX_AGE + 1),
    // Oldest due child is ป.6 (born after Y−12-05-16 > periodStart − 13 y).
    dueBornAfter: yearsBefore(ctx.periodStart, 13),
    ...schoolClassParams(ctx.periodStart),
  }),
};

/**
 * Optional: EPI doses (same rule as epiDoseCount) given by district units
 * in the FY to UC children aged ≤ 14 who are NOT in `residents` (no
 * district village). -> rows { hospcode (5-digit giving unit), done }.
 * Not part of the per-village cells; the loader returns it as
 * summary.unitExtras (done = target, no gap). A dose given by two units on the same day is
 * counted once under the smaller hospcode. Age from any PERSON record of
 * the CID (EPI rows of unit 14056 carry hospcode 14056 while PERSON uses
 * GA0014056, so PERSON is matched by CID).
 * FY2569: 1,706 doses (34,120 baht; 11252: 576 of them; 1,732 before the
 * HPV 9-valent exclusion). ~0.4–2 s.
 */
export const DISTRICT_EPI_NONRESIDENT_SQL: DistrictPpUnitSql = {
  sql: `${RESIDENTS_CTE},
dose AS (
  SELECT e.cid, e.vaccinetype, e.date_serv,
         MIN(RIGHT(e.vaccineplace, 5)) AS hospcode
  FROM epi e
  LEFT JOIN service s
    ON s.hospcode = e.hospcode AND s.seq = e.seq AND s.date_serv = e.date_serv
  WHERE ${inFy("e.date_serv")}
    AND LENGTH(e.cid) = 32
    AND e.vaccinetype IN (${sqlCodeList(DISTRICT_EPI_FEE_CODES)})
    AND RIGHT(e.vaccineplace, 5) IN (${HDC_UNIT_LIST})
    AND (s.instype = '${UC_INSTYPE}'
         OR (s.hospcode IS NULL AND EXISTS (
               SELECT 1 FROM card c
               WHERE c.cid = e.cid
                 AND c.instype_new = '${UC_INSTYPE}')))
  GROUP BY e.cid, e.vaccinetype, e.date_serv
),
nonres AS (
  SELECT d.hospcode, d.date_serv,
         (SELECT MAX(p.birth) FROM person p
          WHERE p.cid = d.cid AND p.birth >= '19000101') AS birth
  FROM dose d
  WHERE NOT EXISTS (SELECT 1 FROM residents r WHERE r.cid = d.cid)
)
SELECT n.hospcode AS hospcode, COUNT(*) AS done
FROM nonres n
WHERE n.date_serv < ${plus("n.birth", EPI_FEE_MAX_AGE + 1, "YEAR")}
GROUP BY n.hospcode
`,
  buildParams: (ctx) => ({
    countFrom: hdcDateParam(ctx.countFrom),
    dataAsOf: hdcDateParam(ctx.dataAsOf),
  }),
};

// --- 3b. EPI_PERSONS: coverage by cohort (NOT on the page, no baht) ---------
// Dropped from /district/pp (owner decision 2026-11-13): HDC EPI lacks the
// vaccine history before Oct 2025, so completeness by cohort is an
// under-count. Kept for reference / a later year; not in DISTRICT_PPBASIC_SQL.

/** 1 when the child has every dose of the list (vx flags). */
const allDoses = (doses: readonly EpiDose[]) =>
  `COALESCE(${doses.map((d) => `v.${d.toLowerCase()}`).join(" + ")} = ${doses.length}, 0)`;

const EPI_COHORT_DOSES = [
  ...new Set([
    ...EPI_AGE_COHORTS.flatMap((c) => [...c.doses]),
    ...P6_DOSES,
  ]),
] as EpiDose[];
const EPI_COHORT_CODES = [
  ...new Set(EPI_COHORT_DOSES.flatMap((d) => [...EPI_DOSE[d]])),
];

/**
 * EPI_PERSONS — วัคซีนพื้นฐานครบตามช่วงอายุ (persons), hospital EPI_SPEC.
 *  Target: Thai residents turning 1, 2, 3 or 5 years in [:periodStart,
 *    :dataAsOf], or in the ป.6 class window (one cohort per child).
 *  Done:   every dose of the cohort (EPI_AGE_COHORTS / P6_DOSES) in EPI at
 *    any date ≤ :dataAsOf, any unit, any vaccineplace (history rows too).
 *  CAVEAT: HDC EPI holds full history only for records exported since the
 *  2025-10 sync, so doses given before FY2569 are often missing (birth
 *  doses especially): FY2569 1 y 64/333, 2 y 249/353, 3 y 224/373,
 *  5 y 185/423, ป.6 350/625 = 1,072/2,107 (50.9%) — an UNDER-count.
 *  ~1.6 s.
 */
export const DISTRICT_EPI_PERSONS_SQL: DistrictPpCellSql = {
  sql: personVillageSql(
    `${RESIDENTS_CTE},
vx AS (
  SELECT e.cid,
         ${EPI_COHORT_DOSES.map(
           (d) =>
             `MAX(e.vaccinetype IN (${sqlCodeList(EPI_DOSE[d])})) AS ${d.toLowerCase()}`,
         ).join(`,
         `)}
  FROM epi e
  WHERE e.date_serv <= :dataAsOf
    AND e.vaccinetype IN (${sqlCodeList(EPI_COHORT_CODES)})
  GROUP BY e.cid
),
target AS (
  SELECT r.cid, r.vid, r.hospcode,
         CASE${EPI_AGE_COHORTS.map(
           (c) => `
           WHEN ${reachesAge("r.birth", c.years, "YEAR")} THEN ${allDoses(c.doses)}`,
         ).join("")}
           WHEN ${P6_WHERE("r.birth")} THEN ${allDoses(P6_DOSES)}
           ELSE 0 END AS complete
  FROM residents r
  LEFT JOIN vx v ON v.cid = r.cid
  WHERE r.nation = ${THAI}
    AND r.birth > :bornAfter
    AND r.birth <= :dataAsOf
    AND (${[
      ...EPI_AGE_COHORTS.map((c) => reachesAge("r.birth", c.years, "YEAR")),
      P6_WHERE("r.birth"),
    ].join(`
      OR `)})
)`,
    "t.complete",
  ),
  buildParams: (ctx) => {
    const { p6BornAfter, p6BornOnOrBefore } = schoolClassParams(ctx.periodStart);
    return {
      periodStart: hdcDateParam(ctx.periodStart),
      dataAsOf: hdcDateParam(ctx.dataAsOf),
      bornAfter: yearsBefore(ctx.periodStart, 13),
      p6BornAfter,
      p6BornOnOrBefore,
    };
  },
};

// --- 4–5. FLUORIDE / SEALANT (PROCEDURE_OPD ICD-10-TM) ----------------------

/** Target CTE: Thai residents aged min–max on 1 Oct (./hdc-common targetCte). */
const AGE_TARGET = `${RESIDENTS_CTE},${targetCte("target", {
  maxAge: true,
  female: false,
  thaiOnly: true,
  excludeKnown: false,
})}`;

function ageParams(periodStart: string, minAge: number, maxAge: number): QueryParams {
  return {
    birthOnOrBefore: yearsBefore(periodStart, minAge),
    birthAfter: yearsBefore(periodStart, maxAge + 1),
  };
}

/** >= 1 PROCEDURE_OPD row of child `t` in the FY matching `where` (on o.procedcode). */
const procedureDone = (where: string) => `EXISTS (
    SELECT 1 FROM procedure_opd o
    WHERE o.cid = t.cid
      AND ${inFy("o.date_serv")}
      AND ${where}
  )`;

/**
 * FLUORIDE — เคลือบ/ทาฟลูออไรด์, เด็ก 4–12 ปี ณ 1 ต.ค. (persons).
 *  Done: PROCEDURE_OPD ICD-10-TM 2377020 / 2387020 in the FY, any unit.
 *  (DENTAL.need_fluoride is a need, not a service: not used.)
 *  FY2569: 4,678 target, 2,712 done (58.0%). ~2.3 s (with SEALANT).
 */
const FLUORIDE: DistrictPpCellSql = {
  sql: personVillageSql(
    AGE_TARGET,
    procedureDone(`o.procedcode IN (${sqlCodeList(FLUORIDE_OP_CODES)})`),
  ),
  buildParams: (ctx) => ({
    countFrom: hdcDateParam(ctx.countFrom),
    dataAsOf: hdcDateParam(ctx.dataAsOf),
    ...ageParams(ctx.periodStart, 4, 12),
  }),
};

if (!/^[0-9A-Z]+$/.test(SEALANT_OP_PREFIX)) throw new Error("invalid sealant prefix");

/**
 * SEALANT — เคลือบหลุมร่องฟันแท้, เด็ก 6–12 ปี ณ 1 ต.ค. (persons).
 *  Done: PROCEDURE_OPD 238703* (2387030, per-tooth 238703A–H) in the FY.
 *  FY2569: 3,819 target, 1,231 done (32.2%).
 */
const SEALANT: DistrictPpCellSql = {
  sql: personVillageSql(
    AGE_TARGET,
    procedureDone(`o.procedcode LIKE '${SEALANT_OP_PREFIX}%'`),
  ),
  buildParams: (ctx) => ({
    countFrom: hdcDateParam(ctx.countFrom),
    dataAsOf: hdcDateParam(ctx.dataAsOf),
    ...ageParams(ctx.periodStart, 6, 12),
  }),
};

// --- 6. ELDERLY_DEPRESSION ----------------------------------------------------

/** HDC indicator codes: 2Q ผู้สูงอายุ ปกติ / ผิดปกติ (SPECIALPP). */
export const HDC_ELDERLY_DEPRESSION_CODES = ["1B0280", "1B0281"] as const;

/**
 * ELDERLY_DEPRESSION — คัดกรองซึมเศร้า 2Q, ผู้สูงอายุ 60+ ณ 1 ต.ค. (persons).
 *  Done: SPECIALPP 1B0280 / 1B0281 in the FY, any unit (HDC rule; the
 *  hospital page also counts its HOSxP 2Q form, which HDC does not have;
 *  adding 9Q / 2Q-general codes changes FY2569 by 2 persons only).
 *  FY2569: 17,756 target, 14,620 done (82.3%). ~2.7 s.
 */
const ELDERLY_DEPRESSION: DistrictPpCellSql = {
  sql: personVillageSql(
    `${RESIDENTS_CTE},${targetCte("target", {
      maxAge: false,
      female: false,
      thaiOnly: true,
      excludeKnown: false,
    })}`,
    `EXISTS (
    SELECT 1 FROM specialpp s
    WHERE s.cid = t.cid
      AND ${inFy("s.date_serv")}
      AND s.ppspecial IN (${sqlCodeList(HDC_ELDERLY_DEPRESSION_CODES)})
  )`,
  ),
  buildParams: (ctx) => ({
    countFrom: hdcDateParam(ctx.countFrom),
    dataAsOf: hdcDateParam(ctx.dataAsOf),
    birthOnOrBefore: yearsBefore(ctx.periodStart, 60),
  }),
};

// --- exports ------------------------------------------------------------------

export const DISTRICT_PPBASIC_SQL: Readonly<
  Record<DistrictPpBasicCode, DistrictPpCellSql>
> = {
  CHILD_DEV,
  CHILD_GROWTH,
  EPI,
  FLUORIDE,
  SEALANT,
  ELDERLY_DEPRESSION,
};
