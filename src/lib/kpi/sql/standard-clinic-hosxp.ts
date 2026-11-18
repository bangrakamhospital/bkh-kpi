import "server-only";

import type { QueryParams } from "@/lib/db/his";
import { type ClinicDef, clinicUnits } from "@/lib/kpi/clinic-registry";
import { HOSPITAL_HOSPCODE } from "@/lib/kpi/district-areas";

import { SCHEME_CODE_EXPR, SCHEME_INDEX_EXPR, schemePersonColumns } from "./clinic-scheme-hosxp";
import { sqlCodeList } from "./screening-common";

/**
 * SQL of the standard clinic page (/clinic/[clinic]): every "standard"
 * clinic of @/lib/kpi/clinic-registry, against HOSxP only (never HDC).
 * Aggregates only: no hn / name / cid leaves the database. Definitions
 * and FY2569 figures: docs/kpi/clinic-standard.md. Verified with db-cli
 * (2026-11-18).
 *
 * A visit of the clinic = ovst row with main_dep IN the clinic's depcodes
 * and vstdate in the fiscal year (today included, as /clinic/ncd).
 * Charges = vn_stat of the visit (every item of the vn, so also PT /
 * dental items done on that visit, which /clinic/pt and /clinic/dental
 * count by item: never add figures across tabs).
 *
 * Five queries, run in parallel by the loader; each reads the clinic's
 * visits once from ovst by vstdate (ix_vstdate range, main_dep filtered;
 * there is no main_dep index), lookups by their primary key / vn index:
 *   visits  per (month, main_dep, scheme): visits and charges
 *   cohort  one row: distinct people per month / scheme / pay group /
 *           depcode / sub-unit
 *   days    per date: visits, physicians, providers; appointments per date
 *   items   opitemrece of the visits: drugs as one row, other items top 15
 *   pdx     principal diagnosis (vn_stat.pdx) top 10
 *
 * SQL is built from source constants only (the registry's depcodes,
 * validated by sqlCodeList); values are bound as named parameters:
 *   :periodStart  'YYYY-MM-DD'  1 Oct of the fiscal year
 *   :dataAsOf     'YYYY-MM-DD'  30 Sep of the fiscal year (inclusive)
 *   :hospcode     the hospital's own hospcode (hospmain test of the schemes)
 */

/** doctor.position_id of physicians (doctor_position 1 'แพทย์'). */
const PHYSICIAN_POSITION_ID = 1;

/** opitemrece.income of drugs (income_group 12 ค่ายาและเวชภัณฑ์ = vn_stat.inc12). */
export const DRUG_INCOME_CODES = ["03", "04", "17", "20"] as const;

/** Non-drug items listed (by visits charged). */
export const TOP_ITEMS = 15;
/** Principal diagnoses listed (by visits). */
export const TOP_PDX = 10;

const IN_FY = (col: string) =>
  `${col} >= :periodStart AND ${col} < DATE_ADD(:dataAsOf, INTERVAL 1 DAY)`;

export interface StandardClinicSql {
  visits: string;
  cohort: string;
  days: string;
  items: string;
  pdx: string;
}

function buildSql(c: ClinicDef): StandardClinicSql {
  const deps = sqlCodeList(c.depcodes);
  if (c.depcodes.length > 30) throw new Error("too many depcodes for the person bitmask");
  const where = `o.main_dep IN (${deps})
    AND ${IN_FY("o.vstdate")}`;

  // bit i of dep_mask = c.depcodes[i]; a sub-unit = OR of its depcodes' bits
  const depBit = (d: string) => 1 << c.depcodes.indexOf(d);
  const unitMasks = clinicUnits(c).map((u) => u.depcodes.reduce((m, d) => m | depBit(d), 0));

  /**
   * Per (month, main_dep, scheme):
   *  - visits, baht = vn_stat.income (every item of the vn)
   *  - drug inc12, lab inc03, xray inc04, procedure inc06 (หัตถการ/ผ่าตัด),
   *    dental inc11, rehab inc13 (กายภาพ/เวชกรรมฟื้นฟู), paid = paid_money
   *  - no_pdx_visits: vn_stat.pdx blank
   */
  const visits = `
SELECT DATE_FORMAT(o.vstdate, '%Y-%m')      AS ym,
       o.main_dep                            AS dep,
       ${SCHEME_CODE_EXPR} AS scheme_code,
       COUNT(*)                              AS visits,
       SUM(COALESCE(vs.income, 0))           AS baht,
       SUM(COALESCE(vs.inc12, 0))            AS drug_baht,
       SUM(COALESCE(vs.inc03, 0))            AS lab_baht,
       SUM(COALESCE(vs.inc04, 0))            AS xray_baht,
       SUM(COALESCE(vs.inc06, 0))            AS procedure_baht,
       SUM(COALESCE(vs.inc11, 0))            AS dental_baht,
       SUM(COALESCE(vs.inc13, 0))            AS rehab_baht,
       SUM(COALESCE(vs.paid_money, 0))       AS paid_baht,
       SUM(COALESCE(vs.pdx, '') = '')        AS no_pdx_visits
FROM ovst o
LEFT JOIN vn_stat vs
  ON vs.vn = o.vn
LEFT JOIN pttype pt
  ON pt.pttype = o.pttype
WHERE ${where}
GROUP BY ym, dep, scheme_code
ORDER BY ym, dep, scheme_code
`;

  /** One row: distinct hn per breakdown (m0..m11, s0..s9, pay_*, d<i>, u<i>). */
  const cohort = `
SELECT COUNT(*) AS persons,
${Array.from({ length: 12 }, (_, i) => `  SUM((c.month_mask & ${1 << i}) <> 0) AS m${i},`).join("\n")}
${schemePersonColumns()}
${c.depcodes.map((_, i) => `  SUM((c.dep_mask & ${1 << i}) <> 0) AS d${i},`).join("\n")}
${unitMasks.map((m, i) => `  SUM((c.dep_mask & ${m}) <> 0) AS u${i},`).join("\n")}
  0 AS _end
FROM (
  SELECT o.hn,
         BIT_OR(1 << PERIOD_DIFF(DATE_FORMAT(o.vstdate, '%Y%m'), DATE_FORMAT(:periodStart, '%Y%m'))) AS month_mask,
         BIT_OR(1 << (${SCHEME_INDEX_EXPR})) AS scheme_mask,
         BIT_OR(1 << (FIELD(o.main_dep, ${deps}) - 1)) AS dep_mask
  FROM ovst o
  LEFT JOIN vn_stat vs
    ON vs.vn = o.vn
  LEFT JOIN pttype pt
    ON pt.pttype = o.pttype
  WHERE ${where}
  GROUP BY o.hn
) c
`;

  /**
   * One row per date with visits or appointments, plus the WITH ROLLUP row
   * (d = NULL: distinct physicians / providers of the year):
   *  - physicians   distinct ovst.doctor with doctor.position_id = 1
   *  - phys_visits  visits whose ovst.doctor is a physician
   *  - providers    distinct ovst.doctor (any position)
   *  - appts / appts_kept  oapp with depcode in the clinic and nextdate = day
   *                        / of those with a visit (oapp.visit_vn set)
   */
  const days = `
SELECT x.d                     AS d,
       SUM(x.visits)           AS visits,
       SUM(x.physicians)       AS physicians,
       SUM(x.phys_visits)      AS phys_visits,
       SUM(x.providers)        AS providers,
       SUM(x.appts)            AS appts,
       SUM(x.appts_kept)       AS appts_kept
FROM (
  SELECT DATE_FORMAT(v.vstdate, '%Y-%m-%d')                  AS d,
         COUNT(*)                                           AS visits,
         COUNT(DISTINCT IF(d.code IS NULL, NULL, v.doctor)) AS physicians,
         SUM(d.code IS NOT NULL)                            AS phys_visits,
         COUNT(DISTINCT NULLIF(v.doctor, ''))               AS providers,
         0 AS appts,
         0 AS appts_kept
  FROM (
    SELECT o.vstdate, o.doctor
    FROM ovst o
    WHERE ${where}
  ) v
  LEFT JOIN doctor d
    ON d.code = v.doctor
   AND d.position_id = ${PHYSICIAN_POSITION_ID}
  GROUP BY v.vstdate WITH ROLLUP
  UNION ALL
  SELECT DATE_FORMAT(a.nextdate, '%Y-%m-%d'), 0, 0, 0, 0,
         COUNT(*),
         SUM(a.visit_vn IS NOT NULL AND a.visit_vn <> '')
  FROM oapp a
  WHERE a.depcode IN (${deps})
    AND a.nextdate >= :periodStart
    AND a.nextdate <= :dataAsOf
  GROUP BY a.nextdate
) x
GROUP BY x.d
ORDER BY x.d
`;

  /**
   * opitemrece of the clinic visits (op.vn = o.vn; ix_vn): drugs (income
   * DRUG_INCOME_CODES) as one row icode 'DRUG', every other icode its own
   * row; kept: DRUG and the TOP_ITEMS non-drug items by visits charged.
   * nondrug_baht / nondrug_items = totals of all non-drug rows.
   * Name = nondrugitems.name, category = income.name.
   */
  const items = `
SELECT y.icode, y.qty, y.visits, y.baht, y.nondrug_baht, y.nondrug_items,
       n.name AS item_name,
       inc.name AS income_name
FROM (
  SELECT x.*,
         SUM(IF(x.icode = 'DRUG', 0, x.baht)) OVER () AS nondrug_baht,
         SUM(x.icode <> 'DRUG') OVER ()               AS nondrug_items,
         ROW_NUMBER() OVER (PARTITION BY x.icode = 'DRUG'
                            ORDER BY x.visits DESC, x.baht DESC, x.icode) AS rn
  FROM (
    SELECT IF(op.income IN (${sqlCodeList(DRUG_INCOME_CODES)}), 'DRUG', op.icode) AS icode,
           MAX(op.income)          AS income,
           SUM(op.qty)             AS qty,
           COUNT(DISTINCT op.vn)   AS visits,
           SUM(op.sum_price)       AS baht
    FROM ovst o
    JOIN opitemrece op
      ON op.vn = o.vn
    WHERE ${where}
    GROUP BY 1
  ) x
) y
LEFT JOIN nondrugitems n
  ON n.icode = y.icode
LEFT JOIN income inc
  ON inc.income = y.income
WHERE y.icode = 'DRUG' OR y.rn <= ${TOP_ITEMS}
ORDER BY y.icode = 'DRUG' DESC, y.rn
`;

  /** Principal diagnosis (vn_stat.pdx, non-blank) top TOP_PDX by visits; name from icd101. */
  const pdx = `
SELECT x.pdx, x.visits, x.persons, i.name AS dx_name
FROM (
  SELECT vs.pdx,
         COUNT(*)                AS visits,
         COUNT(DISTINCT o.hn)    AS persons
  FROM ovst o
  JOIN vn_stat vs
    ON vs.vn = o.vn
  WHERE ${where}
    AND COALESCE(vs.pdx, '') <> ''
  GROUP BY vs.pdx
  ORDER BY visits DESC, vs.pdx
  LIMIT ${TOP_PDX}
) x
LEFT JOIN icd101 i
  ON i.code = x.pdx
ORDER BY x.visits DESC, x.pdx
`;

  return { visits, cohort, days, items, pdx };
}

const cache = new Map<string, StandardClinicSql>();

/** SQL of a standard clinic (built once per slug from the registry constants). */
export function standardClinicSql(c: ClinicDef): StandardClinicSql {
  if (c.kind !== "standard") throw new Error(`not a standard clinic: ${c.slug}`);
  let sql = cache.get(c.slug);
  if (!sql) {
    sql = buildSql(c);
    cache.set(c.slug, sql);
  }
  return sql;
}

export function standardClinicParams(periodStart: string, dataAsOf: string): QueryParams {
  return { periodStart, dataAsOf, hospcode: HOSPITAL_HOSPCODE };
}
