import "server-only";

import type {
  ScreeningSqlContext,
  ScreeningSqlSet,
} from "./screening-common";
import {
  PERSONS_EXPORT_LIMIT,
  PERSONS_PER_VILLAGE_LIMIT,
  sqlCodeList,
} from "./screening-common";

/**
 * SQL for "อัตราตายของผู้ป่วยโรคกล้ามเนื้อหัวใจตายเฉียบพลันชนิด STEMI"
 * (KPI Template 2569 no. 19, Service Plan cardiology, pages 67–68).
 * Formula (A / B) × 100, LOWER is better (target: < 9 % in FY2569/2570).
 *
 * Verified with db-cli against the production HOSxP database (bkhosxp,
 * MariaDB 10.11) on 2026-11-06 — definition, citations, mapping,
 * assumptions and figures are in docs/kpi/stemi-mortality.md.
 *
 * Unit = STEMI EPISODE ("นับการเจ็บป่วยในครั้งนั้นเป็น 1 visit"), not person.
 * Population = every patient served by the hospital (hospital-level KPI,
 * no catchment / age / nationality filter).
 *
 * STEMI encounter ("ev"), ICD-10 I21.0–I21.3 (stored without dot, any
 * diagnosis type), one of:
 *   - an OPD visit (ovstdiag -> ovst) that is "acute": an ER visit
 *     (er_regist.vn), referred out from that visit (referout.vn) or
 *     admitted from it (ovst.an). Plain OPD visits with an I21.x code are
 *     follow-ups of an old infarct (coding habit) and are NOT counted.
 *   - an admission (ipt.regdate) with the code in iptdiag.
 * This site refers almost every STEMI from the ER, so the ER + refer path
 * carries ~90 % of B.
 *
 * Episode ("ep"): encounters of the same hn within 28 days (the ICD-10
 * window of an acute MI, I21 vs I22) belong to one episode; an encounter
 * with no other encounter in the previous 28 days starts a new episode.
 * event_date = first encounter date; the episode belongs to the fiscal year
 * containing event_date. Encounters from 28 days before :periodStart are
 * read so a continuation on 1 Oct does not become a new episode.
 *
 * Death (A): died AT THIS HOSPITAL within [event_date, event_date + 28 d]:
 *   - OPD/ER visit discharged dead: ovst.ovstost = '52' (ovstost table:
 *     death_status = 'Y', 43-file export code 4)
 *   - admission discharged dead: ipt.dchtype IN ('08','09') or
 *     ipt.dchstts IN ('08','09') (standard HOSxP / 43-file codes)
 * Deaths after referral at the receiving hospital are NOT in HOSxP and are
 * not counted (the template's A is "เสียชีวิตในโรงพยาบาล"). `totals` also
 * returns deaths_any_30d (patient.deathday within 30 days, partial
 * coverage of deaths elsewhere) for information only.
 * The death window is not cut at :dataAsOf, so a past fiscal year is final
 * 28 days after its end (episodes of late September).
 *
 * All SQL is static; codes are source constants, only values are bound.
 * Parameters: :periodStart (FY start, also the age reference date),
 * :dataAsOf (inclusive cutoff for event_date), :villageId (persons by
 * village only). countFrom is not used (always = periodStart).
 */

/** ICD-10 (no dot) of STEMI per the template: I21.0–I21.3. */
export const STEMI_ICD10: readonly string[] = ["I210", "I211", "I212", "I213"];

export const STEMI_RULES = {
  /** Encounters within this many days of the previous one = same episode. */
  episodeDays: 28,
  /** Deaths at this hospital within this many days of event_date count in A. */
  deathWindowDays: 28,
  /** Window (days) of the informational deaths_any_30d (patient.deathday). */
  anyDeathDays: 30,
} as const;

/** ovst.ovstost codes with ovstost.death_status = 'Y' (verified: only '52'). */
export const OPD_DEAD_OVSTOST: readonly string[] = ["52"];
/** ipt.dchtype 08/09 = dead (autopsy / no autopsy); dchstts 08/09 = dead. */
export const IPD_DEAD_DCHTYPE: readonly string[] = ["08", "09"];
export const IPD_DEAD_DCHSTTS: readonly string[] = ["08", "09"];

const R = STEMI_RULES;
const ICD = sqlCodeList(STEMI_ICD10);
const OPD_DEAD = sqlCodeList(OPD_DEAD_OVSTOST);
const IPD_DEAD_TYPE = sqlCodeList(IPD_DEAD_DCHTYPE);
const IPD_DEAD_STTS = sqlCodeList(IPD_DEAD_DCHSTTS);

/**
 * ep = STEMI episodes with event_date in [:periodStart, :dataAsOf], one row
 * per (hn, event_date), with death_date (NULL = survived at this hospital)
 * and died_any_30d (0/1, informational).
 */
const EPISODE_CTES = `
WITH
ev AS (
  SELECT o.hn, o.vstdate AS d
  FROM ovstdiag dx
  JOIN ovst o
    ON o.vn = dx.vn
  WHERE dx.icd10 IN (${ICD})
    AND dx.vstdate >= DATE_SUB(:periodStart, INTERVAL ${R.episodeDays} DAY)
    AND dx.vstdate <  DATE_ADD(:dataAsOf, INTERVAL 1 DAY)
    AND (    EXISTS (SELECT 1 FROM er_regist e WHERE e.vn = o.vn)
          OR EXISTS (SELECT 1 FROM referout r WHERE r.vn = o.vn)
          OR COALESCE(o.an, '') <> '')
  UNION
  SELECT i.hn, i.regdate AS d
  FROM ipt i
  JOIN iptdiag dx
    ON dx.an = i.an
  WHERE dx.icd10 IN (${ICD})
    AND i.regdate >= DATE_SUB(:periodStart, INTERVAL ${R.episodeDays} DAY)
    AND i.regdate <  DATE_ADD(:dataAsOf, INTERVAL 1 DAY)
),
ew AS (
  SELECT ev.hn,
         ev.d,
         COUNT(*) OVER (PARTITION BY ev.hn ORDER BY TO_DAYS(ev.d)
                        RANGE BETWEEN ${R.episodeDays} PRECEDING
                                  AND 1 PRECEDING) AS n_prev
  FROM ev
),
ep0 AS (
  SELECT ew.hn, ew.d AS event_date
  FROM ew
  WHERE ew.n_prev = 0
    AND ew.d >= :periodStart
),
ep AS (
  SELECT ep0.hn,
         ep0.event_date,
         LEAST(
           COALESCE((SELECT MIN(o.vstdate)
                     FROM ovst o
                     WHERE o.hn = ep0.hn
                       AND o.vstdate >= ep0.event_date
                       AND o.vstdate <= DATE_ADD(ep0.event_date, INTERVAL ${R.deathWindowDays} DAY)
                       AND o.ovstost IN (${OPD_DEAD})), '9999-12-31'),
           COALESCE((SELECT MIN(i.dchdate)
                     FROM ipt i
                     WHERE i.hn = ep0.hn
                       AND i.dchdate >= ep0.event_date
                       AND i.dchdate <= DATE_ADD(ep0.event_date, INTERVAL ${R.deathWindowDays} DAY)
                       AND (   i.dchtype IN (${IPD_DEAD_TYPE})
                            OR i.dchstts IN (${IPD_DEAD_STTS}))), '9999-12-31')
         ) AS death_or_max,
         (SELECT COUNT(*)
          FROM patient pd
          WHERE pd.hn = ep0.hn
            AND pd.deathday >= ep0.event_date
            AND pd.deathday <= DATE_ADD(ep0.event_date, INTERVAL ${R.anyDeathDays} DAY)
         ) AS died_any_30d
  FROM ep0
)`;

/** NULL when survived (no death at this hospital in the window). */
const DEATH_DATE = `NULLIF(ep.death_or_max, '9999-12-31')`;

/**
 * In-area person -> real village id, else 0. Same rules as
 * PERSON_IN_CATCHMENT_WHERE / ckd5-hosxp.ts EXCEPT the "still living"
 * conditions (person_discharge_id = 9, death <> 'Y'): a patient who died is
 * marked dead in `person` too, so with those conditions every death would
 * fall into village 0. Needs PERSON_VILLAGE_JOIN. person.patient_hn is 1:1
 * with patient.hn.
 */
const IN_AREA_CONDITION_INCL_DEAD = `p.house_regist_type_id IN (1, 3)
       AND v.village_id IS NOT NULL
       AND TRIM(LEADING '0' FROM TRIM(v.village_moo)) <> ''`;

const VILLAGE_ID_EXPR = `CASE WHEN ${IN_AREA_CONDITION_INCL_DEAD}
       THEN p.village_id ELSE 0 END`;

const PERSON_VILLAGE_JOIN = `
LEFT JOIN person p
  ON p.patient_hn = ep.hn
LEFT JOIN village v
  ON v.village_id = p.village_id`;

/**
 * Person list columns: same names as the screening person queries, plus
 * event_date and status. One row per EPISODE (a patient may appear twice
 * in a year if two episodes are > 28 days apart).
 * screen_date = death date (NULL = survived) so the shared "screened" flag
 * means "counted in A". Identity from `patient`. No clinical values, CID,
 * phone or address.
 */
const PERSON_COLUMNS = `
       COALESCE(p.person_id, 0)                          AS person_id,
       ${VILLAGE_ID_EXPR} AS village_id,
       ep.hn                                             AS hn,
       TRIM(CONCAT(COALESCE(pt.pname, ''), COALESCE(pt.fname, ''), ' ',
                   COALESCE(pt.lname, '')))              AS full_name,
       TRIM(CONCAT(COALESCE(pt.fname, ''), ' ',
                   COALESCE(pt.lname, '')))              AS sort_name,
       CAST(pt.sex AS CHAR)                              AS sex,
       TIMESTAMPDIFF(YEAR, pt.birthday, :periodStart)    AS age,
       DATE_FORMAT(${DEATH_DATE}, '%Y-%m-%d')            AS screen_date,
       DATE_FORMAT(ep.event_date, '%Y-%m-%d')            AS event_date,
       CASE WHEN ep.death_or_max < '9999-12-31'
            THEN 'died' ELSE 'survived' END              AS status`;

/** -> one row { patients (B), deaths (A), deaths_any_30d (info only) } */
const totals = `${EPISODE_CTES}
SELECT COUNT(*)                                                  AS patients,
       COUNT(CASE WHEN ep.death_or_max < '9999-12-31' THEN 1 END) AS deaths,
       COUNT(CASE WHEN ep.death_or_max < '9999-12-31'
                    OR ep.died_any_30d > 0 THEN 1 END)           AS deaths_any_30d
FROM ep
`;

/** -> one row { eligible } = B (ScreeningSqlSet contract). */
const eligible = `${EPISODE_CTES}
SELECT COUNT(*) AS eligible
FROM ep
`;

/**
 * -> rows { bucket 'YYYY-MM', screened (= deaths A), eligible (= episodes B) }
 * by month of event_date. Mortality needs B per month for a cumulative
 * rate (cum. A / cum. B), unlike the screening indicators.
 */
const monthly = `${EPISODE_CTES}
SELECT DATE_FORMAT(ep.event_date, '%Y-%m')                       AS bucket,
       COUNT(CASE WHEN ep.death_or_max < '9999-12-31' THEN 1 END) AS screened,
       COUNT(*)                                                  AS eligible
FROM ep
GROUP BY DATE_FORMAT(ep.event_date, '%Y-%m')
`;

/**
 * -> rows { village_id, village_moo, village_name, eligible (B), numerator (A) }
 * village_id 0 = outside the catchment / unknown (most patients).
 */
const village = `${EPISODE_CTES}
SELECT ${VILLAGE_ID_EXPR} AS village_id,
       MAX(CASE WHEN ${IN_AREA_CONDITION_INCL_DEAD}
                THEN CAST(v.village_moo AS CHAR) END)            AS village_moo,
       MAX(CASE WHEN ${IN_AREA_CONDITION_INCL_DEAD}
                THEN v.village_name END)                         AS village_name,
       COUNT(*)                                                  AS eligible,
       COUNT(CASE WHEN ep.death_or_max < '9999-12-31' THEN 1 END) AS numerator
FROM ep
${PERSON_VILLAGE_JOIN}
GROUP BY 1
`;

const personsByVillage = `${EPISODE_CTES}
SELECT ${PERSON_COLUMNS}
FROM ep
JOIN patient pt
  ON pt.hn = ep.hn
${PERSON_VILLAGE_JOIN}
WHERE p.village_id = :villageId
  AND ${IN_AREA_CONDITION_INCL_DEAD}
ORDER BY ep.event_date, pt.fname, pt.lname, ep.hn
LIMIT ${PERSONS_PER_VILLAGE_LIMIT + 1}
`;

const personsAll = `${EPISODE_CTES}
SELECT ${PERSON_COLUMNS}
FROM ep
JOIN patient pt
  ON pt.hn = ep.hn
${PERSON_VILLAGE_JOIN}
ORDER BY village_id, ep.event_date, pt.fname, pt.lname, ep.hn
LIMIT ${PERSONS_EXPORT_LIMIT + 1}
`;

/** ScreeningSqlSet plus a one-shot `totals` query (A, B and info column). */
export interface StemiSqlSet extends ScreeningSqlSet {
  totals: string;
}

/** KPI Template 2569 no. 19: STEMI mortality (A / B × 100, lower is better). */
export const STEMI_SQL: StemiSqlSet = {
  totals,
  eligible,
  monthly,
  village,
  personsByVillage,
  personsAll,
  buildParams: (ctx: ScreeningSqlContext) => ({
    periodStart: ctx.periodStart,
    dataAsOf: ctx.dataAsOf,
  }),
};

