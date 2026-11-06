import "server-only";

import type { QueryParams } from "@/lib/db/his";
import {
  PERSONS_EXPORT_LIMIT,
  PERSONS_PER_VILLAGE_LIMIT,
} from "./screening-common";

/**
 * SQL for "ร้อยละผู้ป่วยไตเรื้อรัง stage 5 รายใหม่ ที่ลดลงจากปีงบประมาณก่อนหน้า"
 * (KPI Template 2569 no. 20, Service Plan kidney). Formula ((B − A) / B) × 100
 * with A = new CKD stage 5 patients of the current fiscal year and B = new
 * CKD stage 5 patients of the previous fiscal year. Lower A is better.
 *
 * Verified with db-cli against the production HOSxP database (bkhosxp,
 * MariaDB 10.11) on 2026-11-06 — definition, citations, mapping,
 * assumptions and figures are in docs/kpi/ckd-stage5.md.
 *
 * Population: every patient served by the hospital (hospital-level KPI,
 * not the catchment population; no age / nationality filter).
 *
 * eGFR result ("eg"): lab_items_code 921 'eGFR' (provis_labcode 0581904 =
 * 43-file LABFU eGFR, CKD-EPI computed by the LIS), dated by
 * lab_head.order_date, numeric result only, and NOT done during an
 * admission: lab_head.vn is not an ipt.an (IPD order) and order_date is
 * not within [ipt.regdate, ipt.dchdate] of the same hn (ER labs on the
 * admission day are acute values too).
 *
 * Stage 5 event: an eGFR < 15 result r that is "chronic" by the template
 * rules, simplified (see docs section 3):
 *   (a) a previous eGFR in [15, 21) at least 90 days before r, or
 *   (f) a previous eGFR < 15 between 365 and 90 days before r (r is then
 *       the 3-month confirmation of an earlier low value; covers template
 *       rule 2 "eGFR 21–60 before, still < 15 three months later" and
 *       rule 3 "no earlier result, confirm >= 3 months later").
 *   and r is not excluded:
 *   - AKI: no N17* diagnosis (OPD visit or admission) in [r − 90 d, r]
 *   - RRT: no dialysis evidence on or before r (Z49*, Z99.2, T82.4,
 *     ICD-9-CM 39.95 / 54.98 in ovstdiag, iptdiag, iptoprt). This site
 *     has no dialysis unit; these codes are almost never used.
 * case_date = date of the first stage 5 event of the patient over the
 * whole eGFR history (since 2017). A patient is a NEW case of the fiscal
 * year that contains case_date; anyone with an earlier event is not new.
 * Because case_date is the date the rule is first met, the count of a past
 * fiscal year is final at its end (no look-ahead).
 *
 * Performance: candidates = patients with an eGFR < 15 in
 * [:prevStart, :dataAsOf] (range on lab_head.order_date, ~2 years,
 * a few hundred patients); their full eGFR history is then read via
 * lab_head(hn, order_date) and the chronicity rules are evaluated with
 * window functions (one pass, no self join). STRAIGHT_JOIN keeps the
 * candidate set as the driving table (without it MariaDB full-scans
 * lab_head, ~1.5M rows). Each query references the `nc` CTE once.
 *
 * Parameters (bound, never concatenated):
 *   :prevStart       'YYYY-MM-DD'  1 Oct of the previous fiscal year
 *   :periodStart     'YYYY-MM-DD'  1 Oct of the selected fiscal year
 *   :dataAsOf        'YYYY-MM-DD'  data cutoff, inclusive (<= 30 Sep)
 *   :prevSameDayEnd  'YYYY-MM-DD'  dataAsOf minus 1 year (same point of the
 *                                  previous fiscal year, for YTD comparison)
 *   :villageId       person.village_id (personsByVillage only)
 */

/** HOSxP lab_items.lab_items_code of eGFR (provis_labcode 0581904, verified). */
export const EGFR_LAB_ITEM_CODES: readonly number[] = [921];

/** Thresholds of the template definition (eGFR in mL/min/1.73 m²). */
export const CKD5_RULES = {
  /** Stage 5: eGFR below this value. */
  stage5Below: 15,
  /** Rule (a): previous eGFR in [stage5Below, prevUpperExclusive). */
  prevUpperExclusive: 21,
  /** Minimum gap (days) between the earlier value and the event. */
  minGapDays: 90,
  /** Rule (f): earliest earlier eGFR < 15 that can be confirmed. */
  followUpMaxDays: 365,
  /** AKI diagnosis look-back (days) from the event. */
  akiLookbackDays: 90,
} as const;

/** The query set of the indicator (not a ScreeningSqlSet: no population B). */
export interface Ckd5SqlSet {
  /**
   * -> one row { current_cases (A), previous_cases (B, whole previous FY),
   *              previous_same_period (previous FY up to :prevSameDayEnd) }
   */
  totals: string;
  /** -> rows { period: 'current' | 'previous', bucket: 'YYYY-MM', new_cases } */
  monthly: string;
  /**
   * -> rows { village_id, village_moo, village_name, current_cases,
   *           previous_cases }; village_id 0 = outside the catchment /
   *           unknown (most patients), so rows add up to the totals.
   */
  village: string;
  /** -> new cases of the current fiscal year in one village (:villageId). */
  personsByVillage: string;
  /** -> new cases of the current fiscal year, all villages incl. 0. */
  personsAll: string;
  buildParams(ctx: Ckd5SqlContext): QueryParams;
}

export interface Ckd5SqlContext {
  /** 'YYYY-MM-DD' 1 Oct of the selected fiscal year. */
  periodStart: string;
  /** 'YYYY-MM-DD' inclusive cutoff (fiscal year end for past years). */
  dataAsOf: string;
}

/** Renders constant integer codes as an unquoted SQL IN list (int column). */
function sqlIntList(codes: readonly number[]): string {
  if (codes.length === 0) throw new Error("empty code list");
  for (const c of codes) {
    if (!Number.isSafeInteger(c) || c < 0) {
      throw new Error(`invalid integer code: ${c}`);
    }
  }
  return codes.join(", ");
}

const R = CKD5_RULES;
const EGFR_CODES = sqlIntList(EGFR_LAB_ITEM_CODES);
/** Plain decimal number (this site stores no '<' / '>' eGFR results). */
const NUMERIC_RESULT = `lo.lab_order_result REGEXP '^[0-9]+([.][0-9]+)?$'`;

/**
 * nc = new stage 5 cases with case_date in [:prevStart, :dataAsOf], one
 * row per hn, plus period 'current' (>= :periodStart) / 'previous'.
 */
const NEW_CASE_CTES = `
WITH
cand AS (
  SELECT DISTINCT h.hn
  FROM lab_head h
  STRAIGHT_JOIN lab_order lo
    ON lo.lab_order_number = h.lab_order_number
  WHERE h.order_date >= :prevStart
    AND h.order_date <  DATE_ADD(:dataAsOf, INTERVAL 1 DAY)
    AND lo.lab_items_code IN (${EGFR_CODES})
    AND ${NUMERIC_RESULT}
    AND CAST(lo.lab_order_result AS DECIMAL(8, 2)) < ${R.stage5Below}
),
eg AS (
  SELECT h.hn,
         h.order_date                               AS d,
         CAST(lo.lab_order_result AS DECIMAL(8, 2)) AS v
  FROM cand c
  STRAIGHT_JOIN lab_head h
    ON h.hn = c.hn
   AND h.order_date < DATE_ADD(:dataAsOf, INTERVAL 1 DAY)
  STRAIGHT_JOIN lab_order lo
    ON lo.lab_order_number = h.lab_order_number
  WHERE lo.lab_items_code IN (${EGFR_CODES})
    AND ${NUMERIC_RESULT}
    AND NOT EXISTS (SELECT 1 FROM ipt i WHERE i.an = h.vn)
    AND NOT EXISTS (
          SELECT 1
          FROM ipt i
          WHERE i.hn = h.hn
            AND i.regdate <= h.order_date
            AND COALESCE(i.dchdate, '9999-12-31') >= h.order_date
        )
),
ew AS (
  SELECT e.hn,
         e.d,
         e.v,
         COUNT(CASE WHEN e.v >= ${R.stage5Below}
                     AND e.v <  ${R.prevUpperExclusive} THEN 1 END)
           OVER (PARTITION BY e.hn ORDER BY TO_DAYS(e.d)
                 RANGE BETWEEN UNBOUNDED PRECEDING
                           AND ${R.minGapDays} PRECEDING)  AS n_prev_g4,
         COUNT(CASE WHEN e.v < ${R.stage5Below} THEN 1 END)
           OVER (PARTITION BY e.hn ORDER BY TO_DAYS(e.d)
                 RANGE BETWEEN ${R.followUpMaxDays} PRECEDING
                           AND ${R.minGapDays} PRECEDING)  AS n_prev_g5
  FROM eg e
),
aki_dx AS (
  SELECT d.hn, d.vstdate AS dx_from, d.vstdate AS dx_to
  FROM ovstdiag d
  WHERE d.icd10 >= 'N17' AND d.icd10 < 'N18'
    AND d.vstdate < DATE_ADD(:dataAsOf, INTERVAL 1 DAY)
  UNION ALL
  SELECT i.hn, i.regdate, COALESCE(i.dchdate, :dataAsOf)
  FROM iptdiag d
  JOIN ipt i
    ON i.an = d.an
  WHERE d.icd10 >= 'N17' AND d.icd10 < 'N18'
),
rrt_dx AS (
  SELECT d.hn, d.vstdate AS dx_from
  FROM ovstdiag d
  WHERE (d.icd10 >= 'Z49' AND d.icd10 < 'Z50')
     OR d.icd10 IN ('Z992', 'T824', '3995', '5498')
  UNION ALL
  SELECT i.hn, i.regdate
  FROM iptdiag d
  JOIN ipt i
    ON i.an = d.an
  WHERE (d.icd10 >= 'Z49' AND d.icd10 < 'Z50')
     OR d.icd10 IN ('Z992', 'T824')
  UNION ALL
  SELECT i.hn, i.regdate
  FROM iptoprt o
  JOIN ipt i
    ON i.an = o.an
  WHERE o.icd9 IN ('3995', '5498')
),
fc AS (
  SELECT r.hn, MIN(r.d) AS case_date
  FROM ew r
  WHERE r.v < ${R.stage5Below}
    AND (r.n_prev_g4 > 0 OR r.n_prev_g5 > 0)
    AND NOT EXISTS (
          SELECT 1 FROM aki_dx a
          WHERE a.hn = r.hn
            AND a.dx_from <= r.d
            AND a.dx_to   >= DATE_SUB(r.d, INTERVAL ${R.akiLookbackDays} DAY)
        )
    AND NOT EXISTS (
          SELECT 1 FROM rrt_dx x
          WHERE x.hn = r.hn
            AND x.dx_from <= r.d
        )
  GROUP BY r.hn
),
nc AS (
  SELECT fc.hn,
         fc.case_date,
         CASE WHEN fc.case_date >= :periodStart
              THEN 'current' ELSE 'previous' END AS period
  FROM fc
  WHERE fc.case_date >= :prevStart
)`;

/**
 * In-area person -> real village id, else 0 (same rules as
 * PERSON_IN_CATCHMENT_WHERE / hdc-rlu-hosxp.ts). Needs
 * `LEFT JOIN person p ON p.patient_hn = nc.hn LEFT JOIN village v ON
 * v.village_id = p.village_id`. person.patient_hn is 1:1 with patient.hn.
 */
const IN_AREA_CONDITION = `p.house_regist_type_id IN (1, 3)
       AND p.person_discharge_id = 9
       AND COALESCE(p.death, 'N') <> 'Y'
       AND v.village_id IS NOT NULL
       AND TRIM(LEADING '0' FROM TRIM(v.village_moo)) <> ''`;

const VILLAGE_ID_EXPR = `CASE WHEN ${IN_AREA_CONDITION}
       THEN p.village_id ELSE 0 END`;

const PERSON_VILLAGE_JOIN = `
LEFT JOIN person p
  ON p.patient_hn = nc.hn
LEFT JOIN village v
  ON v.village_id = p.village_id`;

/**
 * Person list columns, same names as the screening person queries.
 * Identity from `patient` (every case has one; `person` may be missing).
 * screen_date = case_date (date the patient became a new stage 5 case).
 * No eGFR / creatinine values, CID, phone or address.
 */
const PERSON_COLUMNS = `
       COALESCE(p.person_id, 0)                          AS person_id,
       ${VILLAGE_ID_EXPR} AS village_id,
       nc.hn                                             AS hn,
       TRIM(CONCAT(COALESCE(pt.pname, ''), COALESCE(pt.fname, ''), ' ',
                   COALESCE(pt.lname, '')))              AS full_name,
       TRIM(CONCAT(COALESCE(pt.fname, ''), ' ',
                   COALESCE(pt.lname, '')))              AS sort_name,
       CAST(pt.sex AS CHAR)                              AS sex,
       TIMESTAMPDIFF(YEAR, pt.birthday, :periodStart)    AS age,
       DATE_FORMAT(nc.case_date, '%Y-%m-%d')             AS screen_date`;

const totals = `${NEW_CASE_CTES}
SELECT COUNT(CASE WHEN nc.period = 'current'  THEN 1 END) AS current_cases,
       COUNT(CASE WHEN nc.period = 'previous' THEN 1 END) AS previous_cases,
       COUNT(CASE WHEN nc.period = 'previous'
                   AND nc.case_date <= :prevSameDayEnd THEN 1 END) AS previous_same_period
FROM nc
`;

const monthly = `${NEW_CASE_CTES}
SELECT nc.period,
       DATE_FORMAT(nc.case_date, '%Y-%m') AS bucket,
       COUNT(*)                           AS new_cases
FROM nc
GROUP BY nc.period, DATE_FORMAT(nc.case_date, '%Y-%m')
`;

const village = `${NEW_CASE_CTES}
SELECT ${VILLAGE_ID_EXPR} AS village_id,
       MAX(CASE WHEN ${IN_AREA_CONDITION}
                THEN CAST(v.village_moo AS CHAR) END) AS village_moo,
       MAX(CASE WHEN ${IN_AREA_CONDITION}
                THEN v.village_name END)              AS village_name,
       COUNT(DISTINCT CASE WHEN nc.period = 'current'  THEN nc.hn END) AS current_cases,
       COUNT(DISTINCT CASE WHEN nc.period = 'previous' THEN nc.hn END) AS previous_cases
FROM nc
${PERSON_VILLAGE_JOIN}
GROUP BY 1
`;

const personsByVillage = `${NEW_CASE_CTES}
SELECT ${PERSON_COLUMNS}
FROM nc
JOIN patient pt
  ON pt.hn = nc.hn
${PERSON_VILLAGE_JOIN}
WHERE nc.period = 'current'
  AND p.village_id = :villageId
  AND ${IN_AREA_CONDITION}
ORDER BY nc.case_date, pt.fname, pt.lname, nc.hn
LIMIT ${PERSONS_PER_VILLAGE_LIMIT + 1}
`;

const personsAll = `${NEW_CASE_CTES}
SELECT ${PERSON_COLUMNS}
FROM nc
JOIN patient pt
  ON pt.hn = nc.hn
${PERSON_VILLAGE_JOIN}
WHERE nc.period = 'current'
ORDER BY village_id, nc.case_date, pt.fname, pt.lname, nc.hn
LIMIT ${PERSONS_EXPORT_LIMIT + 1}
`;

/** ISO date shifted by whole years; 29 Feb becomes 28 Feb when needed. */
function shiftYears(isoDate: string, years: number): string {
  const y = Number(isoDate.slice(0, 4)) + years;
  const m = Number(isoDate.slice(5, 7));
  const d = Number(isoDate.slice(8, 10));
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${y}-${String(m).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`;
}

/** Window parameters derived from the selected fiscal year. */
export function ckd5Params(ctx: Ckd5SqlContext): QueryParams {
  return {
    prevStart: shiftYears(ctx.periodStart, -1),
    periodStart: ctx.periodStart,
    dataAsOf: ctx.dataAsOf,
    prevSameDayEnd: shiftYears(ctx.dataAsOf, -1),
  };
}

/** KPI Template 2569 no. 20: new CKD stage 5, current vs previous FY. */
export const CKD5_SQL: Ckd5SqlSet = {
  totals,
  monthly,
  village,
  personsByVillage,
  personsAll,
  buildParams: ckd5Params,
};
