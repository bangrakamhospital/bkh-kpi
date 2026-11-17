import "server-only";

import type { QueryParams } from "@/lib/db/his";

import { sqlCodeList, type ScreeningSqlContext } from "./screening-common";

/**
 * SQL for "รายได้ สปสช. อื่นๆ" (/pp/other): NHSO revenue that is not PP
 * Fee Schedule, against HOSxP. Aggregates only (one row per query).
 * Definitions and FY2569 verification: docs/kpi/ppfs-revenue-feasibility.md
 * (10.7). All codes below were verified with db-cli (2026-11-17).
 *
 * Rates are applied in TypeScript (nhso-other-rates.ts), never in SQL.
 * All SQL is static: code lists are source constants validated by
 * sqlCodeList; only values are bound as named parameters:
 *   :periodStart  'YYYY-MM-DD'  1 Oct of the fiscal year
 *   :dataAsOf     'YYYY-MM-DD'  30 Sep of the fiscal year (inclusive)
 */

const IN_FY = (col: string) =>
  `${col} >= :periodStart AND ${col} < DATE_ADD(:dataAsOf, INTERVAL 1 DAY)`;

// --- telehealth -------------------------------------------------------------

/** ovst.ovstist of a telehealth / telemedicine visit. */
const TELEHEALTH_OVSTIST = ["05"] as const;
/** pttype.hipdata_code of the UC scheme (as PTTYPE_GROUPS in overview.ts). */
const UC_HIPDATA = ["UCS"] as const;
/** nondrugitems.nhso_adp_code of the telehealth fee (icode 3002417, 50 baht). */
const TELEMED_ADP = ["TELMED"] as const;
/**
 * ovst.main_dep excluded from the telehealth target: 014 ห้องการเงิน
 * (FY2569: 142 UC visits on 6 days, all Z71/Z00, no drugs, only the
 * general OPD fee) is batch paperwork, not chronic follow-up.
 */
const TELEHEALTH_EXCLUDED_DEPS = ["014"] as const;

/**
 * Telehealth, chronic follow-up (B, ceiling), UC visits (ovst.pttype ->
 * pttype.hipdata_code 'UCS') in the fiscal year:
 *  - target_visits = telehealth visits (ovstist '05') with a department
 *    (ovst.main_dep not empty). Visits without a department are batch
 *    medicine-refill / delivery visits (FY2569: 4,025 UC visits, 230
 *    patients on 26 days, all Z71.8, none charged TELMED): excluded.
 *    Also excluded: TELEHEALTH_EXCLUDED_DEPS (finance-room batch).
 *  - done_visits   = target visits charged ADP TELMED
 *  - billed_visits = every UC visit charged TELMED (also visits not marked
 *    '05'): shows charging outside the telehealth flag.
 * pttype is LEFT JOINed with the scheme test in WHERE on COALESCE so the
 * plan stays ovst-by-date first (an inner join made MariaDB start from
 * pttype -> ix_pttype over all years: 20-58 s instead of ~2.6 s).
 * -> one row.
 */
export const NHSO_TELEMED_SQL = `
WITH b AS (
  SELECT DISTINCT oi.vn
  FROM opitemrece oi
  WHERE oi.icode IN (SELECT n.icode FROM nondrugitems n
                      WHERE n.nhso_adp_code IN (${sqlCodeList(TELEMED_ADP)}))
    AND ${IN_FY("oi.vstdate")}
),
v AS (
  SELECT o.ovstist IN (${sqlCodeList(TELEHEALTH_OVSTIST)})
           AND o.main_dep IS NOT NULL AND o.main_dep <> ''
           AND o.main_dep NOT IN (${sqlCodeList(TELEHEALTH_EXCLUDED_DEPS)}) AS in_target,
         b.vn IS NOT NULL AS charged
  FROM ovst o
  LEFT JOIN pttype pt
    ON pt.pttype = o.pttype
  LEFT JOIN b
    ON b.vn = o.vn
  WHERE ${IN_FY("o.vstdate")}
    AND (o.ovstist IN (${sqlCodeList(TELEHEALTH_OVSTIST)}) OR b.vn IS NOT NULL)
    AND COALESCE(pt.hipdata_code, '') IN (${sqlCodeList(UC_HIPDATA)})
)
SELECT COALESCE(SUM(v.in_target), 0)               AS target_visits,
       COALESCE(SUM(v.in_target AND v.charged), 0) AS done_visits,
       COALESCE(SUM(v.charged), 0)                 AS billed_visits
FROM v
`;

export function nhsoTelemedParams(ctx: ScreeningSqlContext): QueryParams {
  return { periodStart: ctx.periodStart, dataAsOf: ctx.dataAsOf };
}

// --- home drug delivery ------------------------------------------------------

/**
 * nondrugitems.nhso_adp_code of the home drug delivery fee (50 baht):
 * icode 3002455 "ค่าจัดส่งยาทางไปรษณีย์" and 3002725 "ค่าจัดส่งยาโดย
 * Health Rider" both carry DRUGP.
 */
const DRUG_DELIVERY_ADP = ["DRUGP"] as const;
/** opitemrece.icode of the postal delivery fee. */
const DRUG_DELIVERY_POST_ICODES = ["3002455"] as const;
/** opitemrece.icode of the Health Rider delivery fee. */
const DRUG_DELIVERY_RIDER_ICODES = ["3002725"] as const;

/**
 * Home drug delivery, UC visits (ovst.pttype -> pttype.hipdata_code 'UCS')
 * in the fiscal year, any ovstist, telehealth not required:
 *  - post_target_visits = visits with a pharmacy delivery record
 *    (prscrpt_delivery, unique per vn) that has a parcel tracking number
 *    (prscrpt_delivery_track not NULL / blank / '-'; FY2569 values are
 *    only NULL or PB…TH / PC…TH). Records without a number may have been
 *    cancelled: excluded.
 *  - post_done_visits   = target visits charged any DRUGP item (postal or
 *    rider icode), once per visit
 *  - post_billed_visits = every UC visit charged the postal icode (also
 *    visits without a delivery record)
 *  - rider_visits       = UC visits charged the Health Rider icode. HOSxP
 *    has no delivery record for riders: no target, done = billed.
 * pttype is LEFT JOINed with the scheme test on COALESCE (as
 * NHSO_TELEMED_SQL) so the plan stays ovst-by-date first.
 * -> one row.
 */
export const NHSO_DRUG_DELIVERY_SQL = `
WITH dl AS (
  SELECT DISTINCT d.vn
  FROM prscrpt_delivery d
  JOIN ovst o1
    ON o1.vn = d.vn
  WHERE ${IN_FY("o1.vstdate")}
    AND d.prscrpt_delivery_track IS NOT NULL
    AND TRIM(d.prscrpt_delivery_track) NOT IN ('', '-')
),
b AS (
  SELECT oi.vn,
         MAX(oi.icode IN (${sqlCodeList(DRUG_DELIVERY_POST_ICODES)}))  AS post_c,
         MAX(oi.icode IN (${sqlCodeList(DRUG_DELIVERY_RIDER_ICODES)})) AS rider_c
  FROM opitemrece oi
  WHERE oi.icode IN (SELECT n.icode FROM nondrugitems n
                      WHERE n.nhso_adp_code IN (${sqlCodeList(DRUG_DELIVERY_ADP)}))
    AND ${IN_FY("oi.vstdate")}
  GROUP BY oi.vn
),
v AS (
  SELECT dl.vn IS NOT NULL      AS in_target,
         b.vn IS NOT NULL       AS charged,
         COALESCE(b.post_c, 0)  AS post_c,
         COALESCE(b.rider_c, 0) AS rider_c
  FROM ovst o
  LEFT JOIN pttype pt
    ON pt.pttype = o.pttype
  LEFT JOIN dl
    ON dl.vn = o.vn
  LEFT JOIN b
    ON b.vn = o.vn
  WHERE ${IN_FY("o.vstdate")}
    AND (dl.vn IS NOT NULL OR b.vn IS NOT NULL)
    AND COALESCE(pt.hipdata_code, '') IN (${sqlCodeList(UC_HIPDATA)})
)
SELECT COALESCE(SUM(v.in_target), 0)               AS post_target_visits,
       COALESCE(SUM(v.in_target AND v.charged), 0) AS post_done_visits,
       COALESCE(SUM(v.post_c), 0)                  AS post_billed_visits,
       COALESCE(SUM(v.rider_c), 0)                 AS rider_visits
FROM v
`;

export function nhsoDrugDeliveryParams(ctx: ScreeningSqlContext): QueryParams {
  return { periodStart: ctx.periodStart, dataAsOf: ctx.dataAsOf };
}

// --- palliative strong opioid ------------------------------------------------

/**
 * drugitems.icode of oral / transdermal strong opioids: morphine MST
 * 1900357, Kapanol 1560002, morphine IR 1460028, morphine solution
 * 1560001, fentanyl patch 1650029. Morphine injection is not counted.
 */
const PALLIATIVE_OPIOID_ICODES = [
  "1900357",
  "1560002",
  "1460028",
  "1560001",
  "1650029",
] as const;
/** ovstdiag.icd10 of palliative care (Z51.5). */
const PALLIATIVE_ICD10 = ["Z515"] as const;
/** Cancer ranges (sargable, icd10 has no dot): C00–C96, D37–D48. */
const CANCER_ICD_RANGES = [
  { from: "C00", toExclusive: "C97" },
  { from: "D37", toExclusive: "D49" },
] as const;

/** `col` within any CANCER_ICD_RANGES (constants, validated). */
function cancerIcd(col: string): string {
  return `(${CANCER_ICD_RANGES.map(
    (r) =>
      `(${col} >= ${sqlCodeList([r.from])} AND ${col} < ${sqlCodeList([r.toExclusive])})`,
  ).join(" OR ")})`;
}

/**
 * Palliative strong opioid (C, no target), an estimate:
 *  - rx = (patient, calendar month) with an OPD dispensing (opitemrece.an
 *    empty) of PALLIATIVE_OPIOID_ICODES in the fiscal year, Thai patients
 *  - done_person_months = rx rows whose patient has Z51.5 and a cancer
 *    diagnosis (each in ovstdiag, or iptdiag via ipt.hn) on or before
 *    :dataAsOf — "ever by year end", so months before the first Z51.5 in
 *    the year also count (FY2569: 34 vs 29 if Z51.5 had to come first)
 *  - done_persons = distinct patients of those rows (shown in docs only)
 * No billed figure: the M00xx ADP items in HOSxP are priced 0 baht.
 * -> one row.
 */
export const NHSO_PALLIATIVE_OPIOID_SQL = `
WITH rx AS (
  SELECT DISTINCT oi.hn, DATE_FORMAT(oi.vstdate, '%Y-%m') AS ym
  FROM opitemrece oi
  JOIN patient pt
    ON pt.hn = oi.hn
  WHERE oi.icode IN (${sqlCodeList(PALLIATIVE_OPIOID_ICODES)})
    AND ${IN_FY("oi.vstdate")}
    AND (oi.an IS NULL OR oi.an = '')
    AND pt.nationality = '99'
),
pal AS (
  SELECT r.hn
  FROM (SELECT DISTINCT rx.hn FROM rx) r
  WHERE (
          EXISTS (
            SELECT 1
            FROM ovstdiag d
            WHERE d.hn = r.hn
              AND d.icd10 IN (${sqlCodeList(PALLIATIVE_ICD10)})
              AND d.vstdate < DATE_ADD(:dataAsOf, INTERVAL 1 DAY)
          )
          OR EXISTS (
            SELECT 1
            FROM ipt i
            JOIN iptdiag x
              ON x.an = i.an
            WHERE i.hn = r.hn
              AND i.regdate < DATE_ADD(:dataAsOf, INTERVAL 1 DAY)
              AND x.icd10 IN (${sqlCodeList(PALLIATIVE_ICD10)})
          )
        )
    AND (
          EXISTS (
            SELECT 1
            FROM ovstdiag d
            WHERE d.hn = r.hn
              AND d.vstdate < DATE_ADD(:dataAsOf, INTERVAL 1 DAY)
              AND ${cancerIcd("d.icd10")}
          )
          OR EXISTS (
            SELECT 1
            FROM ipt i
            JOIN iptdiag x
              ON x.an = i.an
            WHERE i.hn = r.hn
              AND i.regdate < DATE_ADD(:dataAsOf, INTERVAL 1 DAY)
              AND ${cancerIcd("x.icd10")}
          )
        )
)
SELECT COUNT(*)              AS done_person_months,
       COUNT(DISTINCT rx.hn) AS done_persons
FROM rx
JOIN pal
  ON pal.hn = rx.hn
`;

export function nhsoPalliativeOpioidParams(ctx: ScreeningSqlContext): QueryParams {
  return { periodStart: ctx.periodStart, dataAsOf: ctx.dataAsOf };
}
