import "server-only";

import type { QueryParams } from "@/lib/db/read-only-pool";
import { hdcDateParam, RESIDENTS_CTE } from "./hdc-common";

/**
 * HDC standard report "ร้อยละของเด็กอายุ 0-5 ปี ฟันดีไม่มีผุ (Cavity Free)
 * (คน)" (HDC report abt2t2k4z4xeqzytwbave, source s_dental_0_12_cavity_free,
 * template สำนักทันตสาธารณสุข v.11022025) re-computed from the 43 files of
 * the district HDC database, per village of residence.
 *
 * C (เด็กทั้งหมด): district residents (`residents`, TYPEAREA 1/3, alive,
 *   Thai '099') aged 0–5 full years on 1 January of the fiscal year
 *   (e.g. FY 2569 -> 2026-01-01).
 * Exam record: DENTAL rows of the fiscal year by a dental provider
 *   (PROVIDER.providertype 02 / 06 of the same unit), any unit, by CID.
 *   The FIRST exam of the fiscal year is used, as in the HDC SQL
 *   (row_number() ORDER BY date_serv, d_update DESC = 1) — the template
 *   text says "ล่าสุด", but the published numbers follow the SQL
 *   (A/B 85.2% first vs 92.7% latest; HDC 85.1%, FY 2569).
 * B (ตรวจช่องปาก): that exam passes the quality rule
 *   DFILLING + DEXTRACT + DCARIES <= 20, DTEETH 1–20,
 *   DCARIES + DFILLING <= DTEETH.
 * A (ฟันดีไม่มีผุ): B with DCARIES = 0 and DEXTRACT = 0.
 *
 * Parameters ('YYYYMMDD'): :periodStart :periodEnd :ageRefDate
 * :birthFrom :birthTo.
 * -> rows { vid, age_years, target, examined, cavity_free }
 */

/** Age range in full years on the reference day (1 January). */
export const CAVITY_FREE_MIN_AGE = 0;
export const CAVITY_FREE_MAX_AGE = 5;

/** PROVIDER.providertype of dental staff (ทันตแพทย์, เจ้าพนักงานทันตสาธารณสุข). */
const DENTAL_PROVIDER_TYPES = "'02', '06'";

/** 'YYYYMMDD' string -> DATE. */
const D = (col: string) => `STR_TO_DATE(${col}, '%Y%m%d')`;
const INT = (col: string) => `CAST(NULLIF(TRIM(${col}), '') AS SIGNED)`;

export const HDC_CAVITY_FREE_VILLAGE_SQL = `${RESIDENTS_CTE},
kid AS (
  SELECT r.cid, r.vid,
         TIMESTAMPDIFF(YEAR, ${D("r.birth")}, ${D(":ageRefDate")}) AS age_years
  FROM residents r
  WHERE r.nation = '099'
    AND r.birth > :birthFrom
    AND r.birth <= :birthTo
),
exam AS (
  SELECT d.cid,
         ${INT("d.dteeth")} AS dt,
         ${INT("d.dcaries")} AS dc,
         ${INT("d.dfilling")} AS df,
         ${INT("d.dextract")} AS de,
         ROW_NUMBER() OVER (
           PARTITION BY d.cid ORDER BY d.date_serv, d.d_update DESC
         ) AS rk
  FROM dental d
  JOIN provider v
    ON v.hospcode = d.hospcode
   AND v.provider = d.provider
   AND v.providertype IN (${DENTAL_PROVIDER_TYPES})
  WHERE d.date_serv BETWEEN :periodStart AND :periodEnd
    AND LENGTH(d.cid) = 32
),
first_exam AS (
  SELECT e.cid,
         (e.df + e.de + e.dc <= 20
          AND e.dt BETWEEN 1 AND 20
          AND e.dc + e.df <= e.dt) AS valid,
         (e.dc = 0 AND e.de = 0) AS free
  FROM exam e
  WHERE e.rk = 1
)
SELECT k.vid AS vid,
       k.age_years AS age_years,
       COUNT(*) AS target,
       SUM(COALESCE(f.valid, 0) = 1) AS examined,
       SUM(COALESCE(f.valid, 0) = 1 AND f.free = 1) AS cavity_free
FROM kid k
LEFT JOIN first_exam f ON f.cid = k.cid
WHERE k.age_years BETWEEN ${CAVITY_FREE_MIN_AGE} AND ${CAVITY_FREE_MAX_AGE}
GROUP BY k.vid, k.age_years
`;

export interface HdcCavityFreeContext {
  /** ISO 1 Oct of the fiscal year. */
  periodStart: string;
  /** ISO 30 Sep of the fiscal year. */
  periodEnd: string;
}

/** Reference day = 1 January inside the fiscal year (year of periodEnd). */
export function hdcCavityFreeParams(ctx: HdcCavityFreeContext): QueryParams {
  const year = Number(ctx.periodEnd.slice(0, 4));
  return {
    periodStart: hdcDateParam(ctx.periodStart),
    periodEnd: hdcDateParam(ctx.periodEnd),
    ageRefDate: `${year}0101`,
    // Prefilter only (exact age by TIMESTAMPDIFF): born after 1 Jan of
    // (year - maxAge - 1), on or before the reference day.
    birthFrom: `${year - CAVITY_FREE_MAX_AGE - 1}0101`,
    birthTo: `${year}0101`,
  };
}
