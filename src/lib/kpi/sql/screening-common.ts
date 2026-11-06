import "server-only";

import type { QueryParams } from "@/lib/db/his";

/**
 * Shared SQL building blocks for the screening KPIs (HOSxP, MySQL/MariaDB).
 *
 * !!! UNVERIFIED !!! — table / column names are assumptions, see
 * docs/kpi/01-screening-dm-ht.md section 7.1 (person, village, ovstdiag)
 * and docs/kpi/03-*.md / 04-*.md (pp_special, nationality).
 *
 * Every indicator is described by a `ScreeningSqlSpec`:
 *   - targetWhere:      WHERE fragment on `person p` = the target group
 *   - screenedSubquery: SELECT person_id, first_screen_date — people with a
 *                       valid screening in [:countFrom, :dataAsOf] and the
 *                       date of their first one (one row per person_id)
 * and the generic builders below turn it into the 5 queries used by the
 * app, so the headline, village and person queries always share exactly
 * the same B / A definition.
 *
 * All SQL is static: fragments are constants chosen by indicator code,
 * never built from user input. Only values are bound via named
 * placeholders. Common parameters:
 *   :periodStart  'YYYY-MM-DD'  fiscal year start (age reference date)
 *   :countFrom    'YYYY-MM-DD'  start of the counting window for A
 *   :dataAsOf     'YYYY-MM-DD'  data cutoff (inclusive)
 *   :villageId    person.village_id (persons-by-village only)
 * plus indicator-specific ones (see each spec's buildParams).
 */

export interface ScreeningSqlContext {
  periodStart: string;
  countFrom: string;
  dataAsOf: string;
}

export interface ScreeningSqlSpec {
  targetWhere: string;
  screenedSubquery: string;
  /** Exactly the named parameters used by targetWhere + screenedSubquery. */
  buildParams(ctx: ScreeningSqlContext): QueryParams;
}

export interface ScreeningSqlSet {
  /** -> one row { eligible } */
  eligible: string;
  /** -> rows { bucket: 'prior' | 'YYYY-MM', screened } */
  monthly: string;
  /** -> rows { village_id, village_moo, village_name, eligible, numerator } */
  village: string;
  /** -> person rows of one village (needs :villageId) */
  personsByVillage: string;
  /** -> person rows of all villages */
  personsAll: string;
  buildParams(ctx: ScreeningSqlContext): QueryParams;
}

/** Hard caps on returned person rows (constants inlined in SQL, never user input). */
export const PERSONS_PER_VILLAGE_LIMIT = 5000;
export const PERSONS_EXPORT_LIMIT = 50000;

/**
 * Living residents of the catchment area.
 * VERIFY: house_regist_type_id 1,3 = TYPEAREA 1/3; person_discharge_id '9'
 * = not discharged; death 'Y' = deceased.
 */
export const PERSON_IN_CATCHMENT_WHERE = `
      p.house_regist_type_id IN ('1', '3')
  AND p.person_discharge_id = '9'
  AND COALESCE(p.death, 'N') <> 'Y'
  AND p.birthdate IS NOT NULL`;

/** Women only. VERIFY: person.sex '2' = female. */
export const PERSON_FEMALE_WHERE = `
  AND p.sex = '2'`;

/** Thai nationality only. VERIFY: person.nationality '99' = ไทย. */
export const PERSON_THAI_WHERE = `
  AND p.nationality = '99'`;

/** Age >= min on :periodStart. Param :birthOnOrBefore = periodStart − min years. */
export const AGE_MIN_WHERE = `
  AND p.birthdate <= :birthOnOrBefore`;

/** Age <= max on :periodStart. Param :birthAfter = periodStart − (max + 1) years. */
export const AGE_MAX_WHERE = `
  AND p.birthdate >  :birthAfter`;

/**
 * Excludes people with an OPD diagnosis in [:icdFrom, :icdToExclusive)
 * before :periodStart (sargable string range on ovstdiag.icd10).
 * VERIFY: person.patient_hn = ovstdiag.hn; icd10 stored without dot.
 */
export const NO_PRIOR_DIAGNOSIS_WHERE = `
  AND NOT EXISTS (
        SELECT 1
        FROM ovstdiag d
        WHERE d.hn = p.patient_hn
          AND d.icd10 >= :icdFrom
          AND d.icd10 <  :icdToExclusive
          AND d.vstdate < :periodStart
      )`;

/** periodStart ('YYYY-MM-DD', always 1 Oct) minus `years` years. */
export function minusYears(isoDate: string, years: number): string {
  return `${Number(isoDate.slice(0, 4)) - years}${isoDate.slice(4)}`;
}

/** Age bound parameters for AGE_MIN_WHERE / AGE_MAX_WHERE. */
export function ageParams(
  periodStart: string,
  minAge: number,
  maxAge: number | null,
): QueryParams {
  const params: QueryParams = {
    birthOnOrBefore: minusYears(periodStart, minAge),
  };
  if (maxAge !== null) params.birthAfter = minusYears(periodStart, maxAge + 1);
  return params;
}

/**
 * Renders a constant code list as a SQL IN list. Codes come from source
 * constants only and are validated so they can never carry SQL.
 */
export function sqlCodeList(codes: readonly string[]): string {
  if (codes.length === 0) throw new Error("empty code list");
  for (const c of codes) {
    if (!/^[0-9A-Za-z.]{1,16}$/.test(c)) {
      throw new Error(`invalid code literal: ${c}`);
    }
  }
  return codes.map((c) => `'${c}'`).join(", ");
}

/**
 * Person columns: minimal identification only. No CID, phone, address,
 * birthdate, lab or BP values leave the database.
 * VERIFY: person.pname is text (e.g. 'นาย'); person.sex '1'/'2'.
 */
const PERSON_COLUMNS = `
       p.person_id                                       AS person_id,
       CASE WHEN v.village_id IS NULL THEN 0 ELSE p.village_id END AS village_id,
       p.patient_hn                                      AS hn,
       TRIM(CONCAT(COALESCE(p.pname, ''), COALESCE(p.fname, ''), ' ',
                   COALESCE(p.lname, '')))               AS full_name,
       TRIM(CONCAT(COALESCE(p.fname, ''), ' ',
                   COALESCE(p.lname, '')))               AS sort_name,
       CAST(p.sex AS CHAR)                               AS sex,
       TIMESTAMPDIFF(YEAR, p.birthdate, :periodStart)    AS age,
       DATE_FORMAT(sc.first_screen_date, '%Y-%m-%d')     AS screen_date`;

/** Builds the 5 queries of one indicator from its spec. */
export function buildScreeningSql(spec: ScreeningSqlSpec): ScreeningSqlSet {
  const { targetWhere: where, screenedSubquery: screened } = spec;

  const eligible = `
SELECT COUNT(DISTINCT p.person_id) AS eligible
FROM person p
WHERE ${where}
`;

  // First screening before the fiscal year (earlier years of a phase) is
  // reported as one 'prior' bucket; the rest by calendar month.
  const monthly = `
SELECT CASE WHEN sc.first_screen_date < :periodStart THEN 'prior'
            ELSE DATE_FORMAT(sc.first_screen_date, '%Y-%m') END AS bucket,
       COUNT(DISTINCT p.person_id) AS screened
FROM person p
JOIN (${screened}
) sc
  ON sc.person_id = p.person_id
WHERE ${where}
GROUP BY 1
`;

  // People whose village_id is NULL / 0 / not in `village` are grouped
  // under village_id = 0 so the totals still match the headline.
  // VERIFY: person.village_id -> village(village_id, village_moo, village_name)
  const village = `
SELECT CASE WHEN v.village_id IS NULL THEN 0 ELSE p.village_id END AS village_id,
       MAX(CAST(v.village_moo AS CHAR)) AS village_moo,
       MAX(v.village_name)              AS village_name,
       COUNT(DISTINCT p.person_id)      AS eligible,
       COUNT(DISTINCT sc.person_id)     AS numerator
FROM person p
LEFT JOIN village v
  ON v.village_id = p.village_id
LEFT JOIN (${screened}
) sc
  ON sc.person_id = p.person_id
WHERE ${where}
GROUP BY CASE WHEN v.village_id IS NULL THEN 0 ELSE p.village_id END
`;

  // Final ordering (unscreened first, then Thai name order) is applied in
  // code; the SQL ORDER BY only makes the LIMIT deterministic.
  const personsByVillage = `
SELECT ${PERSON_COLUMNS}
FROM person p
LEFT JOIN village v
  ON v.village_id = p.village_id
LEFT JOIN (${screened}
) sc
  ON sc.person_id = p.person_id
WHERE ${where}
  AND p.village_id = :villageId
  AND v.village_id IS NOT NULL
ORDER BY (sc.person_id IS NULL) DESC, p.fname, p.lname, p.person_id
LIMIT ${PERSONS_PER_VILLAGE_LIMIT + 1}
`;

  const personsAll = `
SELECT ${PERSON_COLUMNS}
FROM person p
LEFT JOIN village v
  ON v.village_id = p.village_id
LEFT JOIN (${screened}
) sc
  ON sc.person_id = p.person_id
WHERE ${where}
ORDER BY village_id, (sc.person_id IS NULL) DESC, p.fname, p.lname, p.person_id
LIMIT ${PERSONS_EXPORT_LIMIT + 1}
`;

  return {
    eligible,
    monthly,
    village,
    personsByVillage,
    personsAll,
    buildParams: spec.buildParams,
  };
}
