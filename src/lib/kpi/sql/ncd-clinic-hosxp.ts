import "server-only";

import type { QueryParams } from "@/lib/db/his";
import { HOSPITAL_HOSPCODE } from "@/lib/kpi/district-areas";

import { SCHEME_CODE_EXPR, SCHEME_INDEX_EXPR, schemePersonColumns } from "./clinic-scheme-hosxp";
import { sqlCodeList } from "./screening-common";

/**
 * SQL for "คลินิกโรคเรื้อรัง" (/clinic/ncd): the hospital's chronic-disease clinic
 * (DM / HT / DLP / asthma-COPD), quality indicators and charges, against
 * HOSxP only (never HDC). Aggregates only: no hn / name / cid leaves the
 * database. Definitions and FY2569 verification: docs/kpi/ncd-clinic.md.
 * Codes verified with db-cli (2026-11-18).
 *
 * Five queries, run in parallel by the loader (each 2.5–9 s for FY2569):
 *   NCD_VISITS_SQL   visits and charges per (month, scheme)
 *   NCD_COHORT_SQL   one row: distinct people (per month / scheme / pay
 *                    group / disease) and every quality count
 *   NCD_DAYS_SQL     per clinic date: visits, physicians, appointments
 *   NCD_WAIT_SQL     waiting-time histogram, with / without lab
 *   NCD_HOSXP_STEPS_SQL  5 steps of the HOSxP waiting-time report (one row)
 * A CTE referenced more than once is re-evaluated by MariaDB, so each
 * query reads the clinic visits exactly once.
 *
 * All SQL is static: code lists are source constants validated by
 * sqlCodeList / sqlIntList; only values are bound as named parameters:
 *   :periodStart  'YYYY-MM-DD'  1 Oct of the fiscal year
 *   :dataAsOf     'YYYY-MM-DD'  30 Sep of the fiscal year (inclusive)
 *   :hospcode     the hospital's own hospcode (hospmain test)
 *
 * Every query starts from ovst by vstdate (ix_vstdate) or from a
 * date-bounded lab / screening / appointment table; lookups (vn_stat,
 * pttype, doctor) are LEFT JOINed so they never drive the plan (see
 * overview-hosxp.ts: ovst JOIN pttype otherwise scans from pttype).
 */

// --- codes (verified with db-cli) -------------------------------------------

/**
 * ovst.main_dep of the NCD clinic: 062 "จุดซักประวัติโรคไม่ติดต่อเรื้อรัง"
 * (~27.9k visits FY2569; the clinic's screening point, where every clinic
 * visit is registered) and 047 "ห้องตรวจโรค NCD" (the clinic's doctor
 * room, 6 visits as main_dep). PCU clinics (031/032/037/038) are other
 * units and are not counted.
 */
export const NCD_DEPCODES = ["062", "047"] as const;

/** ICD-10 groups of the clinic, sargable string ranges [from, toExclusive). */
export const NCD_ICD = {
  DM: ["E10", "E15"], // E10–E14
  HT: ["I10", "I16"], // I10–I15
  DLP: ["E78", "E79"], // E78
  ASTHMA: ["J44", "J47"], // J44 COPD, J45 asthma, J46 status asthmaticus
} as const;

type IcdGroup = keyof typeof NCD_ICD;

const icdIn = (col: string, g: IcdGroup) =>
  `(${col} >= '${NCD_ICD[g][0]}' AND ${col} < '${NCD_ICD[g][1]}')`;

/** lab_order.lab_items_code (int), verified in lab_items (name / provis_labcode). */
export const NCD_LAB = {
  /** 334 'HbA1c' (0531601). */
  HBA1C: [334],
  /** 876 'LDL-C' calculated, 92 'DLDL-C' direct (0541402). */
  LDL: [876, 92],
  /** 78 'Creatinine' serum, 1055 'Cr' (0581902). */
  CR: [78, 1055],
  /** 921 'eGFR' (0581904), reported with every serum creatinine. */
  EGFR: [921],
  /** 241 'Potassium (K)' (0511402). */
  K: [241],
  /** 76 'Glucose (FBS)', 817 '(N)Glucose(FBS)' (0531002, venous plasma). */
  FBS: [76, 817],
  /** 377 'Urine Microalbumin' (0440204), 1038 'Urine Microalbumin/Creatinine' (UACR). */
  UACR: [377, 1038],
  /** 102 'Cholesterol' (0541602). */
  CHOL: [102],
  /** 306 'Glucose (Meter)' = capillary DTX recorded as a lab item. */
  DTX: [306],
} as const;

type LabGroup = keyof typeof NCD_LAB;

/** Renders constant integer codes as an unquoted SQL IN list (int column). */
function sqlIntList(codes: readonly number[]): string {
  if (codes.length === 0) throw new Error("empty code list");
  for (const c of codes) {
    if (!Number.isSafeInteger(c) || c < 0) throw new Error(`invalid integer code: ${c}`);
  }
  return codes.join(", ");
}

/** doctor.position_id of physicians (doctor_position 1 'แพทย์'; 2 = dentist). */
const PHYSICIAN_POSITION_ID = 1;

/** HbA1c tests NHSO pays per person per fiscal year (tests beyond = excess). */
export const NCD_HBA1C_BILLABLE_PER_YEAR = 2;

/** Waiting-time histogram bucket width (minutes) and the plausible maximum. */
export const WAIT_BUCKET_MINUTES = 10;
export const WAIT_MAX_MINUTES = 720;

// --- shared fragments --------------------------------------------------------

const IN_FY = (col: string) =>
  `${col} >= :periodStart AND ${col} < DATE_ADD(:dataAsOf, INTERVAL 1 DAY)`;

const NCD_VISIT_WHERE = `o.main_dep IN (${sqlCodeList(NCD_DEPCODES)})
    AND ${IN_FY("o.vstdate")}`;

/** 1 when the visit has any lab order (lab_head.vn, indexed). */
const HAS_LAB = `EXISTS (SELECT 1 FROM lab_head h WHERE h.vn = o.vn)`;

const hasLabItem = (codes: readonly number[]) => `EXISTS (
         SELECT 1 FROM lab_head h
         JOIN lab_order lo
           ON lo.lab_order_number = h.lab_order_number
          AND lo.lab_items_code IN (${sqlIntList(codes)})
         WHERE h.vn = o.vn)`;

// --- 1. visits and charges ---------------------------------------------------

/**
 * Visits and charges per (month of ovst.vstdate, scheme):
 *  - visits      ovst rows of the NCD clinic (main_dep) in the fiscal year
 *  - lab_visits  visits with any lab order on the same vn
 *  - fbs_visits  visits with a venous FBS lab item (NCD_LAB.FBS)
 *  - dtx_visits  visits with a capillary glucose lab item (NCD_LAB.DTX)
 *  - baht        vn_stat.income = every charge of the visit (= SUM
 *                opitemrece.sum_price, checked FY2569: 42.43 M both ways)
 *  - drug_baht   vn_stat.inc12 (income_group 12: income 03/04/17/20 ยา)
 *  - lab_baht    vn_stat.inc03 (income_group 03: income 07 ตรวจทางเทคนิค
 *                การแพทย์และพยาธิวิทยา)
 *  - xray_baht   vn_stat.inc04 (income_group 04: income 08 รังสีวิทยา)
 *  - paid_baht   vn_stat.paid_money (paid by the patient)
 * -> one row per (ym, scheme_code) with any visit (~100 rows).
 */
export const NCD_VISITS_SQL = `
SELECT DATE_FORMAT(o.vstdate, '%Y-%m')      AS ym,
       ${SCHEME_CODE_EXPR} AS scheme_code,
       COUNT(*)                              AS visits,
       SUM(${HAS_LAB})                       AS lab_visits,
       SUM(${hasLabItem(NCD_LAB.FBS)})       AS fbs_visits,
       SUM(${hasLabItem(NCD_LAB.DTX)})       AS dtx_visits,
       SUM(COALESCE(vs.income, 0))           AS baht,
       SUM(COALESCE(vs.inc12, 0))            AS drug_baht,
       SUM(COALESCE(vs.inc03, 0))            AS lab_baht,
       SUM(COALESCE(vs.inc04, 0))            AS xray_baht,
       SUM(COALESCE(vs.paid_money, 0))       AS paid_baht
FROM ovst o
LEFT JOIN vn_stat vs
  ON vs.vn = o.vn
LEFT JOIN pttype pt
  ON pt.pttype = o.pttype
WHERE ${NCD_VISIT_WHERE}
GROUP BY ym, scheme_code
ORDER BY ym, scheme_code
`;

// --- 2. cohort: people and quality (one row) --------------------------------------

const NUMERIC_RESULT = `TRIM(lo.lab_order_result) REGEXP '^[0-9]+([.][0-9]+)?$'`;

const QUALITY_LAB_GROUPS = (Object.keys(NCD_LAB) as LabGroup[]).filter((g) => g !== "DTX");

const LAB_GROUP_EXPR = `CASE
${QUALITY_LAB_GROUPS.map(
  (g) => `             WHEN lo.lab_items_code IN (${sqlIntList(NCD_LAB[g])}) THEN '${g}'`,
).join("\n")}
           END`;

const QUALITY_LAB_CODES = QUALITY_LAB_GROUPS.flatMap((g) => NCD_LAB[g]);

const MONTH_COLUMNS = Array.from(
  { length: 12 },
  (_, i) => `  SUM((c.month_mask & ${1 << i}) <> 0) AS m${i},`,
).join("\n");

const DX_GROUPS = Object.keys(NCD_ICD) as IcdGroup[];

/**
 * The clinic's people and quality of care, one row. Cohort = distinct hn
 * with >= 1 NCD-clinic visit in the fiscal year.
 *
 * People (each person counted once per breakdown; breakdowns overlap):
 *  - m0..m11   people with a visit in fiscal month i (0 = Oct)
 *  - s0..s9    people with a visit under scheme CLINIC_SCHEME_INDEX[i]
 *              (scheme rules: ./clinic-scheme-hosxp.ts)
 *  - pay_full / pay_capitation  same, per pay group
 *  - dm / ht / dlp / asthma     people with the ICD-10 group (NCD_ICD) on
 *    any clinic visit (ovstdiag, any diagtype); dx_other = none of them;
 *    dmht = DM and HT; *_visits = visits carrying the group
 *
 * Quality (DM / HT people of the cohort). Labs are counted per person over
 * the whole fiscal year and any visit (lab_head.hn + order_date, as RLU),
 * with a non-empty result; HbA1c / LDL values must be numeric:
 *  - dm_a1c_tests  distinct HbA1c order dates per person, summed
 *  - a1c_last / ldl_last  latest numeric result (order_date, then
 *                  lab_order_number)
 *  - dm_a1c_rep90_tests  HbA1c tests < 90 days after the person's previous
 *                  test (KPI Template 30.2)
 *  - BP            latest NCD-clinic visit with opdscreen bps > 0 and
 *                  bpd > 0 (one reading; HDC uses the last two)
 *  - eye / foot    cm_dm_cmbty_screen (DM complication screening) in the
 *                  fiscal year with do_eye_screen / do_foot_screen = 'Y'
 *  - ckd screen    eGFR and urine microalbumin / UACR in the year
 */
export const NCD_COHORT_SQL = `
WITH v AS (
  SELECT o.vn, o.hn, s.bps, s.bpd,
         PERIOD_DIFF(DATE_FORMAT(o.vstdate, '%Y%m'), DATE_FORMAT(:periodStart, '%Y%m')) AS mi,
         ${SCHEME_INDEX_EXPR} AS si,
         ROW_NUMBER() OVER (PARTITION BY o.hn, (s.bps > 0 AND s.bpd > 0)
                            ORDER BY o.vstdate DESC, o.vsttime DESC, o.vn DESC) AS bp_rn
  FROM ovst o
  LEFT JOIN vn_stat vs
    ON vs.vn = o.vn
  LEFT JOIN pttype pt
    ON pt.pttype = o.pttype
  LEFT JOIN opdscreen s
    ON s.vn = o.vn
  WHERE ${NCD_VISIT_WHERE}
),
c AS (
  SELECT v.hn,
         BIT_OR(1 << v.mi) AS month_mask,
         BIT_OR(1 << v.si) AS scheme_mask,
${DX_GROUPS.map(
  (g) => `         COALESCE(MAX(dx.${g.toLowerCase()}), 0) AS ${g.toLowerCase()},
         SUM(COALESCE(dx.${g.toLowerCase()}, 0)) AS ${g.toLowerCase()}_visits,`,
).join("\n")}
         SUM(dx.vn IS NULL) AS other_visits,
         SUM(COALESCE(dx.dm, 0) AND COALESCE(dx.ht, 0)) AS dmht_visits,
         MAX(IF(v.bp_rn = 1 AND v.bps > 0 AND v.bpd > 0, v.bps, NULL)) AS bps,
         MAX(IF(v.bp_rn = 1 AND v.bps > 0 AND v.bpd > 0, v.bpd, NULL)) AS bpd
  FROM v
  LEFT JOIN (
    SELECT d.vn,
${DX_GROUPS.map((g) => `           MAX(${icdIn("d.icd10", g)}) AS ${g.toLowerCase()}`).join(",\n")}
    FROM ovstdiag d
    WHERE ${IN_FY("d.vstdate")}
      AND (${DX_GROUPS.map((g) => icdIn("d.icd10", g)).join("\n        OR ")})
    GROUP BY d.vn
  ) dx
    ON dx.vn = v.vn
  GROUP BY v.hn
),
l AS (
  SELECT h.hn, h.order_date, h.lab_order_number,
         ${LAB_GROUP_EXPR} AS grp,
         ${NUMERIC_RESULT} AS num_ok,
         TRIM(lo.lab_order_result) + 0 AS val
  FROM lab_head h
  JOIN lab_order lo
    ON lo.lab_order_number = h.lab_order_number
  WHERE ${IN_FY("h.order_date")}
    AND lo.lab_items_code IN (${sqlIntList(QUALITY_LAB_CODES)})
    AND TRIM(COALESCE(lo.lab_order_result, '')) <> ''
),
lp AS (
  SELECT y.hn,
         COUNT(DISTINCT IF(y.grp = 'HBA1C' AND y.num_ok, y.order_date, NULL)) AS a1c_n,
         SUM(y.grp = 'HBA1C' AND y.num_ok AND y.prev_a1c IS NOT NULL
             AND DATEDIFF(y.order_date, y.prev_a1c) < 90)                       AS a1c_rep90,
         MAX(IF(y.grp = 'HBA1C' AND y.num_ok AND y.rn = 1, y.val, NULL))      AS a1c_last,
         MAX(IF(y.grp = 'LDL' AND y.num_ok AND y.rn = 1, y.val, NULL))        AS ldl_last,
         MAX(y.grp = 'CR')   AS cr_t,
         MAX(y.grp = 'EGFR') AS egfr_t,
         MAX(y.grp = 'K')    AS k_t,
         MAX(y.grp = 'FBS')  AS fbs_t,
         MAX(y.grp = 'UACR') AS uacr_t,
         MAX(y.grp = 'CHOL') AS chol_t
  FROM (
    SELECT l.*,
           ROW_NUMBER() OVER (PARTITION BY l.hn, l.grp, l.num_ok
                              ORDER BY l.order_date DESC, l.lab_order_number DESC) AS rn,
           -- previous HbA1c test date of the person, one row per test date
           CASE WHEN l.grp = 'HBA1C' AND l.num_ok
                 AND l.lab_order_number = MIN(l.lab_order_number)
                       OVER (PARTITION BY l.hn, l.grp, l.num_ok, l.order_date)
                THEN LAG(l.order_date) OVER (PARTITION BY l.hn, l.grp, l.num_ok
                                             ORDER BY l.order_date, l.lab_order_number)
           END AS prev_a1c
    FROM l
  ) y
  GROUP BY y.hn
),
scr AS (
  SELECT s.hn,
         MAX(s.do_eye_screen = 'Y')  AS eye,
         MAX(s.do_foot_screen = 'Y') AS foot
  FROM cm_dm_cmbty_screen s
  WHERE ${IN_FY("s.screen_date")}
  GROUP BY s.hn
)
SELECT
  COUNT(*)                                                    AS persons,
${MONTH_COLUMNS}
${schemePersonColumns()}
${DX_GROUPS.map(
  (g) => `  SUM(c.${g.toLowerCase()}) AS ${g.toLowerCase()}, SUM(c.${g.toLowerCase()}_visits) AS ${g.toLowerCase()}_visits,`,
).join("\n")}
  SUM(${DX_GROUPS.map((g) => `c.${g.toLowerCase()}`).join(" + ")} = 0) AS dx_other,
  SUM(c.other_visits)                                         AS dx_other_visits,
  SUM(c.dm AND c.ht)                                          AS dmht,
  SUM(c.dmht_visits)                                          AS dmht_visits,
  SUM(c.dm AND lp.a1c_n >= 1)                                 AS dm_a1c,
  SUM(c.dm AND lp.a1c_last < 7)                               AS dm_a1c_lt7,
  SUM(c.dm AND lp.a1c_n > ${NCD_HBA1C_BILLABLE_PER_YEAR})     AS dm_a1c_gt2,
  SUM(IF(c.dm AND lp.a1c_n > ${NCD_HBA1C_BILLABLE_PER_YEAR},
         lp.a1c_n - ${NCD_HBA1C_BILLABLE_PER_YEAR}, 0))               AS dm_a1c_excess_tests,
  SUM(IF(c.dm, COALESCE(lp.a1c_n, 0), 0))                     AS dm_a1c_tests,
  SUM(IF(c.dm, COALESCE(lp.a1c_rep90, 0), 0))                 AS dm_a1c_rep90_tests,
  SUM(c.dm AND lp.ldl_last IS NOT NULL)                       AS dm_ldl,
  SUM(c.dm AND lp.ldl_last < 100)                             AS dm_ldl_lt100,
  SUM(c.dm AND lp.cr_t)                                       AS dm_cr,
  SUM(c.dm AND lp.k_t)                                        AS dm_k,
  SUM(c.dm AND lp.fbs_t)                                      AS dm_fbs,
  SUM(c.dm AND lp.uacr_t)                                     AS dm_uacr,
  SUM(c.dm AND lp.chol_t)                                     AS dm_chol,
  SUM(c.dm AND lp.a1c_n >= 1 AND lp.ldl_last IS NOT NULL
      AND lp.cr_t AND lp.k_t AND lp.fbs_t)                    AS dm_panel,
  SUM(c.dm AND scr.eye)                                       AS dm_eye,
  SUM(c.dm AND scr.foot)                                      AS dm_foot,
  SUM(c.ht AND c.bps IS NOT NULL)                             AS ht_bp,
  SUM(c.ht AND c.bps < 140 AND c.bpd < 90)                    AS ht_bp_ctrl,
  SUM(c.dm OR c.ht)                                           AS dmht_any,
  SUM((c.dm OR c.ht) AND lp.egfr_t AND lp.uacr_t)             AS dmht_ckd_screen
FROM c
LEFT JOIN lp
  ON lp.hn = c.hn
LEFT JOIN scr
  ON scr.hn = c.hn
`;

// --- 3. clinic days: workload and appointments --------------------------------

/**
 * One row per date with clinic visits or clinic appointments, plus one
 * WITH ROLLUP row (d = NULL) for the whole year:
 *  - visits       NCD-clinic visits that day
 *  - physicians   distinct physicians (ovst.doctor with doctor.position_id
 *                 = 1) on those visits; on the NULL row = distinct in the year
 *  - phys_visits  visits seen by a physician
 *  - appts        oapp rows with depcode in NCD_DEPCODES and nextdate = day
 *  - appts_kept   of those, appointments with a visit (oapp.visit_vn set)
 * -> ~240 rows (dates only, no person data).
 */
export const NCD_DAYS_SQL = `
SELECT x.d                     AS d,
       SUM(x.visits)           AS visits,
       SUM(x.physicians)       AS physicians,
       SUM(x.phys_visits)      AS phys_visits,
       SUM(x.appts)            AS appts,
       SUM(x.appts_kept)       AS appts_kept
FROM (
  SELECT DATE_FORMAT(v.vstdate, '%Y-%m-%d')                  AS d,
         COUNT(*)                                           AS visits,
         COUNT(DISTINCT IF(d.code IS NULL, NULL, v.doctor)) AS physicians,
         SUM(d.code IS NOT NULL)                            AS phys_visits,
         0 AS appts,
         0 AS appts_kept
  FROM (
    SELECT o.vstdate, o.doctor
    FROM ovst o
    WHERE ${NCD_VISIT_WHERE}
  ) v
  LEFT JOIN doctor d
    ON d.code = v.doctor
   AND d.position_id = ${PHYSICIAN_POSITION_ID}
  GROUP BY v.vstdate WITH ROLLUP
  UNION ALL
  SELECT DATE_FORMAT(a.nextdate, '%Y-%m-%d'), 0, 0, 0,
         COUNT(*),
         SUM(a.visit_vn IS NOT NULL AND a.visit_vn <> '')
  FROM oapp a
  WHERE a.depcode IN (${sqlCodeList(NCD_DEPCODES)})
    AND a.nextdate >= :periodStart
    AND a.nextdate <= :dataAsOf
  GROUP BY a.nextdate
) x
GROUP BY x.d
ORDER BY x.d
`;

// --- 4. waiting time -------------------------------------------------------------

/**
 * Waiting-time measures, from service_time (HOSxP queue timestamps, one
 * row per vn; FY2569 every clinic visit has one). ovst.vsttime = arrival /
 * registration (patients queue from ~06:00 for fasting blood).
 */
export const NCD_WAIT_MEASURES = {
  /**
   * Arrival -> doctor exam finished. service2 (dep 047 for 93% of clinic
   * visits) is stamped when the doctor room sends the patient on: it equals
   * ovst_service_time OPD-DOCTOR service_end_datetime (+-1 min) for 92% of
   * FY2570 visits. The exam itself is short (median 1.5 min), so this is
   * effectively "seen by the doctor".
   */
  DOCTOR: ["o.vsttime", "s.service2"],
  /** Arrival -> drugs dispensed (service7; dep 013 pharmacy). */
  PHARMACY: ["o.vsttime", "s.service7"],
  /** Screening finished (service1 = OPD-SCREEN end at 062) -> doctor exam finished. */
  SCREEN_TO_DOCTOR: ["s.service1", "s.service2"],
} as const;

export type NcdWaitMeasure = keyof typeof NCD_WAIT_MEASURES;

const WAIT_KEYS = Object.keys(NCD_WAIT_MEASURES) as NcdWaitMeasure[];

/**
 * Waiting-time histogram per (measure, has_lab = any lab order on the vn,
 * bucket = FLOOR(minutes / WAIT_BUCKET_MINUTES)); bucket NULL = missing
 * timestamp, negative or more than WAIT_MAX_MINUTES (not measured; FY2569
 * ~3% to the doctor, ~4% to the pharmacy). Each visit appears once per
 * measure, so the counts of a (measure, has_lab) add up to its visits.
 * Today's visits are left out (o.vstdate < CURDATE()): patients still
 * waiting have no service2 / service7 yet, so only the quick ones would be
 * measured (2026-11-18 midday: 52 of 134 visits without service2).
 * One pass over the visits (CROSS JOIN with the measure list).
 * -> ~350 rows; medians are computed in TS.
 */
export const NCD_WAIT_SQL = `
SELECT m.measure,
       t.has_lab,
       CASE m.measure
${WAIT_KEYS.map(
  (k) => `         WHEN '${k}' THEN IF(t.${k.toLowerCase()} BETWEEN 0 AND ${WAIT_MAX_MINUTES},
                         FLOOR(t.${k.toLowerCase()} / ${WAIT_BUCKET_MINUTES}), NULL)`,
).join("\n")}
       END AS bucket,
       COUNT(*) AS n
FROM (
  SELECT ${HAS_LAB} AS has_lab,
${WAIT_KEYS.map(
  (k) =>
    `         TIMESTAMPDIFF(MINUTE, ${NCD_WAIT_MEASURES[k][0]}, ${NCD_WAIT_MEASURES[k][1]}) AS ${k.toLowerCase()}`,
).join(",\n")}
  FROM ovst o
  LEFT JOIN service_time s
    ON s.vn = o.vn
  WHERE ${NCD_VISIT_WHERE}
    AND o.vstdate < CURDATE()
) t
CROSS JOIN (
  ${WAIT_KEYS.map((k, i) => (i === 0 ? `SELECT '${k}' AS measure` : `SELECT '${k}'`)).join("\n  UNION ALL ")}
) m
GROUP BY m.measure, t.has_lab, bucket
ORDER BY m.measure, t.has_lab, bucket
`;

// --- 5. waiting time, HOSxP report definition --------------------------------------

/**
 * Steps of HOSxP reporttemplate "CUSTOM- ระยะเวลาในการรับบริการในเวลาราชการ
 * (8.30 น.-16.00 น.)" (whole-hospital OPD), restricted to the clinic. Each
 * step = [from, to] over the per-visit timestamps below (MIN of the
 * ovst_service_time type prefix; rx_finish = MAX rx_dispenser_datetime).
 * TOTAL is the report's "รวม" (steps 2–5, without the wait for screening);
 * NEW_TO_RX adds step 1.
 */
export const NCD_HOSXP_STEPS = {
  WAIT_SCREEN: ["new_visit", "begin_screen"],
  SCREEN: ["begin_screen", "end_screen"],
  WAIT_DOCTOR: ["end_screen", "begin_doctor"],
  DOCTOR: ["begin_doctor", "end_doctor"],
  WAIT_RX: ["end_doctor", "rx_finish"],
  TOTAL: ["begin_screen", "rx_finish"],
  NEW_TO_RX: ["new_visit", "rx_finish"],
} as const;

export type NcdHosxpStep = keyof typeof NCD_HOSXP_STEPS;

/** Steps that must each last > 1 minute (the report's HAVING); in time order. */
const HOSXP_CHAIN = ["WAIT_SCREEN", "SCREEN", "WAIT_DOCTOR", "DOCTOR", "WAIT_RX"] as const;
const HOSXP_STEP_KEYS = Object.keys(NCD_HOSXP_STEPS) as NcdHosxpStep[];

/** Seconds between two timestamps, the report's TIME_TO_SEC(b) - TIME_TO_SEC(a) (time of day only). */
const stepSec = (k: NcdHosxpStep) =>
  `TIME_TO_SEC(x.${NCD_HOSXP_STEPS[k][1]}) - TIME_TO_SEC(x.${NCD_HOSXP_STEPS[k][0]})`;

/**
 * One row: the HOSxP report's statistics for the clinic. Population =
 * clinic visits of the fiscal year registered 06:00–16:00 (ovst.vsttime),
 * today left out like NCD_WAIT_SQL (the only difference from the report;
 * none for a closed year). A visit counts (`ok`) when its timestamps are in
 * order new < begin_screen < end_screen < begin_doctor < end_doctor <
 * rx_finish and every step lasts > 1 minute. new_visit = OPD-NEW-VISIT end,
 * else TIMESTAMP(vstdate, vsttime). Minutes are TIME_TO_SEC differences /
 * 60 as in the report, averages / min / max ROUNDed to 2 like the report;
 * medians by MEDIAN() window (MariaDB 10.3+) over the `ok` visits.
 * Plan: ovst range on vstdate, ovst_service_time and rx_dispenser_detail
 * by ix_vn per clinic visit (FY2569 ~4 s).
 * Columns: visits, persons (population), ok_visits, ok_persons, and per
 * step <key>_avg / _min / _max / _med (key lower-cased).
 */
export const NCD_HOSXP_STEPS_SQL = `
SELECT COUNT(*) AS visits,
       COUNT(DISTINCT z.hn) AS persons,
       COALESCE(SUM(z.ok), 0) AS ok_visits,
       COUNT(DISTINCT IF(z.ok = 1, z.hn, NULL)) AS ok_persons,
${HOSXP_STEP_KEYS.map((k) => {
  const c = k.toLowerCase();
  return `       ROUND(AVG(IF(z.ok = 1, z.${c}, NULL)), 2) AS ${c}_avg,
       ROUND(MIN(IF(z.ok = 1, z.${c}, NULL)), 2) AS ${c}_min,
       ROUND(MAX(IF(z.ok = 1, z.${c}, NULL)), 2) AS ${c}_max,
       ROUND(MAX(z.${c}_med), 2) AS ${c}_med`;
}).join(",\n")}
FROM (
  SELECT y.*,
${HOSXP_STEP_KEYS.map((k) => {
  const c = k.toLowerCase();
  return `         MEDIAN(IF(y.ok = 1, y.${c}, NULL)) OVER () AS ${c}_med`;
}).join(",\n")}
  FROM (
    SELECT x.hn,
${HOSXP_STEP_KEYS.map((k) => `           (${stepSec(k)}) / 60 AS ${k.toLowerCase()}`).join(",\n")},
           IF(${HOSXP_CHAIN.map((k) => `x.${NCD_HOSXP_STEPS[k][0]} < x.${NCD_HOSXP_STEPS[k][1]}`).join("\n              AND ")}
${HOSXP_CHAIN.map((k) => `              AND ${stepSec(k)} > 60`).join("\n")}, 1, 0) AS ok
    FROM (
      SELECT o.hn,
             COALESCE(MIN(IF(t.ovst_service_time_type_code LIKE 'OPD-NEW-VISIT%', t.service_end_datetime, NULL)),
                      TIMESTAMP(o.vstdate, o.vsttime)) AS new_visit,
             MIN(IF(t.ovst_service_time_type_code LIKE 'OPD-SCREEN%', t.service_begin_datetime, NULL)) AS begin_screen,
             MIN(IF(t.ovst_service_time_type_code LIKE 'OPD-SCREEN%', t.service_end_datetime, NULL)) AS end_screen,
             MIN(IF(t.ovst_service_time_type_code LIKE 'OPD-DOCTOR%', t.service_begin_datetime, NULL)) AS begin_doctor,
             MIN(IF(t.ovst_service_time_type_code LIKE 'OPD-DOCTOR%', t.service_end_datetime, NULL)) AS end_doctor,
             (SELECT MAX(r.rx_dispenser_datetime)
                FROM rx_dispenser_detail r
               WHERE r.vn = o.vn) AS rx_finish
      FROM ovst o
      LEFT JOIN ovst_service_time t
        ON t.vn = o.vn
      WHERE ${NCD_VISIT_WHERE}
        AND o.vstdate < CURDATE()
        AND o.vsttime BETWEEN '06:00:00' AND '16:00:00'
      GROUP BY o.vn, o.hn, o.vstdate, o.vsttime
    ) x
  ) y
) z
`;

export function ncdClinicParams(periodStart: string, dataAsOf: string): QueryParams {
  return { periodStart, dataAsOf, hospcode: HOSPITAL_HOSPCODE };
}
