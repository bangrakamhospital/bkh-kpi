import "server-only";

import type { QueryParams } from "@/lib/db/read-only-pool";
import { hdcDateParam, HDC_UNIT_LIST } from "./hdc-common";
import { sqlCodeList } from "./screening-common";
import { STEMI_ICD10, STEMI_RULES } from "./stemi-hosxp";

/**
 * KPI 11 (STEMI mortality, LOWER is better) on the district HDC database,
 * DISTRICT TOTAL ONLY (numbers are small and could identify a patient; the
 * API requires login). Mirrors stemi-hosxp.ts (read-only import of its
 * constants) with the 43-file equivalents:
 *
 * STEMI encounter, ICD-10 I21.0–I21.3 (STEMI_ICD10), any unit of the
 * district, any patient served (no residence filter — like HOSxP):
 *   - DIAGNOSIS_OPD joined to its SERVICE (hospcode, seq, date_serv) when
 *     the visit is "acute": typeout 2 (admitted), 3 (referred out),
 *     4 / 6 (died / died during referral), or typein 3 (referred in) /
 *     4 (EMS). SERVICE has no ER flag (HOSxP uses er_regist), so plain
 *     follow-up visits are excluded the same way as HOSxP.
 *   - DIAGNOSIS_IPD (admit date).
 * Episode: encounters of the same CID within 28 days form one episode;
 * event_date = first encounter. Encounters from 28 days before
 * :periodStart are read so a continuation is not a new episode.
 * Death (A) within [event_date, event_date + 28 d] at any district unit:
 *   SERVICE typeout 4 (เสียชีวิต), ADMISSION dischstatus 9 / dischtype
 *   8, 9 (discharge date), or DEATH with hospdeath = a district unit
 *   (= "died at a district hospital"). Deaths at the referral hospital
 *   are not counted (template A = เสียชีวิตในโรงพยาบาล; same as HOSxP).
 *
 * Parameters ('YYYYMMDD'): :lookbackStart (periodStart − 28 d),
 * :periodStart, :dataAsOf. -> one row { episodes, deaths }
 */

const ICD = sqlCodeList(STEMI_ICD10);
const R = STEMI_RULES;

/** 'YYYYMMDD' string -> DATE. */
const D = (col: string) => `STR_TO_DATE(${col}, '%Y%m%d')`;

export const HDC_STEMI_TOTALS_SQL = `
WITH
ev AS (
  SELECT d.cid, d.date_serv AS d
  FROM diagnosis_opd d
  JOIN service s
    ON s.hospcode = d.hospcode AND s.seq = d.seq AND s.date_serv = d.date_serv
  WHERE d.diagcode IN (${ICD})
    AND d.date_serv >= :lookbackStart
    AND d.date_serv <= :dataAsOf
    AND (s.typeout IN ('2', '3', '4', '6') OR s.typein IN ('3', '4'))
  UNION
  SELECT i.cid, LEFT(i.datetime_admit, 8) AS d
  FROM diagnosis_ipd i
  WHERE i.diagcode IN (${ICD})
    AND i.datetime_admit >= :lookbackStart
    AND LEFT(i.datetime_admit, 8) <= :dataAsOf
),
ew AS (
  SELECT ev.cid, ev.d,
         COUNT(*) OVER (PARTITION BY ev.cid ORDER BY TO_DAYS(${D("ev.d")})
                        RANGE BETWEEN ${R.episodeDays} PRECEDING
                                  AND 1 PRECEDING) AS n_prev
  FROM ev
  WHERE LENGTH(ev.cid) = 32
),
ep AS (
  SELECT ew.cid, ${D("ew.d")} AS event_date
  FROM ew
  WHERE ew.n_prev = 0
    AND ew.d >= :periodStart
),
dd AS (
  SELECT s.cid, ${D("s.date_serv")} AS death_date
  FROM service s
  WHERE s.typeout = '4'
    AND s.date_serv >= :periodStart
  UNION
  SELECT a.cid, ${D("LEFT(a.datetime_disch, 8)")} AS death_date
  FROM admission a
  WHERE (a.dischstatus = '9' OR a.dischtype IN ('8', '9'))
    AND a.datetime_disch >= :periodStart
  UNION
  SELECT x.cid, ${D("x.ddeath")} AS death_date
  FROM death x
  WHERE x.hospdeath IN (${HDC_UNIT_LIST})
    AND x.ddeath >= :periodStart
)
SELECT COUNT(*) AS episodes,
       SUM(EXISTS (
         SELECT 1 FROM dd
         WHERE dd.cid = ep.cid
           AND dd.death_date >= ep.event_date
           AND dd.death_date <= DATE_ADD(ep.event_date, INTERVAL ${R.deathWindowDays} DAY)
       )) AS deaths
FROM ep
`;

function minusDays(isoDate: string, days: number): string {
  const t = Date.parse(`${isoDate}T00:00:00Z`) - days * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

export function hdcStemiParams(ctx: {
  periodStart: string;
  dataAsOf: string;
}): QueryParams {
  return {
    lookbackStart: hdcDateParam(minusDays(ctx.periodStart, R.episodeDays)),
    periodStart: hdcDateParam(ctx.periodStart),
    dataAsOf: hdcDateParam(ctx.dataAsOf),
  };
}
