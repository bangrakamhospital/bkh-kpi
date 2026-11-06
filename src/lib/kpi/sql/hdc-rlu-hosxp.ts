import "server-only";

import type {
  ScreeningSqlContext,
  ScreeningSqlSet,
} from "./screening-common";
import {
  PERSONS_EXPORT_LIMIT,
  PERSONS_PER_VILLAGE_LIMIT,
} from "./screening-common";
import { SCREENING_CLINIC_CODE } from "./screening-hosxp";

/**
 * SQL for HDC 11.3 / 11.4 / 11.5 (KPI Template 2569 no. 30.3 / 30.5 /
 * 30.6, RLU = Rational Lab Use): % of diabetes patients with at least one
 * HbA1c / LDL-C / serum creatinine result in the fiscal year.
 *
 * Verified with db-cli against the production HOSxP database (bkhosxp,
 * MariaDB 10.11) — figures and the reasoning are in
 * docs/kpi/hdc-phase1-definitions.md section 11.3–11.5.
 *
 * B (denominator) = the hospital's DM clinic registry, NOT the catchment
 * population (RLU is a hospital-level indicator):
 *  - clinicmember.clinic = '001' (โรคเบาหวาน, same code as the DM
 *    screening exclusion), one row per hn (verified unique)
 *  - clinic_member_status_id (int) = 1 "ยังรักษาอยู่" (2 = died,
 *    3 = cured, 10 = moved away, 11 = referred elsewhere, ...). HOSxP
 *    keeps no status history, so past fiscal years use today's status.
 *  - registered on or before :dataAsOf (or unknown regdate)
 *  - patient.death <> 'Y' and patient.deathday IS NULL (121 "active"
 *    members are dead in `patient`)
 *
 * A (numerator) = members of B with >= 1 lab RESULT of the test whose
 * order date (lab_head.order_date, indexed with hn) is in
 * [:countFrom, :dataAsOf]. "Result" = lab_order.lab_order_result starts
 * with a number (optionally '<' / '>'); orders without a result and the
 * calculated-LDL text "Triglyceride >400" (no LDL value) are not counted.
 * report_date is within 0 days of order_date for > 99.9% of these tests,
 * so the order date is used (it is the indexed column).
 *
 * Village: RLU patients mostly live outside the catchment (only ~15% of B
 * have an in-area `person`). Patients whose `person` (person.patient_hn,
 * verified 1:1) is a living TYPEAREA 1/3 resident of a real catchment
 * village (village_moo <> 0) are reported under that village; everyone
 * else is reported under village_id = 0 so village rows add up to the
 * hospital total. Village 0 here means "นอกเขตรับผิดชอบ / ไม่ระบุหมู่บ้าน".
 *
 * All SQL is static; codes are source constants, only values are bound.
 * Parameters: :periodStart (age reference), :countFrom (= periodStart),
 * :dataAsOf (inclusive cutoff), :clinicCode, :villageId (persons by
 * village only).
 */

export type RluTestCode = "HBA1C" | "LDL" | "CR";

/**
 * lab_items.lab_items_code (int) per test, verified in this site's
 * lab_items (name / provis_labcode / volume FY2569):
 *  - HBA1C: 334 'HbA1c' (0531601)
 *  - LDL:   876 'LDL-C' calculated (0541402, ~20k tests/yr) and
 *           92 'DLDL-C' direct LDL (0541402, ~0.9k tests/yr, ordered when
 *           TG > 400 makes the calculated value unavailable)
 *  - CR:    78 'Creatinine' serum (0581902, ~44k tests/yr) and
 *           1055 'Cr' heparinised blood (0581902, unused since 2025, kept
 *           so older years still count). Urine creatinine (242, 243,
 *           1036, 1038) and eGFR (921) are NOT counted.
 */
export const RLU_LAB_ITEM_CODES: Record<RluTestCode, readonly number[]> = {
  HBA1C: [334],
  LDL: [876, 92],
  CR: [78, 1055],
};

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

/** WHERE fragment of B on `clinicmember cm JOIN patient pt`. */
const DM_REGISTRY_WHERE = `
      cm.clinic = :clinicCode
  AND cm.clinic_member_status_id = 1
  AND (cm.regdate IS NULL OR cm.regdate <= :dataAsOf)
  AND COALESCE(pt.death, 'N') <> 'Y'
  AND pt.deathday IS NULL`;

const DM_REGISTRY_FROM = `
FROM clinicmember cm
JOIN patient pt
  ON pt.hn = cm.hn`;

/**
 * In-area person -> real village id, else 0. Needs
 * `LEFT JOIN person p ON p.patient_hn = cm.hn LEFT JOIN village v ON
 * v.village_id = p.village_id`. Same rules as PERSON_IN_CATCHMENT_WHERE.
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
  ON p.patient_hn = cm.hn
LEFT JOIN village v
  ON v.village_id = p.village_id`;

/** hn + first result date of the test in [:countFrom, :dataAsOf]. */
function testedSubquery(test: RluTestCode): string {
  return `
  SELECT h.hn, MIN(h.order_date) AS first_test_date
  FROM lab_head h
  JOIN lab_order lo
    ON lo.lab_order_number = h.lab_order_number
  WHERE h.order_date >= :countFrom
    AND h.order_date <  DATE_ADD(:dataAsOf, INTERVAL 1 DAY)
    AND lo.lab_items_code IN (${sqlIntList(RLU_LAB_ITEM_CODES[test])})
    AND lo.lab_order_result REGEXP '^[<>]?[ ]*[0-9]'
  GROUP BY h.hn`;
}

/**
 * Person list columns, same names as the screening person queries.
 * Identity comes from `patient` (every member has one; `person` may be
 * missing). person_id is 0 when the patient has no `person` row (1 of
 * ~7,100 in FY2569). screen_date = first test date in the window.
 */
const PERSON_COLUMNS = `
       COALESCE(p.person_id, 0)                          AS person_id,
       ${VILLAGE_ID_EXPR} AS village_id,
       cm.hn                                             AS hn,
       TRIM(CONCAT(COALESCE(pt.pname, ''), COALESCE(pt.fname, ''), ' ',
                   COALESCE(pt.lname, '')))              AS full_name,
       TRIM(CONCAT(COALESCE(pt.fname, ''), ' ',
                   COALESCE(pt.lname, '')))              AS sort_name,
       CAST(pt.sex AS CHAR)                              AS sex,
       TIMESTAMPDIFF(YEAR, pt.birthday, :periodStart)    AS age,
       DATE_FORMAT(lt.first_test_date, '%Y-%m-%d')       AS screen_date`;

function rluSql(test: RluTestCode): ScreeningSqlSet {
  const tested = testedSubquery(test);

  const eligible = `
SELECT COUNT(DISTINCT cm.hn) AS eligible
${DM_REGISTRY_FROM}
WHERE ${DM_REGISTRY_WHERE}
`;

  // countFrom = periodStart, so 'prior' never occurs; kept for the
  // shared MonthlyRow contract.
  const monthly = `
SELECT CASE WHEN lt.first_test_date < :periodStart THEN 'prior'
            ELSE DATE_FORMAT(lt.first_test_date, '%Y-%m') END AS bucket,
       COUNT(DISTINCT cm.hn) AS screened
${DM_REGISTRY_FROM}
JOIN (${tested}
) lt
  ON lt.hn = cm.hn
WHERE ${DM_REGISTRY_WHERE}
GROUP BY 1
`;

  // Village name / moo only for in-area rows: bucket 0 also holds people
  // whose person.village_id points at the pseudo-village "นอกเขต".
  const village = `
SELECT ${VILLAGE_ID_EXPR} AS village_id,
       MAX(CASE WHEN ${IN_AREA_CONDITION}
                THEN CAST(v.village_moo AS CHAR) END) AS village_moo,
       MAX(CASE WHEN ${IN_AREA_CONDITION}
                THEN v.village_name END)              AS village_name,
       COUNT(DISTINCT cm.hn)                          AS eligible,
       COUNT(DISTINCT lt.hn)                          AS numerator
${DM_REGISTRY_FROM}
${PERSON_VILLAGE_JOIN}
LEFT JOIN (${tested}
) lt
  ON lt.hn = cm.hn
WHERE ${DM_REGISTRY_WHERE}
GROUP BY 1
`;

  const personsByVillage = `
SELECT ${PERSON_COLUMNS}
${DM_REGISTRY_FROM}
${PERSON_VILLAGE_JOIN}
LEFT JOIN (${tested}
) lt
  ON lt.hn = cm.hn
WHERE ${DM_REGISTRY_WHERE}
  AND p.village_id = :villageId
  AND ${IN_AREA_CONDITION}
ORDER BY (lt.hn IS NULL) DESC, pt.fname, pt.lname, cm.hn
LIMIT ${PERSONS_PER_VILLAGE_LIMIT + 1}
`;

  const personsAll = `
SELECT ${PERSON_COLUMNS}
${DM_REGISTRY_FROM}
${PERSON_VILLAGE_JOIN}
LEFT JOIN (${tested}
) lt
  ON lt.hn = cm.hn
WHERE ${DM_REGISTRY_WHERE}
ORDER BY village_id, (lt.hn IS NULL) DESC, pt.fname, pt.lname, cm.hn
LIMIT ${PERSONS_EXPORT_LIMIT + 1}
`;

  return {
    eligible,
    monthly,
    village,
    personsByVillage,
    personsAll,
    buildParams: (ctx: ScreeningSqlContext) => ({
      periodStart: ctx.periodStart,
      countFrom: ctx.countFrom,
      dataAsOf: ctx.dataAsOf,
      clinicCode: SCREENING_CLINIC_CODE.DM,
    }),
  };
}

/** 11.3 (30.3) DM patients with >= 1 HbA1c in the fiscal year. */
export const RLU_HBA1C_SQL: ScreeningSqlSet = rluSql("HBA1C");
/** 11.4 (30.5) DM patients with >= 1 LDL-C (calculated or direct). */
export const RLU_LDL_SQL: ScreeningSqlSet = rluSql("LDL");
/** 11.5 (30.6) DM patients with >= 1 serum creatinine. */
export const RLU_CR_SQL: ScreeningSqlSet = rluSql("CR");
