import "server-only";

/**
 * SQL for the "ผู้รับบริการ" (hospital service overview) tab — HOSxP only.
 *
 * Verified with db-cli against the production HOSxP database (bkhosxp,
 * MariaDB 10.11) on 2026-11-12 — definitions, mapping and figures are in
 * docs/kpi/service-overview.md.
 *
 * Every query returns AGGREGATES only (no hn / names / cid leave the DB).
 * All SQL is static; only values are bound via named placeholders:
 *   :from, :to   'YYYY-MM-DD' inclusive date range (Asia/Bangkok dates)
 * Date predicates are plain `col BETWEEN :from AND :to` on indexed date
 * columns (ovst.vstdate, er_regist.vstdate, ipt.regdate) — never a function
 * on the column.
 *
 * Source facts (checked with db-cli):
 *   - Cancelled OPD visits are MOVED from ovst to ovst_cancel (0 overlap in
 *     FY2570), so ovst needs no cancel filter.
 *   - ipt rows with dchdate IS NULL and ward IS NULL are stale 2024 records
 *     (10 rows); they are dropped by the INNER JOIN to ward.
 *   - ovst JOIN pttype makes the optimizer drive from pttype via
 *     ovst.ix_pttype (full scan, ~20 s for 6 weeks). Aggregate ovst first in
 *     a derived table, then join the lookup (~0.3 s).
 */

/**
 * -> one row { opd_visits, patients, er, admit_new }
 *   opd_visits: every ovst row in range (includes visits that led to an
 *               admission, ER visits and PCU visits)
 *   patients:   distinct ovst.hn in range
 *   er:         er_regist rows in range whose visit still exists in ovst
 *   admit_new:  ipt.regdate in range (all wards, home ward included)
 */
const cards = `
SELECT
  (SELECT COUNT(*) FROM ovst o
     WHERE o.vstdate BETWEEN :from AND :to) AS opd_visits,
  (SELECT COUNT(DISTINCT o.hn) FROM ovst o
     WHERE o.vstdate BETWEEN :from AND :to) AS patients,
  (SELECT COUNT(*) FROM er_regist e
     JOIN ovst o ON o.vn = e.vn
     WHERE e.vstdate BETWEEN :from AND :to) AS er,
  (SELECT COUNT(*) FROM ipt i
     WHERE i.regdate BETWEEN :from AND :to) AS admit_new
`;

/**
 * Current inpatients (ipt.dchdate IS NULL) per ward, right now — no params.
 * -> rows { ward, ward_name, beds, ward_active, patients }
 * Returns every active ward (also with 0 patients) plus any inactive ward
 * that still has patients. Home ward is NOT filtered here; the TS layer
 * splits it off (see isHomeWard in overview.ts).
 * beds = ward.bedcount (registered beds; = real_bedcount at this site).
 */
const wards = `
SELECT
  w.ward,
  w.name AS ward_name,
  COALESCE(w.bedcount, 0) AS beds,
  w.ward_active,
  COALESCE(c.patients, 0) AS patients
FROM ward w
LEFT JOIN (
  SELECT i.ward, COUNT(*) AS patients
  FROM ipt i
  WHERE i.dchdate IS NULL
  GROUP BY i.ward
) c ON c.ward = w.ward
WHERE w.ward_active = 'Y' OR c.patients > 0
`;

/** -> rows { hour (0-23), visits } — hours with 0 visits are absent. */
const hourly = `
SELECT HOUR(o.vsttime) AS hour, COUNT(*) AS visits
FROM ovst o
WHERE o.vstdate BETWEEN :from AND :to
  AND o.vsttime IS NOT NULL
GROUP BY HOUR(o.vsttime)
`;

/**
 * -> rows { code, dep_name, visits } by ovst.main_dep (kskdepartment).
 * kskdepartment.department at this site already starts with "NNN-".
 */
const departments = `
SELECT
  COALESCE(v.main_dep, '') AS code,
  k.department AS dep_name,
  v.visits
FROM (
  SELECT o.main_dep, COUNT(*) AS visits
  FROM ovst o
  WHERE o.vstdate BETWEEN :from AND :to
  GROUP BY o.main_dep
) v
LEFT JOIN kskdepartment k ON k.depcode = v.main_dep
`;

/**
 * -> rows { hipdata_code, visits } — visits by pttype.hipdata_code
 * (NHSO main fund: UCS, OFC, SSS, CSH, LGO, ...). Grouped into friendly
 * Thai labels in overview.ts (PTTYPE_GROUPS).
 */
const pttypes = `
SELECT
  COALESCE(p.hipdata_code, '') AS hipdata_code,
  SUM(v.visits) AS visits
FROM (
  SELECT o.pttype, COUNT(*) AS visits
  FROM ovst o
  WHERE o.vstdate BETWEEN :from AND :to
  GROUP BY o.pttype
) v
LEFT JOIN pttype p ON p.pttype = v.pttype
GROUP BY COALESCE(p.hipdata_code, '')
`;

/**
 * Distinct patients in range by age band and sex.
 * -> rows { band, sex ('1' male / '2' female / other), patients }
 * Per patient: age = vn_stat.age_y of the patient's YOUNGEST visit in the
 * range (= age at the first visit), sex = vn_stat.sex (from patient.sex).
 * The per-hn derived table never leaves the server; only counts return.
 */
const ageSex = `
SELECT
  CASE
    WHEN x.age_y < 5  THEN '0-4'
    WHEN x.age_y < 15 THEN '5-14'
    WHEN x.age_y < 25 THEN '15-24'
    WHEN x.age_y < 35 THEN '25-34'
    WHEN x.age_y < 45 THEN '35-44'
    WHEN x.age_y < 55 THEN '45-54'
    WHEN x.age_y < 65 THEN '55-64'
    WHEN x.age_y < 75 THEN '65-74'
    ELSE '75+'
  END AS band,
  x.sex,
  COUNT(*) AS patients
FROM (
  SELECT o.hn, MIN(v.age_y) AS age_y, MAX(v.sex) AS sex
  FROM ovst o
  JOIN vn_stat v ON v.vn = o.vn
  WHERE o.vstdate BETWEEN :from AND :to
  GROUP BY o.hn
) x
WHERE x.age_y IS NOT NULL
GROUP BY band, x.sex
`;

export const OVERVIEW_SQL = {
  cards,
  wards,
  hourly,
  departments,
  pttypes,
  ageSex,
} as const;
