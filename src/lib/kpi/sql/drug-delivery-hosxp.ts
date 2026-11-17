import "server-only";

import type { QueryParams } from "@/lib/db/his";

import { sqlCodeList, type ScreeningSqlContext } from "./screening-common";

/**
 * SQL for "ค่าส่งยาที่บ้าน" (/delivery): home drug delivery by postal
 * parcel and Health Rider, every insurance scheme, against HOSxP.
 * Aggregates only. Definitions and FY2569 verification:
 * docs/kpi/drug-delivery.md. Codes verified with db-cli (2026-11-17).
 *
 * The /pp/other items DRUG_DELIVERY_POST / DRUG_DELIVERY_RIDER (UC only,
 * NHSO_DRUG_DELIVERY_SQL in ./nhso-other-hosxp.ts) are separate and are
 * not changed by this report.
 *
 * All SQL is static: code lists are source constants validated by
 * sqlCodeList; only values are bound as named parameters:
 *   :periodStart  'YYYY-MM-DD'  1 Oct of the fiscal year
 *   :dataAsOf     'YYYY-MM-DD'  30 Sep of the fiscal year (inclusive)
 */

const IN_FY = (col: string) =>
  `${col} >= :periodStart AND ${col} < DATE_ADD(:dataAsOf, INTERVAL 1 DAY)`;

/**
 * nondrugitems.icode "ค่าจัดส่งยาทางไปรษณีย์" (50 baht, ADP DRUGP). The
 * only two delivery fee items in nondrugitems (name search ส่งยา /
 * ไปรษณีย์ / จัดส่ง / rider / ไรเดอร์, 2026-11-17); every scheme is
 * charged with the same icode, there is no separate cash-patient item.
 */
const POST_ICODES = ["3002455"] as const;
/** nondrugitems.icode "ค่าจัดส่งยาโดย Health Rider" (50 baht, ADP DRUGP). */
const RIDER_ICODES = ["3002725"] as const;
/**
 * opitemrece.paidst paid by the patient: 01 ชำระเองเบิกได้, 03 ชำระเอง
 * เบิกไม่ได้. 02 ลูกหนี้สิทธิ = billed to the scheme's fund; 00 ค้างชำระ
 * and 04 ส่วนลดเงินสด are neither (FY2569: none on delivery items).
 */
const PATIENT_PAIDST = ["01", "03"] as const;
const FUND_PAIDST = ["02"] as const;

/**
 * Home drug delivery per (month of ovst.vstdate, scheme), fiscal year:
 *  - shipped          = visits with a pharmacy delivery record
 *    (prscrpt_delivery, unique per vn) that has a parcel tracking number
 *    (not NULL / blank / '-'; FY2569 only NULL or PB…TH / PC…TH). Records
 *    without a number may have been cancelled: excluded.
 *  - shipped_charged  = shipped visits charged a delivery fee (postal or
 *    rider icode), once per visit (same rule as /pp/other)
 *  - post_visits / post_baht     = visits charged the postal icode (also
 *    visits without a delivery record) and the sum of opitemrece.sum_price
 *  - rider_visits / rider_baht   = the same for the Health Rider icode
 *    (HOSxP has no delivery record for riders)
 *  - *_patient_baht / *_fund_baht = that sum split by opitemrece.paidst
 * Scheme = pttype.hipdata_code of the delivery charge (opitemrece.pttype,
 * the scheme the fee was billed to; MIN() when a visit has several) and of
 * ovst.pttype for shipped visits without a charge. FY2569 every delivery
 * charge has opitemrece.pttype = ovst.pttype.
 * Plan: ovst by vstdate first (each CTE is date-bounded), pttype joined
 * last without a filter.
 * -> one row per (ym, hipdata_code) with any delivery.
 */
export const DRUG_DELIVERY_SQL = `
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
         MIN(oi.pttype) AS item_pttype,
         MAX(oi.icode IN (${sqlCodeList(POST_ICODES)}))  AS post_c,
         MAX(oi.icode IN (${sqlCodeList(RIDER_ICODES)})) AS rider_c,
         SUM(CASE WHEN oi.icode IN (${sqlCodeList(POST_ICODES)})
                  THEN oi.sum_price ELSE 0 END) AS post_baht,
         SUM(CASE WHEN oi.icode IN (${sqlCodeList(POST_ICODES)})
                   AND oi.paidst IN (${sqlCodeList(PATIENT_PAIDST)})
                  THEN oi.sum_price ELSE 0 END) AS post_patient_baht,
         SUM(CASE WHEN oi.icode IN (${sqlCodeList(POST_ICODES)})
                   AND oi.paidst IN (${sqlCodeList(FUND_PAIDST)})
                  THEN oi.sum_price ELSE 0 END) AS post_fund_baht,
         SUM(CASE WHEN oi.icode IN (${sqlCodeList(RIDER_ICODES)})
                  THEN oi.sum_price ELSE 0 END) AS rider_baht,
         SUM(CASE WHEN oi.icode IN (${sqlCodeList(RIDER_ICODES)})
                   AND oi.paidst IN (${sqlCodeList(PATIENT_PAIDST)})
                  THEN oi.sum_price ELSE 0 END) AS rider_patient_baht,
         SUM(CASE WHEN oi.icode IN (${sqlCodeList(RIDER_ICODES)})
                   AND oi.paidst IN (${sqlCodeList(FUND_PAIDST)})
                  THEN oi.sum_price ELSE 0 END) AS rider_fund_baht
  FROM opitemrece oi
  WHERE oi.icode IN (${sqlCodeList([...POST_ICODES, ...RIDER_ICODES])})
    AND ${IN_FY("oi.vstdate")}
  GROUP BY oi.vn
),
v AS (
  SELECT DATE_FORMAT(o.vstdate, '%Y-%m')     AS ym,
         COALESCE(b.item_pttype, o.pttype)  AS scheme_pttype,
         dl.vn IS NOT NULL                  AS shipped,
         b.vn IS NOT NULL                   AS charged,
         COALESCE(b.post_c, 0)              AS post_c,
         COALESCE(b.rider_c, 0)             AS rider_c,
         COALESCE(b.post_baht, 0)           AS post_baht,
         COALESCE(b.post_patient_baht, 0)   AS post_patient_baht,
         COALESCE(b.post_fund_baht, 0)      AS post_fund_baht,
         COALESCE(b.rider_baht, 0)          AS rider_baht,
         COALESCE(b.rider_patient_baht, 0)  AS rider_patient_baht,
         COALESCE(b.rider_fund_baht, 0)     AS rider_fund_baht
  FROM ovst o
  LEFT JOIN dl
    ON dl.vn = o.vn
  LEFT JOIN b
    ON b.vn = o.vn
  WHERE ${IN_FY("o.vstdate")}
    AND (dl.vn IS NOT NULL OR b.vn IS NOT NULL)
)
SELECT v.ym,
       COALESCE(pt.hipdata_code, '')            AS hipdata_code,
       SUM(v.shipped)                           AS shipped,
       SUM(v.shipped AND v.charged)             AS shipped_charged,
       SUM(v.post_c)                            AS post_visits,
       SUM(v.post_baht)                         AS post_baht,
       SUM(v.post_patient_baht)                 AS post_patient_baht,
       SUM(v.post_fund_baht)                    AS post_fund_baht,
       SUM(v.rider_c)                           AS rider_visits,
       SUM(v.rider_baht)                        AS rider_baht,
       SUM(v.rider_patient_baht)                AS rider_patient_baht,
       SUM(v.rider_fund_baht)                   AS rider_fund_baht
FROM v
LEFT JOIN pttype pt
  ON pt.pttype = v.scheme_pttype
GROUP BY v.ym, COALESCE(pt.hipdata_code, '')
ORDER BY v.ym, hipdata_code
`;

export function drugDeliveryParams(ctx: ScreeningSqlContext): QueryParams {
  return { periodStart: ctx.periodStart, dataAsOf: ctx.dataAsOf };
}
