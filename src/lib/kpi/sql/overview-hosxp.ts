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

/**
 * OPD visits in range by MOPH รง.504 disease group (21 groups).
 * -> rows { group_id (NULL = not classifiable), no_dx (1 = principal dx not
 *    yet recorded), name_th, ranges, visits }
 *
 * Per visit (ovst.vstdate in range, same universe as opd_visits):
 *   code = vn_stat.pdx (principal dx = ovstdiag diagtype '1'; 100 % filled)
 *          — but if pdx is an injury (S/T) the visit is classified by its
 *          external cause instead (MIN ovstdiag.icd10 with diagtype '5'),
 *          as รง.504 groups 19-21 are defined on V01-Y89. An injury with
 *          no external cause stays S/T and is not classifiable.
 *   group = rpt_504_code row with code BETWEEN code1 AND code2 (HOSxP's
 *          own 504 mapping; no overlapping ranges — checked against icd101).
 * Z (factors influencing health status), U and S/T without an external
 * cause match no 504 range and come back as group_id NULL.
 * vn_stat.gr504 exists but is never filled at this site (all NULL).
 *
 * Performance: the external-cause lookup is a dependent subquery that only
 * runs for S/T visits (index ovstdiag.vn); ~0.3 s / month, ~3.4 s / 366 d.
 * A derived ovstdiag-by-vstdate table was ~10x slower.
 */
const diseaseGroupsOpd = `
SELECT
  g.id AS group_id,
  (x.code IS NULL OR x.code = '') AS no_dx,
  n.name1 AS name_th,
  r.ranges,
  SUM(x.visits) AS visits
FROM (
  SELECT
    CASE
      WHEN LEFT(v.pdx, 1) IN ('S', 'T') THEN COALESCE(
        (SELECT MIN(d.icd10) FROM ovstdiag d
          WHERE d.vn = o.vn AND d.diagtype = '5'),
        v.pdx)
      ELSE v.pdx
    END AS code,
    COUNT(*) AS visits
  FROM ovst o
  JOIN vn_stat v ON v.vn = o.vn
  WHERE o.vstdate BETWEEN :from AND :to
  GROUP BY code
) x
LEFT JOIN rpt_504_code g ON x.code BETWEEN g.code1 AND g.code2
LEFT JOIN rpt_504_name n ON n.id = g.id
LEFT JOIN (
  SELECT c.id,
    GROUP_CONCAT(CONCAT(LEFT(c.code1, 3), '-', LEFT(c.code2, 3))
      ORDER BY c.code1 SEPARATOR ', ') AS ranges
  FROM rpt_504_code c
  GROUP BY c.id
) r ON r.id = g.id
GROUP BY g.id, no_dx, n.name1, r.ranges
`;

/**
 * Discharges in range by MOPH รง.505 disease group (75 groups).
 * -> rows { group_id (NULL = not classifiable), no_dx (1 = not yet coded —
 *    an_stat.pdx empty; ~100 of the last 12 days' discharges on 2026-11-12),
 *    name_th, ranges, admissions }
 *
 * Date basis: ipt.dchdate in range (discharged admissions — the diagnosis
 * is final only at discharge; รง.505 is a discharge report). This differs
 * from the admit_new card, which uses regdate. All wards incl. home ward
 * (same as admit_new).
 * code = an_stat.pdx (= iptdiag diagtype '1'; 100 % filled for Oct 2026
 * discharges, i.e. once coded), injuries (S/T) re-classified by external cause (iptdiag diagtype '5'), like OPD.
 * HOSxP's rpt_505_code has no range for Z codes, U codes and malignant
 * neoplasms other than liver/lung/breast/cervix, K64-K67 — those return
 * group_id NULL.
 */
const diseaseGroupsIpd = `
SELECT
  g.id AS group_id,
  (x.code IS NULL OR x.code = '') AS no_dx,
  n.name1 AS name_th,
  r.ranges,
  SUM(x.admissions) AS admissions
FROM (
  SELECT
    CASE
      WHEN LEFT(a.pdx, 1) IN ('S', 'T') THEN COALESCE(
        (SELECT MIN(d.icd10) FROM iptdiag d
          WHERE d.an = i.an AND d.diagtype = '5'),
        a.pdx)
      ELSE a.pdx
    END AS code,
    COUNT(*) AS admissions
  FROM ipt i
  JOIN an_stat a ON a.an = i.an
  WHERE i.dchdate BETWEEN :from AND :to
  GROUP BY code
) x
LEFT JOIN rpt_505_code g ON x.code BETWEEN g.code1 AND g.code2
LEFT JOIN rpt_505_name n ON n.id = g.id
LEFT JOIN (
  SELECT c.id,
    GROUP_CONCAT(CONCAT(LEFT(c.code1, 3), '-', LEFT(c.code2, 3))
      ORDER BY c.code1 SEPARATOR ', ') AS ranges
  FROM rpt_505_code c
  GROUP BY c.id
) r ON r.id = g.id
GROUP BY g.id, no_dx, n.name1, r.ranges
`;

/**
 * New admissions in range by MOPH รง.505 disease group of the ADMITTING
 * diagnosis ("รับใหม่ (แรกรับ)" view).
 * -> rows { group_id (NULL = not classifiable), no_dx (1 = the admitting OPD
 *    visit has no principal dx), name_th, ranges, admissions }
 *
 * Date basis: ipt.regdate in range — same universe as the admit_new card
 * (all wards incl. home ward). Unlike diseaseGroupsIpd (discharges by final
 * an_stat.pdx, coded 1-3 days after discharge) this is available at once,
 * but provisional: ~53 % agree with the final pdx at 3 characters.
 * code = principal dx of the OPD visit that sent the patient in
 *   (ovstdiag diagtype '1' of ipt.vn); injuries (S/T) re-classified by
 *   external cause (ovstdiag diagtype '5' of the same vn), like OPD.
 *   ipt.vn NULL / no ovstdiag row -> code NULL -> no_dx = 1.
 * Same rpt_505_code / rpt_505_name mapping as diseaseGroupsIpd.
 *
 * Why ovstdiag and not vn_stat.pdx (checked with db-cli, regdate
 * 2025-11-12..2026-11-12, 10,256 admissions): they disagree on only 2 —
 * one fresh visit whose vn_stat.pdx was not yet refreshed (ovstdiag had it)
 * and one old visit whose ovstdiag row was deleted (vn_stat stale).
 * ovstdiag is the source of truth and the fresher of the two, which is the
 * point of this view. No vn has more than one diagtype '1' row.
 *
 * Verified 2026-11-12 (1 day): 46 admissions = admit_new — classified 36,
 * unclassified 2, no_dx 8 (admitting visit has only diagtype '2' rows or no
 * dx yet). 2026-10-13..2026-11-12: 762 (unclassified 22, no_dx 9).
 * Performance: ipt.regdate range scan + dependent subqueries on index
 * ovstdiag.vn; ~8 ms / day, ~35 ms / month, ~0.35 s / 366 d (optimizer
 * switches ipt to a full scan at ~10k of 112k rows; still fast). The
 * vn_stat.pdx variant was ~0.2 s / 366 d — not worth the staleness.
 */
const diseaseGroupsIpdAdmit = `
SELECT
  g.id AS group_id,
  (x.code IS NULL OR x.code = '') AS no_dx,
  n.name1 AS name_th,
  r.ranges,
  SUM(x.admissions) AS admissions
FROM (
  SELECT
    CASE
      WHEN LEFT(p.pdx, 1) IN ('S', 'T') THEN COALESCE(
        (SELECT MIN(d.icd10) FROM ovstdiag d
          WHERE d.vn = p.vn AND d.diagtype = '5'),
        p.pdx)
      ELSE p.pdx
    END AS code,
    COUNT(*) AS admissions
  FROM (
    SELECT
      i.vn,
      (SELECT MIN(d.icd10) FROM ovstdiag d
        WHERE d.vn = i.vn AND d.diagtype = '1') AS pdx
    FROM ipt i
    WHERE i.regdate BETWEEN :from AND :to
  ) p
  GROUP BY code
) x
LEFT JOIN rpt_505_code g ON x.code BETWEEN g.code1 AND g.code2
LEFT JOIN rpt_505_name n ON n.id = g.id
LEFT JOIN (
  SELECT c.id,
    GROUP_CONCAT(CONCAT(LEFT(c.code1, 3), '-', LEFT(c.code2, 3))
      ORDER BY c.code1 SEPARATOR ', ') AS ranges
  FROM rpt_505_code c
  GROUP BY c.id
) r ON r.id = g.id
GROUP BY g.id, no_dx, n.name1, r.ranges
`;

export const OVERVIEW_SQL = {
  cards,
  wards,
  hourly,
  departments,
  pttypes,
  ageSex,
  diseaseGroupsOpd,
  diseaseGroupsIpd,
  diseaseGroupsIpdAdmit,
} as const;
