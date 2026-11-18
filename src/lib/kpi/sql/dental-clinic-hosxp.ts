import "server-only";

import type { QueryParams } from "@/lib/db/his";
import type { DentalCategoryCode, DentalCategoryKind } from "@/lib/kpi/dental-clinic-types";
import { HOSPITAL_HOSPCODE } from "@/lib/kpi/district-areas";

import { SCHEME_CODE_EXPR, SCHEME_INDEX_EXPR, schemePersonColumns } from "./clinic-scheme-hosxp";
import { NCD_DEPCODES, NCD_ICD } from "./ncd-clinic-hosxp";
import { sqlCodeList } from "./screening-common";

/**
 * SQL for "คลินิกทันตกรรม" (/clinic/dental): the hospital's dental rooms,
 * against HOSxP only (never HDC). Aggregates only: no hn / name / cid
 * leaves the database. Definitions and FY2569 verification:
 * docs/kpi/dental-clinic.md. Codes verified with db-cli (2026-11-18).
 *
 * A dental visit is NOT an ovst.main_dep: ~1 in 6 dental visits is
 * registered at another clinic (NCD 062, ANC 022, ER, …) and sent to the
 * dental room. The unit of work is therefore dtmain (one row per
 * procedure; ix_vstdate / ix_vn): a dental visit = a vn with >= 1 dtmain
 * row of the dental rooms (DENTAL_DEPCODES) in the fiscal year. Visits
 * registered at a PCU (PCU_DEPCODES) and the PCU dental rooms are other
 * units: they are kept out of every figure and only reported as
 * "excluded" (unit 'PCU' of DENTAL_VISITS_SQL).
 *
 * Charges = opitemrece items keyed by the dental rooms (opitemrece.dep_code
 * in the dental rooms), never vn_stat.income: a referred NCD visit carries
 * the NCD drugs and labs.
 *
 * Six queries, run in parallel by the loader (FY2569: 0.9–2.5 s each):
 *   DENTAL_VISITS_SQL      visits and charges per (month, scheme, unit, source)
 *   DENTAL_COHORT_SQL      one row: distinct people per breakdown
 *   DENTAL_PROCEDURES_SQL  procedures per (category, item) WITH ROLLUP
 *   DENTAL_DAYS_SQL        per (unit, date): visits, procedures, staff; appointments
 *   DENTAL_WAIT_SQL        one row: registration -> first procedure keyed
 *   DENTAL_DM_SQL          one row: NCD-clinic DM people with a dental service
 *
 * All SQL is static: code lists are source constants (sqlCodeList); only
 * values are bound as named parameters:
 *   :periodStart  'YYYY-MM-DD'  1 Oct of the fiscal year
 *   :dataAsOf     'YYYY-MM-DD'  30 Sep of the fiscal year (inclusive)
 *   :hospcode     the hospital's own hospcode (hospmain test of the schemes)
 *
 * dtmain is read by a full scan (~644k rows, ~0.3 s; the optimizer prefers
 * it to ix_vstdate for an 11 % range and both take the same time); every
 * other table is reached by its vn / pk index (EXPLAIN checked).
 */

// --- codes (verified with db-cli) -------------------------------------------

/** dtmain.depcode / opitemrece.dep_code 008 "ห้องตรวจทันตกรรม" (in the hospital). */
export const DENTAL_HOSPITAL_DEPCODE = "008";
/** 046 "ห้องฟันออกหน่วย": school / community outreach (~76 days a year). */
export const DENTAL_OUTREACH_DEPCODE = "046";
export const DENTAL_DEPCODES = [DENTAL_HOSPITAL_DEPCODE, DENTAL_OUTREACH_DEPCODE] as const;

/** 057 "PCU เมืองใหม่ - ทันตกรรม", 066 "PCU ทันตกรรม": PCU dental rooms (excluded). */
const PCU_DENTAL_DEPCODES = ["057", "066"] as const;

/**
 * kskdepartment rows named "PCU" (030–038 open, 039–041 closed, 057, 066).
 * A dental procedure on a visit registered there belongs to the PCU.
 */
export const PCU_DEPCODES = [
  "030", "031", "032", "033", "034", "035", "036", "037", "038", "039", "040", "041",
  ...PCU_DENTAL_DEPCODES,
] as const;

/** dttm 000174 "ไม่รอรับบริการ" (patient left before service): not a procedure. */
const NO_SERVICE_TMCODE = "000174";

/**
 * Procedure categories by dttm.dttm_group_id (HOSxP dental groups: the
 * hundreds are the specialty: 1xx ตรวจ, 2xx ทันตรังสี, 3xx เวชศาสตร์ช่องปาก,
 * 4xx ทันตกรรมหัตถการ, 5xx รักษาคลองรากฟัน, 6xx ปริทันต์ (610 = ทันตสุขศึกษา
 * OHI), 7xx ทันตกรรมป้องกัน, 8xx ทันตกรรมเด็ก, 9xx ทันตกรรมประดิษฐ์, 10xx
 * ทันตศัลยกรรม (ถอนฟัน), 11xx ศัลยกรรมช่องปาก, 13xx บดเคี้ยว). First match
 * wins; ranges are inclusive. Every dttm used in FY2569 has a group.
 */
export const DENTAL_CATEGORIES: readonly {
  code: DentalCategoryCode;
  name: string;
  kind: DentalCategoryKind;
  groups: readonly (readonly [number, number])[];
}[] = [
  { code: "EXAM", name: "ตรวจ / คัดกรองช่องปาก", kind: "EXAM", groups: [[100, 199]] },
  { code: "XRAY", name: "ถ่ายภาพรังสี", kind: "EXAM", groups: [[200, 299]] },
  { code: "OHI", name: "ทันตสุขศึกษา (OHI)", kind: "PREVENTIVE", groups: [[610, 610]] },
  { code: "FLUORIDE", name: "เคลือบ/ทาฟลูออไรด์", kind: "PREVENTIVE", groups: [[720, 729]] },
  { code: "SEALANT", name: "เคลือบหลุมร่องฟัน / PRR", kind: "PREVENTIVE", groups: [[730, 799]] },
  { code: "FILLING", name: "อุดฟัน", kind: "TREATMENT", groups: [[400, 499]] },
  { code: "EXTRACTION", name: "ถอนฟัน", kind: "TREATMENT", groups: [[1000, 1099]] },
  { code: "PERIO", name: "ขูดหินน้ำลาย / ปริทันต์", kind: "TREATMENT", groups: [[620, 719]] },
  { code: "ENDO", name: "รักษารากฟัน (รวมฟันน้ำนม)", kind: "TREATMENT", groups: [[500, 599], [800, 899]] },
  { code: "PROSTHESIS", name: "ฟันเทียม / ครอบฟัน", kind: "TREATMENT", groups: [[900, 999]] },
  { code: "SURGERY", name: "ศัลยกรรมช่องปาก (ฟันคุด แผล)", kind: "TREATMENT", groups: [[1100, 1299]] },
  { code: "ORAL_MED", name: "ให้ยา / เวชศาสตร์ช่องปาก", kind: "TREATMENT", groups: [[300, 399]] },
  { code: "OTHER", name: "อื่นๆ (บดเคี้ยว ฯลฯ)", kind: "TREATMENT", groups: [] },
];

/** dttm groups of ฟันเทียมถอดได้ delivered (950–970: partial 1–5 / > 5 teeth, complete). */
const DENTURE_GROUPS = [950, 970] as const;

/** opitemrece.income groups of DentalMoney. */
const INCOME = {
  DENTAL: ["13"],
  PROSTHESIS: ["02"],
  PROCEDURE: ["11"],
  DRUG: ["03", "04", "17", "20"],
  XRAY: ["08"],
} as const;

/** Age groups (vn_stat.age_y), upper bounds exclusive; last = no bound. */
export const DENTAL_AGE_GROUPS = [
  { code: "CHILD_0_5", name: "เด็กปฐมวัย 0–5 ปี", below: 6 },
  { code: "CHILD_6_14", name: "เด็กวัยเรียน 6–14 ปี", below: 15 },
  { code: "ADULT_15_59", name: "วัยทำงาน 15–59 ปี", below: 60 },
  { code: "ELDER_60", name: "ผู้สูงอายุ 60 ปีขึ้นไป", below: null },
] as const;

// --- fragments ---------------------------------------------------------------

function intRange(n: number): string {
  if (!Number.isSafeInteger(n) || n < 0) throw new Error(`invalid integer: ${n}`);
  return String(n);
}

const IN_FY = (col: string) =>
  `${col} >= :periodStart AND ${col} < DATE_ADD(:dataAsOf, INTERVAL 1 DAY)`;

/** dttm group -> category code, on `t` (dttm). */
const CATEGORY_EXPR = `CASE
${DENTAL_CATEGORIES.filter((c) => c.groups.length > 0)
  .map(
    (c) =>
      `      WHEN ${c.groups
        .map(([a, b]) => `t.dttm_group_id BETWEEN ${intRange(a)} AND ${intRange(b)}`)
        .join(" OR ")} THEN '${c.code}'`,
  )
  .join("\n")}
      ELSE 'OTHER' END`;

const TREATMENT_CODES = DENTAL_CATEGORIES.filter((c) => c.kind === "TREATMENT").map((c) => c.code);

const DENTAL_ROOMS = sqlCodeList(DENTAL_DEPCODES);
const ALL_DENTAL_ROOMS = sqlCodeList([...DENTAL_DEPCODES, ...PCU_DENTAL_DEPCODES]);
const PCU = sqlCodeList(PCU_DEPCODES);

/**
 * One row per dental vn of the fiscal year (rooms `rooms`), on dtmain `d`
 * and dttm `t`: has_hosp (any row of the hospital room), treat (any
 * treatment category), procs (rows), in_scope (any row of DENTAL_DEPCODES),
 * denture (a delivered denture item).
 */
const dentalVisitsSubquery = (rooms: string) => `
    SELECT d.vn,
           MAX(d.depcode IN (${DENTAL_ROOMS})) AS in_scope,
           MAX(d.depcode = '${DENTAL_HOSPITAL_DEPCODE}') AS has_hosp,
           MAX((${CATEGORY_EXPR}) IN (${sqlCodeList(TREATMENT_CODES)})) AS treat,
           MAX(t.dttm_group_id BETWEEN ${DENTURE_GROUPS[0]} AND ${DENTURE_GROUPS[1]}) AS denture,
           COUNT(*) AS procs
    FROM dtmain d
    LEFT JOIN dttm t
      ON t.code = d.tmcode
    WHERE ${IN_FY("d.vstdate")}
      AND d.depcode IN (${rooms})
      AND d.tmcode <> '${NO_SERVICE_TMCODE}'
      AND d.vn <> ''
    GROUP BY d.vn`;

/**
 * Unit of a visit (on `o` ovst and `v` dentalVisitsSubquery): 'PCU' when
 * registered at a PCU or only PCU dental rows; 'OUTREACH' when registered
 * at 046 or without any hospital-room row; else 'HOSPITAL'.
 */
const UNIT_EXPR = `CASE
        WHEN o.main_dep IN (${PCU}) OR v.in_scope = 0 THEN 'PCU'
        WHEN o.main_dep = '${DENTAL_OUTREACH_DEPCODE}' OR v.has_hosp = 0 THEN 'OUTREACH'
        ELSE 'HOSPITAL' END`;

const sumIncome = (codes: readonly string[]) =>
  `COALESCE(SUM(IF(r.dep_code IN (${ALL_DENTAL_ROOMS}) AND r.income IN (${sqlCodeList(codes)}), r.sum_price, 0)), 0)`;

// --- 1. visits and charges ---------------------------------------------------

/**
 * Visits and charges per (month of ovst.vstdate, scheme, unit, source):
 *  - unit       HOSPITAL / OUTREACH / PCU (PCU = excluded, shown apart)
 *  - src        'DENTAL' = registered at a dental room (main_dep 008 /
 *               046), 'REFERRED' = registered at another clinic
 *  - visits, treat_visits (>= 1 treatment procedure), procs (dtmain rows)
 *  - baht       opitemrece items of the dental rooms (dep_code 008 / 046 /
 *               057 / 066) on the vn; dental_fee / prosthesis / procedure /
 *               drug / xray = income groups of INCOME
 *  - other_dep_baht  items of other departments on the same vn (OPD fee,
 *               and for referred visits the other clinic's drugs / labs)
 * -> ~300 rows.
 */
export const DENTAL_VISITS_SQL = `
SELECT DATE_FORMAT(x.vstdate, '%Y-%m') AS ym,
       x.scheme_code,
       x.unit,
       x.src,
       COUNT(*)              AS visits,
       SUM(x.treat)          AS treat_visits,
       SUM(x.procs)          AS procs,
       SUM(x.baht)           AS baht,
       SUM(x.dental_baht)    AS dental_baht,
       SUM(x.prosthesis_baht) AS prosthesis_baht,
       SUM(x.procedure_baht) AS procedure_baht,
       SUM(x.drug_baht)      AS drug_baht,
       SUM(x.xray_baht)      AS xray_baht,
       SUM(x.other_dep_baht) AS other_dep_baht
FROM (
  SELECT o.vstdate,
         ${SCHEME_CODE_EXPR} AS scheme_code,
         ${UNIT_EXPR} AS unit,
         IF(o.main_dep IN (${DENTAL_ROOMS}), 'DENTAL', 'REFERRED') AS src,
         v.treat,
         v.procs,
         COALESCE(SUM(IF(r.dep_code IN (${ALL_DENTAL_ROOMS}), r.sum_price, 0)), 0) AS baht,
         ${sumIncome(INCOME.DENTAL)} AS dental_baht,
         ${sumIncome(INCOME.PROSTHESIS)} AS prosthesis_baht,
         ${sumIncome(INCOME.PROCEDURE)} AS procedure_baht,
         ${sumIncome(INCOME.DRUG)} AS drug_baht,
         ${sumIncome(INCOME.XRAY)} AS xray_baht,
         COALESCE(SUM(IF(COALESCE(r.dep_code, '') NOT IN (${ALL_DENTAL_ROOMS}), r.sum_price, 0)), 0) AS other_dep_baht
  FROM (${dentalVisitsSubquery(ALL_DENTAL_ROOMS)}
  ) v
  JOIN ovst o
    ON o.vn = v.vn
  LEFT JOIN vn_stat vs
    ON vs.vn = o.vn
  LEFT JOIN pttype pt
    ON pt.pttype = o.pttype
  LEFT JOIN opitemrece r
    ON r.vn = v.vn
  GROUP BY v.vn
) x
GROUP BY ym, x.scheme_code, x.unit, x.src
ORDER BY ym, x.scheme_code, x.unit, x.src
`;

// --- 2. cohort: distinct people (one row) ----------------------------------------

const MONTH_COLUMNS = Array.from(
  { length: 12 },
  (_, i) => `  SUM((c.month_mask & ${1 << i}) <> 0) AS m${i},`,
).join("\n");

const AGE_INDEX_EXPR = `CASE
${DENTAL_AGE_GROUPS.filter((g) => g.below !== null)
  .map((g, i) => `        WHEN vs.age_y < ${intRange(g.below as number)} THEN ${i}`)
  .join("\n")}
        ELSE ${DENTAL_AGE_GROUPS.length - 1} END`;

const AGE_COLUMNS = DENTAL_AGE_GROUPS.map(
  (_, i) => `  SUM((c.age_mask & ${1 << i}) <> 0) AS a${i}, SUM(c.age_v${i}) AS a${i}_visits,`,
).join("\n");

/**
 * Distinct people of the dental visits in scope (HOSPITAL + OUTREACH, PCU
 * excluded), one row:
 *  - persons; m0..m11 per fiscal month; s0..s9 per scheme
 *    (CLINIC_SCHEME_INDEX); pay_full / pay_capitation; hospital / outreach
 *  - a0..a3 per age group at the visit (+ a<i>_visits)
 *  - treated (>= 1 treatment procedure); elder_denture (a denture
 *    delivered at age >= 60); elders (people with a visit at >= 60)
 */
export const DENTAL_COHORT_SQL = `
SELECT
  COUNT(*) AS persons,
${MONTH_COLUMNS}
${schemePersonColumns()}
${AGE_COLUMNS}
  SUM((c.unit_mask & 1) <> 0) AS hospital,
  SUM((c.unit_mask & 2) <> 0) AS outreach,
  SUM(c.treat)                AS treated,
  SUM(c.elder_denture)        AS elder_denture
FROM (
  SELECT o.hn,
         BIT_OR(1 << PERIOD_DIFF(DATE_FORMAT(o.vstdate, '%Y%m'), DATE_FORMAT(:periodStart, '%Y%m'))) AS month_mask,
         BIT_OR(1 << (${SCHEME_INDEX_EXPR})) AS scheme_mask,
         BIT_OR(IF(o.main_dep = '${DENTAL_OUTREACH_DEPCODE}' OR v.has_hosp = 0, 2, 1)) AS unit_mask,
         BIT_OR(1 << (${AGE_INDEX_EXPR})) AS age_mask,
${DENTAL_AGE_GROUPS.map((_, i) => `         SUM((${AGE_INDEX_EXPR}) = ${i}) AS age_v${i},`).join("\n")}
         MAX(v.treat) AS treat,
         MAX(v.denture AND vs.age_y >= 60) AS elder_denture
  FROM (${dentalVisitsSubquery(DENTAL_ROOMS)}
  ) v
  JOIN ovst o
    ON o.vn = v.vn
  LEFT JOIN vn_stat vs
    ON vs.vn = o.vn
  LEFT JOIN pttype pt
    ON pt.pttype = o.pttype
  WHERE o.main_dep NOT IN (${PCU})
  GROUP BY o.hn
) c
`;

// --- 3. procedures -------------------------------------------------------------

/**
 * Procedures of the dental visits in scope per (category, dttm code) WITH
 * ROLLUP: (cat, tmcode) item rows, (cat, NULL) category rows (distinct
 * visits / people of the category), (NULL, NULL) total.
 *  - n       dtmain rows; teeth = SUM(GREATEST(tcount, 1))
 *  - fee     dtmain.fee (HOSxP price of the procedure)
 *  - op / item  dttm.icd10tm_operation_code / dttm.name (procedure names)
 * -> ~170 rows.
 */
export const DENTAL_PROCEDURES_SQL = `
SELECT p.cat,
       p.tmcode,
       MAX(p.op)               AS op,
       MAX(p.item)             AS item,
       COUNT(*)                AS n,
       SUM(p.teeth)            AS teeth,
       COUNT(DISTINCT p.vn)    AS visits,
       COUNT(DISTINCT p.hn)    AS persons,
       SUM(p.fee)              AS fee
FROM (
  SELECT d.vn, d.hn, d.tmcode,
         COALESCE(t.icd10tm_operation_code, '') AS op,
         COALESCE(t.name, d.tmcode)             AS item,
         GREATEST(COALESCE(d.tcount, 0), 1)     AS teeth,
         COALESCE(d.fee, 0)                     AS fee,
         ${CATEGORY_EXPR} AS cat
  FROM dtmain d
  JOIN ovst o
    ON o.vn = d.vn
  LEFT JOIN dttm t
    ON t.code = d.tmcode
  WHERE ${IN_FY("d.vstdate")}
    AND d.depcode IN (${DENTAL_ROOMS})
    AND d.tmcode <> '${NO_SERVICE_TMCODE}'
    AND o.main_dep NOT IN (${PCU})
) p
GROUP BY p.cat, p.tmcode WITH ROLLUP
`;

// --- 4. days: workload and appointments ------------------------------------------

/**
 * Per (unit, date) of the visits in scope, WITH ROLLUP ((unit, NULL) =
 * the unit's year, (NULL, NULL) = all):
 *  - visits, procs
 *  - staff         distinct dtmain.doctor (dental staff keying the work)
 *  - staff_visits  distinct (doctor, vn) pairs
 * plus one HOSPITAL row per date of dental-room appointments (oapp
 * depcode 008, nextdate in the fiscal year and before today): appts,
 * appts_kept (oapp.visit_vn set).
 */
export const DENTAL_DAYS_SQL = `
SELECT x.unit,
       x.d,
       SUM(x.visits)       AS visits,
       SUM(x.procs)        AS procs,
       SUM(x.staff)        AS staff,
       SUM(x.staff_visits) AS staff_visits,
       SUM(x.appts)        AS appts,
       SUM(x.appts_kept)   AS appts_kept
FROM (
  SELECT p.unit,
         DATE_FORMAT(p.vstdate, '%Y-%m-%d') AS d,
         COUNT(DISTINCT p.vn)               AS visits,
         COUNT(*)                           AS procs,
         COUNT(DISTINCT p.doctor)           AS staff,
         COUNT(DISTINCT p.doctor, p.vn)     AS staff_visits,
         0 AS appts,
         0 AS appts_kept
  FROM (
    SELECT IF(o.main_dep = '${DENTAL_OUTREACH_DEPCODE}'
              OR NOT EXISTS (SELECT 1 FROM dtmain z
                              WHERE z.vn = d.vn AND z.depcode = '${DENTAL_HOSPITAL_DEPCODE}'),
              'OUTREACH', 'HOSPITAL') AS unit,
           d.vstdate, d.vn, d.doctor
    FROM dtmain d
    JOIN ovst o
      ON o.vn = d.vn
    WHERE ${IN_FY("d.vstdate")}
      AND d.depcode IN (${DENTAL_ROOMS})
      AND d.tmcode <> '${NO_SERVICE_TMCODE}'
      AND o.main_dep NOT IN (${PCU})
  ) p
  GROUP BY p.unit, p.vstdate WITH ROLLUP
  UNION ALL
  SELECT 'HOSPITAL', DATE_FORMAT(a.nextdate, '%Y-%m-%d'), 0, 0, 0, 0,
         COUNT(*),
         SUM(a.visit_vn IS NOT NULL AND a.visit_vn <> '')
  FROM oapp a
  WHERE a.depcode = '${DENTAL_HOSPITAL_DEPCODE}'
    AND a.nextdate >= :periodStart
    AND a.nextdate <= :dataAsOf
    AND a.nextdate < CURDATE()
  GROUP BY a.nextdate
) x
GROUP BY x.unit, x.d
ORDER BY x.unit, x.d
`;

// --- 5. waiting time (proxy) ---------------------------------------------------------

/**
 * Registration (ovst.vstdate + vsttime) -> first dental procedure keyed
 * (MIN dtmain.begin_time; begin_time is stamped when the procedure is
 * saved, so this is "registration -> treated", not the chair time:
 * end_time = begin_time for half the rows). Visits registered at the
 * hospital dental room (main_dep 008), today excluded; 0..720 minutes
 * measured. HOSxP's ovst_service_time has no dental step (OPD-DOCTOR on
 * 3 % of dental visits), so it is not used. One row; MEDIAN /
 * PERCENTILE_CONT windows (MariaDB 10.3+).
 */
export const DENTAL_WAIT_SQL = `
SELECT COUNT(*)                                     AS visits,
       COALESCE(SUM(y.ok), 0)                       AS measured,
       ROUND(AVG(IF(y.ok = 1, y.w, NULL)))          AS mean_min,
       ROUND(MAX(y.med))                            AS median_min,
       ROUND(MAX(y.p90))                            AS p90_min,
       COALESCE(SUM(y.ok = 1 AND y.w <= 60), 0)     AS within60
FROM (
  SELECT x.w,
         IF(x.w BETWEEN 0 AND 720, 1, 0) AS ok,
         MEDIAN(IF(x.w BETWEEN 0 AND 720, x.w, NULL)) OVER () AS med,
         PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY IF(x.w BETWEEN 0 AND 720, x.w, NULL)) OVER () AS p90
  FROM (
    SELECT TIMESTAMPDIFF(MINUTE, TIMESTAMP(o.vstdate, o.vsttime), MIN(d.begin_time)) AS w
    FROM ovst o
    JOIN dtmain d
      ON d.vn = o.vn
     AND d.depcode = '${DENTAL_HOSPITAL_DEPCODE}'
     AND d.tmcode <> '${NO_SERVICE_TMCODE}'
    WHERE ${IN_FY("o.vstdate")}
      AND o.vstdate < CURDATE()
      AND o.main_dep = '${DENTAL_HOSPITAL_DEPCODE}'
    GROUP BY o.vn, o.vstdate, o.vsttime
  ) x
) y
`;

// --- 6. DM people with a dental service -------------------------------------------------

/**
 * DM people of the NCD clinic (same cohort as /clinic/ncd: ICD-10 E10–E14
 * in ovstdiag on a visit of NCD_DEPCODES in the fiscal year) and, of
 * them, people with >= 1 dtmain row in the fiscal year (any dental room,
 * PCU included: the patient was seen for oral health anywhere in the
 * hospital's HOSxP). One row: dm, dm_dental.
 */
export const DENTAL_DM_SQL = `
SELECT COUNT(*)              AS dm,
       SUM(t.hn IS NOT NULL) AS dm_dental
FROM (
  SELECT DISTINCT o.hn
  FROM ovst o
  JOIN ovstdiag g
    ON g.vn = o.vn
  WHERE o.main_dep IN (${sqlCodeList(NCD_DEPCODES)})
    AND ${IN_FY("o.vstdate")}
    AND ${IN_FY("g.vstdate")}
    AND g.icd10 >= '${NCD_ICD.DM[0]}' AND g.icd10 < '${NCD_ICD.DM[1]}'
) c
LEFT JOIN (
  SELECT d.hn
  FROM dtmain d
  WHERE ${IN_FY("d.vstdate")}
    AND d.tmcode <> '${NO_SERVICE_TMCODE}'
  GROUP BY d.hn
) t
  ON t.hn = c.hn
`;

export function dentalClinicParams(periodStart: string, dataAsOf: string): QueryParams {
  return { periodStart, dataAsOf, hospcode: HOSPITAL_HOSPCODE };
}
