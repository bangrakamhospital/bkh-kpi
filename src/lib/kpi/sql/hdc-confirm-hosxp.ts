import "server-only";

import type { QueryParams } from "@/lib/db/his";
import {
  AGE_MIN_WHERE,
  ageParams,
  NO_PRIOR_CLINIC_MEMBER_WHERE,
  NO_PRIOR_DIAGNOSIS_WHERE,
  PERSON_IN_CATCHMENT_WHERE,
  PERSON_THAI_WHERE,
  PERSONS_EXPORT_LIMIT,
  PERSONS_PER_VILLAGE_LIMIT,
  type ScreeningSqlContext,
  type ScreeningSqlSet,
} from "./screening-common";
import {
  SCREENING_CLINIC_CODE,
  SCREENING_ICD_RANGE,
} from "./screening-hosxp";

/**
 * SQL for HDC 2.1 / 2.2 (KPI Template 2569 6.1 / 6.2): follow-up
 * confirmation of people with suspected DM / HT found by screening.
 *
 * Verified with db-cli against the production HOSxP database (bkhosxp,
 * MariaDB 10.11) on 2026-11-06 — see docs/kpi/hdc-phase1-definitions.md
 * sections 2.1 / 2.2 for the mapping, assumptions and figures.
 *
 * B (both): Thai catchment residents (TYPEAREA 1/3, real village, alive),
 *   age >= 35 on 1 Oct, no prior diagnosis (ovstdiag E10–E14 / I10–I15
 *   before 1 Oct) and not in the chronic clinic (001 / 002) before 1 Oct,
 *   with a *suspect* screening in person_dmht_risk_screen_head between
 *   1 Oct and :suspectUntil (= 30 Jun of the fiscal year, or dataAsOf if
 *   earlier). suspect_date = first suspect screening date.
 *   - DM: fasting glucose >= 126 mg/dl: last_fgc (FCBG, BSTEST 3) or
 *     last_fpg (FPG, BSTEST 1).
 *   - HT: average of the screening's BP readings
 *     (person_ht_risk_bp_screen, normally readings 1–2; head.last_bps /
 *     last_bpd is only the *last* reading and is used as fallback) with
 *     SBP 140–<180 and/or DBP 90–<110, and neither SBP >= 180 nor
 *     DBP >= 110 (those are "suspected severe", outside this group).
 * A: people of B with a confirmation test on a date AFTER suspect_date
 *   up to :confirmUntil (= min(dataAsOf, 30 Sep)):
 *   - DM: lab FPG = lab_items with provis_labcode '0531002' (HDC LABFU
 *     0531002): 76 'Glucose (FBS)' (active) and 817 '(N)Glucose(FBS)'
 *     (inactive, kept for history), dated by lab_head.order_date
 *     (lab_order.laborder_date is always NULL at this site), with a
 *     non-empty result. 306 'Glucose (Meter)' (capillary) is NOT a lab FPG.
 *   - HT: OBPM only = an OPD visit with opdscreen.bps > 0 AND bpd > 0
 *     (= 43-file SERVICE.SBP/DBP). HBPM is recorded in the provincial HDC
 *     system, not in HOSxP, so this can be lower than HDC.
 *   confirm_date = first such date (bucket for the monthly series and the
 *   person "screen_date" column, so the generic UI shows status = in A).
 *
 * Each set has the same shape as ScreeningSqlSet (eligible / monthly /
 * village / personsByVillage / personsAll), so it can be registered next
 * to the screening indicators. Column meanings:
 *   eligible   = B (suspected), numerator = A (confirmed)
 *   monthly    = bucket by month of confirm_date, column `screened` = A
 *   persons    = everybody in B; `screen_date` = confirm_date (NULL = not
 *                confirmed yet), extra column `suspect_date`.
 *
 * Parameters (all bound, never concatenated):
 *   :periodStart     'YYYY-MM-DD'  1 Oct of the fiscal year
 *   :suspectUntil    'YYYY-MM-DD'  last day a suspect screening counts
 *   :confirmUntil    'YYYY-MM-DD'  last day a confirmation counts
 *   :birthOnOrBefore 'YYYY-MM-DD'  periodStart minus 35 years
 *   :icdFrom / :icdToExclusive, :clinicCode  (see screening-hosxp.ts)
 *   :villageId       person.village_id (personsByVillage only)
 *
 * Performance (EXPLAIN, see docs): one full scan of the screening head
 * (~160k rows, no index on screen_date) materialised once as `su`, then
 * person by PK and the per-person filters / confirmation lookups by index
 * (lab_head(hn, order_date), opdscreen(hn)) for the few hundred people of
 * B only. 0.1–3 s per query on the live server (cold buffer ~3 s).
 */

type ConfirmCode = "DM" | "HT";

/** HOSxP lab_items.lab_items_code mapped to HDC LABFU 0531002 (verified). */
export const FPG_LAB_ITEM_CODES: readonly number[] = [76, 817];

/** Thresholds (mg/dl, mmHg) of the suspected group. */
export const CONFIRM_THRESHOLDS = {
  fastingGlucoseMin: 126,
  sbpMin: 140,
  sbpSevere: 180,
  dbpMin: 90,
  dbpSevere: 110,
} as const;

/** Renders constant integer codes as a SQL IN list (validated, never user input). */
function sqlIntList(codes: readonly number[]): string {
  if (codes.length === 0) throw new Error("empty code list");
  for (const c of codes) {
    if (!Number.isSafeInteger(c) || c < 0) {
      throw new Error(`invalid integer code: ${c}`);
    }
  }
  return codes.join(", ");
}

const T = CONFIRM_THRESHOLDS;

/** Suspect screenings in [:periodStart, :suspectUntil]: one row per person. */
const SUSPECT_CTE: Record<ConfirmCode, string> = {
  DM: `
su AS (
  SELECT s.person_id, MIN(h.screen_date) AS suspect_date
  FROM person_dmht_risk_screen_head h
  JOIN person_dmht_screen_summary s
    ON s.person_dmht_screen_summary_id = h.person_dmht_screen_summary_id
  WHERE h.screen_date >= :periodStart
    AND h.screen_date <  DATE_ADD(:suspectUntil, INTERVAL 1 DAY)
    AND (h.last_fgc >= ${T.fastingGlucoseMin} OR h.last_fpg >= ${T.fastingGlucoseMin})
  GROUP BY s.person_id
)`,
  HT: `
hb AS (
  SELECT h.person_dmht_screen_summary_id,
         h.screen_date,
         COALESCE(AVG(c.bps), MAX(h.last_bps)) AS avg_sbp,
         COALESCE(AVG(c.bpd), MAX(h.last_bpd)) AS avg_dbp
  FROM person_dmht_risk_screen_head h
  LEFT JOIN person_ht_risk_bp_screen c
    ON c.person_dmht_risk_screen_head_id = h.person_dmht_risk_screen_head_id
   AND c.bps > 0
   AND c.bpd > 0
  WHERE h.screen_date >= :periodStart
    AND h.screen_date <  DATE_ADD(:suspectUntil, INTERVAL 1 DAY)
    AND h.last_bps > 0
    AND h.last_bpd > 0
  GROUP BY h.person_dmht_risk_screen_head_id,
           h.person_dmht_screen_summary_id,
           h.screen_date
),
su AS (
  SELECT s.person_id, MIN(hb.screen_date) AS suspect_date
  FROM hb
  JOIN person_dmht_screen_summary s
    ON s.person_dmht_screen_summary_id = hb.person_dmht_screen_summary_id
  WHERE (hb.avg_sbp >= ${T.sbpMin} OR hb.avg_dbp >= ${T.dbpMin})
    AND hb.avg_sbp < ${T.sbpSevere}
    AND hb.avg_dbp < ${T.dbpSevere}
  GROUP BY s.person_id
)`,
};

/**
 * First confirmation after suspect_date, up to :confirmUntil, as a
 * correlated scalar subquery on `person p` / `su` (evaluated only for the
 * few hundred people of B; uses lab_head(hn, order_date) / opdscreen(hn)).
 * A separate GROUP BY derived table was tried first: MariaDB turned it
 * into a LATERAL DERIVED table that re-materialised `su` per person and
 * the village query exceeded 60 s.
 */
const CONFIRM_DATE_EXPR: Record<ConfirmCode, string> = {
  DM: `(
    SELECT MIN(lh.order_date)
    FROM lab_head lh
    JOIN lab_order lo
      ON lo.lab_order_number = lh.lab_order_number
    WHERE lh.hn = p.patient_hn
      AND lh.order_date >  su.suspect_date
      AND lh.order_date <  DATE_ADD(:confirmUntil, INTERVAL 1 DAY)
      AND lo.lab_items_code IN (${sqlIntList(FPG_LAB_ITEM_CODES)})
      AND COALESCE(lo.lab_order_result, '') <> ''
  )`,
  HT: `(
    SELECT MIN(o.vstdate)
    FROM opdscreen o
    WHERE o.hn = p.patient_hn
      AND o.vstdate >  su.suspect_date
      AND o.vstdate <  DATE_ADD(:confirmUntil, INTERVAL 1 DAY)
      AND o.bps > 0
      AND o.bpd > 0
  )`,
};

/**
 * B on `person p` joined with su: same population rules as KPI 1–2 plus
 * Thai nationality (HDC 6.1/6.2: PERSON.NATION = 099).
 */
const TARGET_WHERE = `${PERSON_IN_CATCHMENT_WHERE}${PERSON_THAI_WHERE}${AGE_MIN_WHERE}${NO_PRIOR_DIAGNOSIS_WHERE}${NO_PRIOR_CLINIC_MEMBER_WHERE}`;

/**
 * tg = B, one row per person, with suspect_date and confirm_date (NULL =
 * not in A). STRAIGHT_JOIN forces `su` (a few hundred rows) to be read
 * first: with a plain JOIN and a selective outer filter (village) MariaDB
 * chose a "split materialized" LATERAL plan that re-aggregated the
 * screening heads per person and exceeded the 60 s limit.
 */
function targetCte(code: ConfirmCode): string {
  return `
tg AS (
  SELECT p.person_id,
         p.village_id,
         su.suspect_date,
         ${CONFIRM_DATE_EXPR[code]} AS confirm_date
  FROM su
  STRAIGHT_JOIN person p
    ON p.person_id = su.person_id
  WHERE ${TARGET_WHERE}
)`;
}

/**
 * Person columns: same minimal identification as the screening person
 * queries (no CID, phone, address, birthdate, glucose or BP values).
 * screen_date = confirm date (NULL = not confirmed) so the generic person
 * mapping (status = screen_date !== null) works unchanged.
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
       DATE_FORMAT(tg.confirm_date, '%Y-%m-%d')          AS screen_date,
       DATE_FORMAT(tg.suspect_date, '%Y-%m-%d')          AS suspect_date`;

/** 'YYYY-MM-DD' string min (ISO dates compare lexicographically). */
function minDate(a: string, b: string): string {
  return a < b ? a : b;
}

/** Window parameters derived from the fiscal year context. */
export function confirmWindowParams(ctx: ScreeningSqlContext): {
  suspectUntil: string;
  confirmUntil: string;
} {
  const endYear = Number(ctx.periodStart.slice(0, 4)) + 1;
  return {
    suspectUntil: minDate(`${endYear}-06-30`, ctx.dataAsOf),
    confirmUntil: minDate(`${endYear}-09-30`, ctx.dataAsOf),
  };
}

function confirmSql(code: ConfirmCode): ScreeningSqlSet {
  // Every query references tg exactly once.
  const withClause = `WITH ${SUSPECT_CTE[code]},${targetCte(code)}`;

  const eligible = `
${withClause}
SELECT COUNT(*) AS eligible
FROM tg
`;

  // confirm_date is always > suspect_date >= :periodStart, so 'prior'
  // never occurs; kept for shape compatibility with the screening sets.
  const monthly = `
${withClause}
SELECT CASE WHEN tg.confirm_date < :periodStart THEN 'prior'
            ELSE DATE_FORMAT(tg.confirm_date, '%Y-%m') END AS bucket,
       COUNT(*) AS screened
FROM tg
WHERE tg.confirm_date IS NOT NULL
GROUP BY 1
`;

  const village = `
${withClause}
SELECT CASE WHEN v.village_id IS NULL THEN 0 ELSE tg.village_id END AS village_id,
       MAX(CAST(v.village_moo AS CHAR)) AS village_moo,
       MAX(v.village_name)              AS village_name,
       COUNT(*)                         AS eligible,
       COUNT(tg.confirm_date)           AS numerator
FROM tg
LEFT JOIN village v
  ON v.village_id = tg.village_id
GROUP BY CASE WHEN v.village_id IS NULL THEN 0 ELSE tg.village_id END
`;

  const personsByVillage = `
${withClause}
SELECT ${PERSON_COLUMNS}
FROM tg
JOIN person p
  ON p.person_id = tg.person_id
LEFT JOIN village v
  ON v.village_id = p.village_id
WHERE tg.village_id = :villageId
  AND v.village_id IS NOT NULL
ORDER BY (tg.confirm_date IS NULL) DESC, p.fname, p.lname, p.person_id
LIMIT ${PERSONS_PER_VILLAGE_LIMIT + 1}
`;

  const personsAll = `
${withClause}
SELECT ${PERSON_COLUMNS}
FROM tg
JOIN person p
  ON p.person_id = tg.person_id
LEFT JOIN village v
  ON v.village_id = p.village_id
ORDER BY village_id, (tg.confirm_date IS NULL) DESC, p.fname, p.lname, p.person_id
LIMIT ${PERSONS_EXPORT_LIMIT + 1}
`;

  return {
    eligible,
    monthly,
    village,
    personsByVillage,
    personsAll,
    buildParams: (ctx: ScreeningSqlContext): QueryParams => ({
      periodStart: ctx.periodStart,
      ...confirmWindowParams(ctx),
      ...ageParams(ctx.periodStart, 35, null),
      ...SCREENING_ICD_RANGE[code],
      clinicCode: SCREENING_CLINIC_CODE[code],
    }),
  };
}

/** HDC 2.1 (KPI Template 6.1): confirmation of suspected DM. */
export const DM_CONFIRM_SQL: ScreeningSqlSet = confirmSql("DM");
/** HDC 2.2 (KPI Template 6.2): confirmation of suspected HT (OBPM only). */
export const HT_CONFIRM_SQL: ScreeningSqlSet = confirmSql("HT");
