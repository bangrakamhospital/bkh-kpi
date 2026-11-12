import "server-only";

import type { QueryParams } from "@/lib/db/read-only-pool";
import { DISTRICT_TAMBONS, HDC_UNIT_HOSPCODES } from "@/lib/kpi/district-areas";
import { sqlCodeList } from "./screening-common";

/**
 * Shared building blocks for the district HDC SQL (43 files, `sub_hdc`,
 * MariaDB 10.6). Verified with db-cli --conn 2.
 *
 * Data notes:
 *  - every column is varchar; dates are 'YYYYMMDD' strings, so every date
 *    parameter is bound as 'YYYYMMDD' (see hdcDateParam) and compared as
 *    strings; datetime columns ('YYYYMMDDHHMMSS') are cut with LEFT(…, 8)
 *  - `cid` is an MD5 hash (32 hex), consistent across tables; it is only
 *    used to join / de-duplicate inside SQL and is never returned
 *  - SERVICE / NCDSCREEN / LABFU / DIAGNOSIS start in 2025-10, SPECIALPP in
 *    2025-05 (FY 2569 onward); CHRONIC / PERSON / HOME are full snapshots
 *
 * `residents(cid, vid, hospcode, pid, birth, sex, nation)` = the district
 * population (hospcode + pid = key of the chosen PERSON record, used only
 * by the person-list query to read the name; never returned), one
 * row per person:
 *  1. PERSON typearea 1/3, discharge 9 (alive, living here), valid CID.
 *  2. De-duplicated by CID across ALL units (incl. the hospital 11252)
 *     with ROW_NUMBER(), priority:
 *       a. the record's HOME is a real village of the district (so a
 *          record without / outside-area HOME — e.g. ~3.9k stale 11252
 *          records with no HOME — never hides a valid one),
 *       b. typearea 1 before 3,
 *       c. latest d_update (most recently maintained registration),
 *       d. hospcode (deterministic tie-break).
 *     The chosen record's HOME gives the village:
 *       vid = changwat + ampur + tambon + LPAD(village, 2)
 *     (HOME under the person's hospcode, or the 5-digit code for "GA00…"
 *     units). Must be a real VILLAGE in 650401–650411.
 *  3. Not in DEATH (any unit). RESIDENTS_INCL_DEAD_CTE keeps the dead
 *     (discharge 1 too) for incidence counts.
 * sex / nation / birth come from the chosen record ('2' = female,
 * '099' = Thai, birth 'YYYYMMDD').
 */

/** First day of person-level service data in HDC (FY 2569). */
export const HDC_DATA_START_ISO = "2025-10-01";

const DISTRICT_TAMBON_LIST = sqlCodeList(DISTRICT_TAMBONS.map((t) => t.code));
export const HDC_UNIT_LIST = sqlCodeList(HDC_UNIT_HOSPCODES);

/** 'YYYY-MM-DD' -> 'YYYYMMDD' (HDC date format). */
export function hdcDateParam(isoDate: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) {
    throw new RangeError("invalid ISO date");
  }
  return isoDate.replaceAll("-", "");
}

/** 'YYYYMMDD' -> 'YYYY-MM-DD'; null for empty / malformed values. */
export function hdcDateToIso(value: string | null | undefined): string | null {
  const v = value?.trim();
  if (!v || !/^\d{8}$/.test(v)) return null;
  return `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}`;
}

/** Later of two ISO dates. */
export function maxIsoDate(a: string, b: string): string {
  return a > b ? a : b;
}

/** Earlier of two ISO dates. */
export function minIsoDate(a: string, b: string): string {
  return a < b ? a : b;
}

/** Starts a WITH clause; ends with `residents`. Callers append ",\nname AS (…)". */
/**
 * includeDead: also PERSON discharge 1 (died) and no DEATH exclusion — for
 * incidence counts (CKD5) where patients who died since still count.
 */
function residentsCte(includeDead: boolean): string {
  return `
WITH area_village AS (
  SELECT DISTINCT v.vid
  FROM village v
  WHERE LEFT(v.vid, 6) IN (${DISTRICT_TAMBON_LIST})
),
rec AS (
  SELECT p.cid, p.typearea, p.d_update, p.hospcode, p.pid, p.birth, p.sex, p.nation,
         COALESCE(
           CONCAT(h1.changwat, h1.ampur, h1.tambon, LPAD(h1.village, 2, '0')),
           CONCAT(h2.changwat, h2.ampur, h2.tambon, LPAD(h2.village, 2, '0'))
         ) AS vid
  FROM person p
  LEFT JOIN home h1
    ON h1.hospcode = p.hospcode AND h1.hid = p.hid
  LEFT JOIN home h2
    ON p.hospcode LIKE 'GA%' AND h2.hospcode = RIGHT(p.hospcode, 5) AND h2.hid = p.hid
  WHERE p.typearea IN ('1', '3')
    AND p.discharge IN (${includeDead ? "'9', '1'" : "'9'"})
    AND LENGTH(p.cid) = 32
),
ranked AS (
  SELECT r.cid, r.vid, r.hospcode, r.pid, r.birth, r.sex, r.nation,
         ROW_NUMBER() OVER (
           PARTITION BY r.cid
           ORDER BY (av.vid IS NOT NULL) DESC,
                    r.typearea, r.d_update DESC, r.hospcode
         ) AS rn
  FROM rec r
  LEFT JOIN area_village av ON av.vid = r.vid
),
dead AS (
  SELECT DISTINCT d.cid FROM death d WHERE LENGTH(d.cid) = 32
),
residents AS (
  SELECT k.cid, k.vid, k.hospcode, k.pid, k.birth, k.sex, k.nation
  FROM ranked k
  JOIN area_village av ON av.vid = k.vid
  LEFT JOIN dead dd ON dd.cid = k.cid
  WHERE k.rn = 1${includeDead ? "" : "\n    AND dd.cid IS NULL"}
)`;
}

export const RESIDENTS_CTE = residentsCte(false);
export const RESIDENTS_INCL_DEAD_CTE = residentsCte(true);

/**
 * `known(cid)`: diagnosed with ICD-10 [:icdFrom, :icdToExclusive) before
 * :periodStart in CHRONIC (date_diag) or DIAGNOSIS_OPD / DIAGNOSIS_IPD,
 * any unit. NOTE: diagnosis_opd / ipd exist only from 2025-10.
 */
export const KNOWN_DIAGNOSIS_CTE = `
known AS (
  SELECT c.cid FROM chronic c
  WHERE c.chronic >= :icdFrom AND c.chronic < :icdToExclusive
    AND c.date_diag < :periodStart
  UNION
  SELECT o.cid FROM diagnosis_opd o
  WHERE o.diagcode >= :icdFrom AND o.diagcode < :icdToExclusive
    AND o.date_serv < :periodStart
  UNION
  SELECT i.cid FROM diagnosis_ipd i
  WHERE i.diagcode >= :icdFrom AND i.diagcode < :icdToExclusive
    AND i.datetime_admit < :periodStart
)`;

/** Target-group rules applied to `residents r` (all from source constants). */
export interface TargetRules {
  /** true: requires :birthAfter (age <= maxAge on 1 Oct). */
  maxAge: boolean;
  female: boolean;
  thaiOnly: boolean;
  /** true: requires KNOWN_DIAGNOSIS_CTE before and excludes `known`. */
  excludeKnown: boolean;
}

/**
 * `<name>(cid, vid)` from residents: age >= min (:birthOnOrBefore; birth
 * before 1900 = placeholder date, excluded), optional max age / female /
 * Thai / no prior diagnosis.
 */
export function targetCte(name: string, rules: TargetRules): string {
  if (!/^[a-z_]+$/.test(name)) throw new Error("invalid CTE name");
  return `
${name} AS (
  SELECT r.cid, r.vid, r.hospcode, r.pid, r.birth, r.sex
  FROM residents r${rules.excludeKnown ? "\n  LEFT JOIN known kn ON kn.cid = r.cid" : ""}
  WHERE r.birth >= '19000101'
    AND r.birth <= :birthOnOrBefore${rules.maxAge ? "\n    AND r.birth > :birthAfter" : ""}${rules.female ? "\n    AND r.sex = '2'" : ""}${rules.thaiOnly ? "\n    AND r.nation = '099'" : ""}${rules.excludeKnown ? "\n    AND kn.cid IS NULL" : ""}
)`;
}

export interface HdcScreeningSqlContext {
  /** ISO 'YYYY-MM-DD'. */
  periodStart: string;
  countFrom: string;
  dataAsOf: string;
}

export interface HdcScreeningSqlSet {
  /** -> rows { vid, eligible, numerator } (one per village with target people). */
  village: string;
  /** Person list of one village (needs :vid), patient-identifiable. */
  personsByVillage: string;
  /** Person list of one sub-district (needs :tambon), patient-identifiable. */
  personsByTambon: string;
  /** true: person rows carry suspect_date (DMC / HTC). */
  withSuspect: boolean;
  buildParams(ctx: HdcScreeningSqlContext): QueryParams;
}

/** Final SELECT over CTEs `target(cid, vid)` and `screened(cid, …)`. */
export function villageSql(withClause: string): string {
  return `${withClause}
SELECT t.vid AS vid,
       COUNT(*) AS eligible,
       COUNT(s.cid) AS numerator
FROM target t
LEFT JOIN screened s ON s.cid = t.cid
GROUP BY t.vid
`;
}

/** Hard caps on returned person rows (constants inlined, never user input). */
export const HDC_PERSONS_PER_VILLAGE_LIMIT = 5000;
export const HDC_PERSONS_PER_TAMBON_LIMIT = 20000;

const UNIT_CODE = (col: string) =>
  `CASE WHEN ${col} LIKE 'GA%' THEN RIGHT(${col}, 5) ELSE ${col} END`;

/**
 * Person list over the SAME CTEs as villageSql (so the list is exactly B
 * and `screen_date IS NOT NULL` is exactly A). Name from the chosen PERSON
 * record (PK hospcode + pid), prename decoded via c_person_prename, unit
 * names via c_hospital ("GA00…" -> 5-digit code). Returns no CID / PID /
 * HN / birth date to the client (birth is used server-side for the age).
 * screened.first_key = MIN(CONCAT(date_serv, hospcode)) -> date + unit of
 * the first counted service.
 * PERSON.lname is AES-256-GCM encrypted in HDC: returned as lname_enc and
 * decrypted server-side (hdc-crypto.ts); final ordering is done in JS.
 * -> rows { vid, prename, first_name, lname_enc, sex, birth, unit_code, unit_name,
 *           screen_date, screen_unit_code, screen_unit_name[, suspect_date] }
 */
export function personsSql(
  withClause: string,
  scope: "village" | "tambon",
  withSuspect: boolean,
): string {
  const filter =
    scope === "village" ? "t.vid = :vid" : "LEFT(t.vid, 6) = :tambon";
  const limit =
    scope === "village"
      ? HDC_PERSONS_PER_VILLAGE_LIMIT
      : HDC_PERSONS_PER_TAMBON_LIMIT;
  return `${withClause}
SELECT t.vid AS vid,
       pn.prename AS prename,
       p.name AS first_name,
       p.lname AS lname_enc,
       t.sex AS sex,
       t.birth AS birth,
       ${UNIT_CODE("t.hospcode")} AS unit_code,
       uh.hospname AS unit_name,
       LEFT(s.first_key, 8) AS screen_date,
       ${UNIT_CODE("SUBSTRING(s.first_key, 9)")} AS screen_unit_code,
       sh.hospname AS screen_unit_name${withSuspect ? ",\n       t.suspect_date AS suspect_date" : ""}
FROM target t
JOIN person p
  ON p.hospcode = t.hospcode AND p.pid = t.pid
LEFT JOIN c_person_prename pn
  ON pn.code = p.prename
LEFT JOIN c_hospital uh
  ON uh.hospcode = ${UNIT_CODE("t.hospcode")}
LEFT JOIN screened s
  ON s.cid = t.cid
LEFT JOIN c_hospital sh
  ON sh.hospcode = ${UNIT_CODE("SUBSTRING(s.first_key, 9)")}
WHERE ${filter}
ORDER BY t.vid, (s.cid IS NULL) DESC, p.name
LIMIT ${limit + 1}
`;
}

/** The query set of one ratio indicator. */
export function hdcSqlSet(
  withClause: string,
  withSuspect: boolean,
  buildParams: (ctx: HdcScreeningSqlContext) => QueryParams,
): HdcScreeningSqlSet {
  return {
    village: villageSql(withClause),
    personsByVillage: personsSql(withClause, "village", withSuspect),
    personsByTambon: personsSql(withClause, "tambon", withSuspect),
    withSuspect,
    buildParams,
  };
}
