import "server-only";

import type { QueryParams } from "@/lib/db/his";
import { HOSPITAL_HOSPCODE } from "@/lib/kpi/district-areas";
import type { PtDxCode, PtImcCode } from "@/lib/kpi/pt-clinic-types";

import { NCD_SCHEME_INDEX, NCD_SCHEME_RULES } from "./ncd-clinic-hosxp";
import { sqlCodeList } from "./screening-common";

/**
 * SQL for "คลินิกกายภาพ" (/clinic/pt): the hospital's physiotherapy service,
 * against HOSxP only (never HDC). Aggregates only: no hn / name / cid leaves
 * the database. Definitions and FY2569 verification: docs/kpi/pt-clinic.md.
 * Codes verified with db-cli (2026-11-18).
 *
 * PT is NOT counted by ovst.main_dep alone: ~30% of PT work is recorded on
 * visits registered at another department (NCD 062, OPD 061, …). A PT visit
 * is an OPD visit (ovst, vstdate in the fiscal year) with
 *   - >= 1 physic_list row (item recorded by the PT module, any main_dep), or
 *   - main_dep 027 "กายภาพบำบัด" and >= 1 PT-catalog item charged in
 *     opitemrece (orthotics / bandaging billed at the PT room without a
 *     physic_list row, ~140 visits FY2569).
 * PT charges = opitemrece.sum_price of items whose icode is in the PT
 * catalog physic_items (group 1 กายภาพบำบัด, 3 กายอุปกรณ์), on PT visits.
 * vn_stat.income (whole visit) is reported only as context: it holds drugs /
 * labs of the other clinic of the same vn (double counted with /clinic/ncd).
 * The old physic_main table stopped in Feb 2025 and is not used.
 *
 * Seven queries, run in parallel by the loader (each <= ~4 s for FY2569):
 *   PT_VISITS_SQL   visits and charges per (month, scheme)
 *   PT_COHORT_SQL   one row: distinct people per month / scheme / dx / band
 *   PT_ITEMS_SQL    PT-catalog items charged (qty, visits, baht) per icode
 *   PT_DAYS_SQL     per service date: visits, therapists, appointments
 *   PT_WAIT_SQL     one row: arrival -> first PT item (main_dep 027 visits)
 *   PT_IPD_SQL      one row: inpatient PT (physic_plan_detail with an)
 *   PT_IMC_SQL      per IMC group: discharges and PT received
 *
 * All SQL is static; only values are bound as named parameters:
 *   :periodStart  'YYYY-MM-DD'  1 Oct of the fiscal year
 *   :dataAsOf     'YYYY-MM-DD'  30 Sep of the fiscal year (inclusive)
 *   :hospcode     the hospital's own hospcode (hospmain test)
 */

// --- codes (verified with db-cli) -------------------------------------------

/** kskdepartment 027 "กายภาพบำบัด" (7,434 visits as main_dep FY2569). */
export const PT_DEPCODE = "027";

/** oapp.depcode of PT appointments (7,675 appointments FY2569). */
export const PT_APPOINTMENT_DEPCODES = [PT_DEPCODE] as const;

/** physic_items.physic_group_id: 1 กายภาพบำบัด, 2 อาชีวบำบัด (no item), 3 กายอุปกรณ์. */
export const PT_GROUP_ORTHOTIC = 3;

/** ICD-10 groups (any diagnosis of the PT visit), sargable [from, toExclusive). */
export const PT_DX: Readonly<Record<Exclude<PtDxCode, "OTHER">, readonly [string, string]>> = {
  STROKE: ["I60", "I70"], // I60–I69 cerebrovascular, incl. sequelae I69
  NEURO: ["G00", "H00"], // G00–G99 nervous system (hemiplegia G81, Parkinson G20, …)
  MSK: ["M00", "N00"], // M00–M99 musculoskeletal
  INJURY: ["S00", "U00"], // S00–T98 injury
};

const DX_KEYS = Object.keys(PT_DX) as Exclude<PtDxCode, "OTHER">[];

/**
 * IMC (intermediate care) groups on an_stat.pdx of the admission:
 * stroke I60–I64, TBI S06.1–S06.9 (S06.0 concussion left out: 70+ mild
 * cases a year, not IMC), spinal cord injury S14.0/S14.1, S24.0/S24.1,
 * S34.0/S34.1, hip fracture S72.0–S72.2.
 */
export const PT_IMC: Readonly<Record<PtImcCode, readonly (readonly [string, string])[]>> = {
  STROKE: [["I60", "I65"]],
  TBI: [["S061", "S07"]],
  SCI: [
    ["S140", "S142"],
    ["S240", "S242"],
    ["S340", "S342"],
  ],
  HIP: [["S720", "S723"]],
};

/** an_stat discharge kept as IMC denominator: ipt.dchtype 01 "With Approval" (home). */
const IMC_DCHTYPE = "01";

/** Follow-up window after discharge for an OPD PT visit (days). */
export const PT_IMC_FOLLOWUP_DAYS = 180;

/** Look-back for "new patient": no PT visit in the 365 days before 1 Oct. */
export const PT_NEW_LOOKBACK_DAYS = 365;

/** Valid arrival -> first PT item interval (minutes). */
export const PT_WAIT_MAX_MINUTES = 480;

/** Age (vn_stat.age_y) from which a person counts as elderly. */
export const PT_ELDERLY_AGE = 60;

const range = (col: string, [from, to]: readonly [string, string]) =>
  `(${col} >= '${from}' AND ${col} < '${to}')`;

// --- scheme (same rules as /clinic/ncd, imported read-only) -------------------

const OWN_MAIN = "COALESCE(vs.hospmain, '') = :hospcode";

/** CASE over NCD_SCHEME_RULES, on `pt` (pttype) and `vs` (vn_stat). */
function schemeCase(value: (index: number) => string): string {
  const whens = NCD_SCHEME_RULES.map((r, i) => {
    const main =
      r.hospmain === "own"
        ? ` AND ${OWN_MAIN}`
        : r.hospmain === "other"
          ? ` AND NOT (${OWN_MAIN})`
          : "";
    return `    WHEN pt.hipdata_code IN (${sqlCodeList(r.hipdata)})${main} THEN ${value(i)}`;
  });
  return `CASE
${whens.join("\n")}
    ELSE ${value(NCD_SCHEME_RULES.length)} END`;
}

const SCHEME_CODE_EXPR = schemeCase((i) => `'${NCD_SCHEME_INDEX[i]}'`);
const SCHEME_INDEX_EXPR = schemeCase((i) => String(i));

const CAPITATION_MASK = NCD_SCHEME_INDEX.reduce(
  (m, code, i) =>
    NCD_SCHEME_RULES.find((r) => r.code === code)?.payGroup === "CAPITATION" ? m | (1 << i) : m,
  0,
);
const FULL_MASK = ((1 << NCD_SCHEME_INDEX.length) - 1) & ~CAPITATION_MASK;

// --- shared fragments --------------------------------------------------------

const IN_FY = (col: string) =>
  `${col} >= :periodStart AND ${col} < DATE_ADD(:dataAsOf, INTERVAL 1 DAY)`;

/** icode is a PT-catalog item (physic_items may list an icode twice: IN, not JOIN). */
const PT_ITEM = (col: string) => `${col} IN (SELECT pi.icode FROM physic_items pi)`;

const HAS_PHYSIC_LIST = `EXISTS (SELECT 1 FROM physic_list l WHERE l.vn = o.vn)`;

/**
 * Derived table `p` of the PT visits: one row per vn with vn, hn, vstdate,
 * vsttime, main_dep, pttype, pt_baht (PT-catalog charges of the vn). Plan:
 * ovst range on vstdate, physic_list / opitemrece by vn (FY2569 ~3.5 s).
 * Keep the filter on one level: a nested "has_pl OR pt_baht > 0" filter
 * re-evaluates the subqueries and took ~9 s.
 */
const PT_VISITS_FROM = `(
  SELECT o.vn, o.hn, o.vstdate, o.vsttime, o.main_dep, o.pttype,
         COALESCE((SELECT SUM(op.sum_price)
                     FROM opitemrece op
                    WHERE op.vn = o.vn
                      AND ${PT_ITEM("op.icode")}), 0) AS pt_baht
  FROM ovst o
  WHERE ${IN_FY("o.vstdate")}
    AND (${HAS_PHYSIC_LIST}
         OR (o.main_dep = '${PT_DEPCODE}'
             AND EXISTS (SELECT 1 FROM opitemrece op
                          WHERE op.vn = o.vn
                            AND ${PT_ITEM("op.icode")})))
)`;

// --- 1. visits and charges ---------------------------------------------------

/**
 * Per (month of vstdate, scheme): visits, visits registered at 027,
 * pt_baht (PT-catalog charges), and the whole-visit charges of vn_stat
 * (income / inc12 drugs / inc03 lab / inc04 x-ray / paid_money) as context.
 */
export const PT_VISITS_SQL = `
SELECT DATE_FORMAT(p.vstdate, '%Y-%m')      AS ym,
       ${SCHEME_CODE_EXPR} AS scheme_code,
       COUNT(*)                              AS visits,
       SUM(p.main_dep = '${PT_DEPCODE}')     AS dep_visits,
       SUM(p.pt_baht)                        AS pt_baht,
       SUM(COALESCE(vs.income, 0))           AS visit_baht,
       SUM(COALESCE(vs.inc12, 0))            AS drug_baht,
       SUM(COALESCE(vs.inc03, 0))            AS lab_baht,
       SUM(COALESCE(vs.inc04, 0))            AS xray_baht,
       SUM(COALESCE(vs.paid_money, 0))       AS paid_baht
FROM ${PT_VISITS_FROM} p
LEFT JOIN vn_stat vs
  ON vs.vn = p.vn
LEFT JOIN pttype pt
  ON pt.pttype = p.pttype
GROUP BY ym, scheme_code
ORDER BY ym, scheme_code
`;

// --- 2. cohort ----------------------------------------------------------------

const MONTH_COLUMNS = Array.from(
  { length: 12 },
  (_, i) => `       SUM((c.month_mask & ${1 << i}) <> 0) AS m${i},`,
).join("\n");

const SCHEME_COLUMNS = NCD_SCHEME_INDEX.map(
  (_, i) => `       SUM((c.scheme_mask & ${1 << i}) <> 0) AS s${i},`,
).join("\n");

/** Bit i of dx_mask = DX_KEYS[i] on any diagnosis (ovstdiag) of the visit. */
const DX_MASK_EXPR = `COALESCE((SELECT BIT_OR(CASE
${DX_KEYS.map((k, i) => `             WHEN ${range("d.icd10", PT_DX[k])} THEN ${1 << i}`).join("\n")}
             ELSE 0 END)
           FROM ovstdiag d
          WHERE d.vn = p.vn), 0)`;

/**
 * One row. Cohort = distinct hn with >= 1 PT visit in the fiscal year.
 *  - persons, m0..m11 (people per fiscal month, 0 = Oct), s0..s9 (people
 *    per scheme NCD_SCHEME_INDEX[i]), pay_full / pay_capitation
 *  - stroke / neuro / msk / injury: people with the group on any PT visit
 *    (groups overlap); dx_other = none of them; *_visits = visits
 *  - elderly: people aged >= 60 at a PT visit (vn_stat.age_y)
 *  - new_persons: no PT visit (physic_list) in the 365 days before 1 Oct
 *  - band_1 / band_2_5 / band_6_10 / band_11: people by PT visits in the year
 */
export const PT_COHORT_SQL = `
SELECT COUNT(*) AS persons,
${MONTH_COLUMNS}
${SCHEME_COLUMNS}
       SUM((c.scheme_mask & ${FULL_MASK}) <> 0)       AS pay_full,
       SUM((c.scheme_mask & ${CAPITATION_MASK}) <> 0) AS pay_capitation,
${DX_KEYS.map(
  (k, i) => `       SUM((c.dx_mask & ${1 << i}) <> 0) AS ${k.toLowerCase()},
       SUM(c.${k.toLowerCase()}_visits) AS ${k.toLowerCase()}_visits,`,
).join("\n")}
       SUM(c.dx_mask = 0) AS dx_other,
       SUM(c.other_visits) AS dx_other_visits,
       SUM(c.elderly) AS elderly,
       SUM(c.visits = 1) AS band_1,
       SUM(c.visits BETWEEN 2 AND 5) AS band_2_5,
       SUM(c.visits BETWEEN 6 AND 10) AS band_6_10,
       SUM(c.visits > 10) AS band_11,
       SUM(NOT EXISTS (
         SELECT 1
         FROM ovst o2
         JOIN physic_list l2
           ON l2.vn = o2.vn
         WHERE o2.hn = c.hn
           AND o2.vstdate >= DATE_SUB(:periodStart, INTERVAL ${PT_NEW_LOOKBACK_DAYS} DAY)
           AND o2.vstdate < :periodStart)) AS new_persons
FROM (
  SELECT v.hn,
         COUNT(*) AS visits,
         BIT_OR(1 << v.mi) AS month_mask,
         BIT_OR(1 << v.si) AS scheme_mask,
         BIT_OR(v.dx) AS dx_mask,
${DX_KEYS.map((_, i) => `         SUM((v.dx & ${1 << i}) <> 0) AS ${DX_KEYS[i].toLowerCase()}_visits,`).join("\n")}
         SUM(v.dx = 0) AS other_visits,
         MAX(COALESCE(v.age_y, 0) >= ${PT_ELDERLY_AGE}) AS elderly
  FROM (
    SELECT p.hn,
           PERIOD_DIFF(DATE_FORMAT(p.vstdate, '%Y%m'), DATE_FORMAT(:periodStart, '%Y%m')) AS mi,
           ${SCHEME_INDEX_EXPR} AS si,
           ${DX_MASK_EXPR} AS dx,
           vs.age_y
    FROM ${PT_VISITS_FROM} p
    LEFT JOIN vn_stat vs
      ON vs.vn = p.vn
    LEFT JOIN pttype pt
      ON pt.pttype = p.pttype
  ) v
  GROUP BY v.hn
) c
`;

// --- 3. items -----------------------------------------------------------------

/**
 * PT-catalog items charged on PT visits, per icode: item name
 * (nondrugitems), catalog group (1 PT / 3 orthotic), rows, qty, visits,
 * persons, baht. ~60 rows. STRAIGHT_JOIN keeps ovst (by vstdate) first:
 * otherwise the plan starts from opitemrece by icode over all years (~13 s).
 */
export const PT_ITEMS_SQL = `
SELECT STRAIGHT_JOIN
       op.icode                          AS icode,
       MAX(n.name)                       AS item_name,
       MAX(n.income)                     AS income,
       (SELECT MAX(pi.physic_group_id) FROM physic_items pi WHERE pi.icode = op.icode) AS grp,
       SUM(COALESCE(op.qty, 0))          AS qty,
       COUNT(DISTINCT p.vn)              AS visits,
       COUNT(DISTINCT p.hn)              AS persons,
       SUM(COALESCE(op.sum_price, 0))    AS baht
FROM ${PT_VISITS_FROM} p
JOIN opitemrece op
  ON op.vn = p.vn
 AND ${PT_ITEM("op.icode")}
LEFT JOIN nondrugitems n
  ON n.icode = op.icode
GROUP BY op.icode
ORDER BY baht DESC
`;

// --- 4. days -------------------------------------------------------------------

/**
 * Per service date (and a ROLLUP row with d = NULL for the year):
 *  - visits, persons     PT visits
 *  - therapists          distinct physic_list.doctor (doctor_position 9
 *                        เจ้าหน้าที่กายภาพ) of the date's PT visits
 *  - therapist_visits    distinct (vn, therapist) pairs
 *  - appts / appts_kept  oapp of the PT department for the date (nextdate),
 *                        kept = visit_vn set
 */
export const PT_DAYS_SQL = `
SELECT x.d                     AS d,
       SUM(x.visits)           AS visits,
       SUM(x.therapists)       AS therapists,
       SUM(x.therapist_visits) AS therapist_visits,
       SUM(x.appts)            AS appts,
       SUM(x.appts_kept)       AS appts_kept
FROM (
  SELECT DATE_FORMAT(p.vstdate, '%Y-%m-%d')                AS d,
         COUNT(DISTINCT p.vn)                             AS visits,
         COUNT(DISTINCT l.doctor)                         AS therapists,
         COUNT(DISTINCT IF(l.doctor IS NULL, NULL, CONCAT(p.vn, '|', l.doctor))) AS therapist_visits,
         0 AS appts,
         0 AS appts_kept
  FROM ${PT_VISITS_FROM} p
  LEFT JOIN physic_list l
    ON l.vn = p.vn
   AND l.doctor IS NOT NULL
   AND l.doctor <> ''
  GROUP BY p.vstdate WITH ROLLUP
  UNION ALL
  SELECT DATE_FORMAT(a.nextdate, '%Y-%m-%d'), 0, 0, 0,
         COUNT(*),
         SUM(a.visit_vn IS NOT NULL AND a.visit_vn <> '')
  FROM oapp a
  WHERE a.depcode IN (${sqlCodeList(PT_APPOINTMENT_DEPCODES)})
    AND a.nextdate >= :periodStart
    AND a.nextdate <= :dataAsOf
  GROUP BY a.nextdate
) x
GROUP BY x.d
ORDER BY x.d
`;

// --- 5. waiting time -------------------------------------------------------------

/**
 * One row. Visits registered at the PT room (main_dep 027) with a
 * physic_list row, today left out: minutes from arrival (vstdate +
 * vsttime) to the first PT item (MIN physic_list.begin_datetime); valid =
 * 0..480. Visits of other departments are left out: their PT comes after
 * the other clinic (mean ~3 h), not a PT queue. physic_list end_datetime is
 * stamped with begin (median ~1 minute), so treatment time is not measured.
 * Columns: visits, measured, mean_min, median_min, p90_min, within_30,
 * within_60.
 */
export const PT_WAIT_SQL = `
SELECT COUNT(*)                                     AS visits,
       SUM(w.ok)                                    AS measured,
       ROUND(AVG(IF(w.ok = 1, w.m, NULL)), 1)       AS mean_min,
       ROUND(MAX(w.med), 1)                         AS median_min,
       ROUND(MAX(w.p90), 1)                         AS p90_min,
       SUM(w.ok = 1 AND w.m <= 30)                  AS within_30,
       SUM(w.ok = 1 AND w.m <= 60)                  AS within_60
FROM (
  SELECT y.m, y.ok,
         MEDIAN(IF(y.ok = 1, y.m, NULL)) OVER () AS med,
         PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY IF(y.ok = 1, y.m, NULL)) OVER () AS p90
  FROM (
    SELECT x.m, IF(x.m BETWEEN 0 AND ${PT_WAIT_MAX_MINUTES}, 1, 0) AS ok
    FROM (
      SELECT TIMESTAMPDIFF(SECOND, TIMESTAMP(o.vstdate, o.vsttime),
                           (SELECT MIN(l.begin_datetime) FROM physic_list l WHERE l.vn = o.vn)) / 60 AS m
      FROM ovst o
      WHERE ${IN_FY("o.vstdate")}
        AND o.vstdate < CURDATE()
        AND o.main_dep = '${PT_DEPCODE}'
        AND ${HAS_PHYSIC_LIST}
    ) x
  ) y
) w
`;

// --- 6. inpatient PT ----------------------------------------------------------------

/**
 * One row. Inpatient PT = physic_plan_detail rows with an (ward requests
 * served by PT), physic_plan_detail_ser_date in the fiscal year.
 * admissions, persons (physic_plan.hn), sessions (distinct an + date),
 * items (rows), qty, baht (physic_plan_detail_price; = PT-catalog
 * opitemrece of those an, checked FY2569: 0.303 vs 0.308 M). Not part of
 * the OPD totals: IPD is paid by DRG, not per item.
 */
export const PT_IPD_SQL = `
SELECT COUNT(DISTINCT d.an)                                 AS admissions,
       COUNT(DISTINCT pp.hn)                                AS persons,
       COUNT(DISTINCT d.an, d.physic_plan_detail_ser_date)  AS sessions,
       COUNT(*)                                             AS items,
       SUM(COALESCE(d.physic_plan_detail_qty, 0))           AS qty,
       SUM(COALESCE(d.physic_plan_detail_price, 0))         AS baht
FROM physic_plan_detail d
LEFT JOIN physic_plan pp
  ON pp.physic_plan_id = d.physic_plan_id
WHERE d.an IS NOT NULL
  AND d.an <> ''
  AND ${IN_FY("d.physic_plan_detail_ser_date")}
`;

// --- 7. IMC -------------------------------------------------------------------------

const IMC_KEYS = Object.keys(PT_IMC) as PtImcCode[];

const IMC_CASE = `CASE
${IMC_KEYS.map((k) => `    WHEN ${PT_IMC[k].map((r) => range("a.pdx", r)).join(" OR ")} THEN '${k}'`).join("\n")}
  END`;

const IMC_ANY = IMC_KEYS.flatMap((k) => PT_IMC[k].map((r) => range("a.pdx", r))).join("\n     OR ");

const IPD_PT = `EXISTS (SELECT 1 FROM physic_plan_detail d WHERE d.an = a.an)`;
const OPD_PT_AFTER = `EXISTS (
         SELECT 1
         FROM ovst o2
         JOIN physic_list l2
           ON l2.vn = o2.vn
         WHERE o2.hn = a.hn
           AND o2.vstdate > a.dchdate
           AND o2.vstdate <= DATE_ADD(a.dchdate, INTERVAL ${PT_IMC_FOLLOWUP_DAYS} DAY))`;

/**
 * Per IMC group: admissions discharged home (ipt.dchtype 01) in the fiscal
 * year with an IMC pdx (PT_IMC), persons, and those with PT during the
 * stay (physic_plan_detail.an) / an OPD PT visit within 180 days after
 * discharge / either. Plan: an_stat scan (~100k rows), ovst by
 * (hn, vstdate) per admission (FY2569 ~0.2 s).
 */
export const PT_IMC_SQL = `
SELECT ${IMC_CASE} AS grp,
       COUNT(*)                       AS admissions,
       COUNT(DISTINCT a.hn)           AS persons,
       SUM(${IPD_PT})                 AS ipd_pt,
       SUM(${OPD_PT_AFTER})           AS opd_pt,
       SUM(${IPD_PT} OR ${OPD_PT_AFTER}) AS any_pt,
       SUM(DATEDIFF(CURDATE(), a.dchdate) < ${PT_IMC_FOLLOWUP_DAYS}) AS open_window
FROM an_stat a
JOIN ipt i
  ON i.an = a.an
WHERE ${IN_FY("a.dchdate")}
  AND i.dchtype = '${IMC_DCHTYPE}'
  AND (${IMC_ANY})
GROUP BY grp
`;

export function ptClinicParams(periodStart: string, dataAsOf: string): QueryParams {
  return { periodStart, dataAsOf, hospcode: HOSPITAL_HOSPCODE };
}
