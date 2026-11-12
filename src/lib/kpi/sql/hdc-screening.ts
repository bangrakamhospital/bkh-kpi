import "server-only";

import type { QueryParams } from "@/lib/db/read-only-pool";
import { HOSPITAL_HOSPCODE } from "@/lib/kpi/district-areas";
import { SCREENING_INDICATORS } from "@/lib/kpi/screening-indicators";
import type { DistrictCode } from "@/lib/kpi/types";
import {
  CONFIRM_THRESHOLDS,
  confirmWindowParams,
} from "./hdc-confirm-hosxp";
import {
  hdcDateParam,
  HDC_UNIT_LIST,
  KNOWN_DIAGNOSIS_CTE,
  RESIDENTS_CTE,
  targetCte,
  hdcSqlSet,
  type HdcScreeningSqlContext,
  type HdcScreeningSqlSet,
} from "./hdc-common";
import {
  BREAST_CANCER_ICD_RANGE,
  BREAST_CBE_PP_CODES,
  CERVICAL_SCREENING_PP_CODES,
} from "./screening-cancer-hosxp";
import { minusYears, sqlCodeList } from "./screening-common";
import { SCREENING_ICD_RANGE } from "./screening-hosxp";

export {
  hdcDateParam,
  hdcDateToIso,
  type HdcScreeningSqlContext,
  type HdcScreeningSqlSet,
} from "./hdc-common";

/**
 * Ratio indicators of the district page on the HDC database, all 11
 * sub-districts (the hospital page keeps HOSxP; the two may differ).
 * Population = `residents` (./hdc-common). Definitions follow the HOSxP
 * SQL (screening-hosxp.ts, screening-cancer-hosxp.ts, hdc-confirm-hosxp.ts,
 * hdc-rlu-hosxp.ts) as far as the 43 files allow; codes / thresholds are
 * imported from those files so both pages use the same constants.
 * A always counts services at ANY unit of the district (matched by CID).
 * Verified with db-cli --conn 2 (FY 2569, 1–2.5 s per query).
 *
 * Common parameters ('YYYYMMDD'): :periodStart :countFrom :dataAsOf
 * :birthOnOrBefore [:birthAfter] [:icdFrom :icdToExclusive]; per indicator
 * see below. Static fragments come from constants only; values are bound.
 */

/** Age parameters ('YYYYMMDD') from SCREENING_INDICATORS (age on 1 Oct). */
function ageParams(code: DistrictCode, periodStart: string): QueryParams {
  const meta = SCREENING_INDICATORS[code];
  const params: QueryParams = {
    birthOnOrBefore: hdcDateParam(minusYears(periodStart, meta.minAge)),
  };
  if (meta.maxAge !== null) {
    params.birthAfter = hdcDateParam(minusYears(periodStart, meta.maxAge + 1));
  }
  return params;
}

function baseParams(ctx: HdcScreeningSqlContext): QueryParams {
  return {
    periodStart: hdcDateParam(ctx.periodStart),
    countFrom: hdcDateParam(ctx.countFrom),
    dataAsOf: hdcDateParam(ctx.dataAsOf),
  };
}

/* ------------------------- KPI 1–2 DM / HT screening ---------------------- */

/**
 * B: residents age >= 35, not diagnosed before 1 Oct (CHRONIC /
 * DIAGNOSIS, ICD E10–E14 / I10–I15). For FY 2569 only CHRONIC history
 * exists (diagnosis files start 2025-10).
 * A: NCDSCREEN in [:countFrom, :dataAsOf]:
 *   DM: bstest 1–4 with bslevel > 0;  HT: sbp_1 > 0 and dbp_1 > 0.
 */
const SCREEN_RESULT_WHERE = {
  DM: "n.bstest IN ('1', '2', '3', '4') AND n.bslevel + 0 > 0",
  HT: "n.sbp_1 + 0 > 0 AND n.dbp_1 + 0 > 0",
} as const;

function dmHtSql(code: "DM" | "HT"): HdcScreeningSqlSet {
  const withClause = `${RESIDENTS_CTE},${KNOWN_DIAGNOSIS_CTE},${targetCte("target", {
    maxAge: false,
    female: false,
    thaiOnly: false,
    excludeKnown: true,
  })},
screened AS (
  SELECT n.cid, MIN(CONCAT(n.date_serv, n.hospcode)) AS first_key
  FROM ncdscreen n
  WHERE n.date_serv >= :countFrom
    AND n.date_serv <= :dataAsOf
    AND ${SCREEN_RESULT_WHERE[code]}
  GROUP BY n.cid
)`;
  return hdcSqlSet(withClause, false, (ctx) => ({
      ...baseParams(ctx),
      ...ageParams(code, ctx.periodStart),
      ...SCREENING_ICD_RANGE[code],
    }));
}

/* --------------------- KPI 3–4 CX / BR (SPECIALPP) ------------------------ */

/**
 * A = SPECIALPP with one of `codes` in [:countFrom, :dataAsOf]
 * (index ppspecial, date_serv, cid — covering range scan).
 */
function specialppScreened(codes: readonly string[]): string {
  return `
screened AS (
  SELECT s.cid, MIN(CONCAT(s.date_serv, s.hospcode)) AS first_key
  FROM specialpp s
  WHERE s.ppspecial IN (${sqlCodeList(codes)})
    AND s.date_serv >= :countFrom
    AND s.date_serv <= :dataAsOf
  GROUP BY s.cid
)`;
}

/**
 * CX: B (eligible) = Thai women 30–60 on 1 Oct; the 70% target share is
 * applied in code. A = screened since :countFrom = max(phase start,
 * 2025-10-01): HDC has no FY 2568 data, so the cumulative A is LOWER than
 * the real phase total (set by the caller, see district.ts).
 */
function cxSql(): HdcScreeningSqlSet {
  const meta = SCREENING_INDICATORS.CX;
  const withClause = `${RESIDENTS_CTE},${targetCte("target", {
    maxAge: meta.maxAge !== null,
    female: meta.sex === "female",
    thaiOnly: meta.thaiOnly,
    excludeKnown: false,
  })},${specialppScreened(CERVICAL_SCREENING_PP_CODES)}`;
  return hdcSqlSet(withClause, false, (ctx) => ({
      countFrom: hdcDateParam(ctx.countFrom),
      dataAsOf: hdcDateParam(ctx.dataAsOf),
      ...ageParams("CX", ctx.periodStart),
    }));
}

/** BR: women 40–70 (any nationality, = HOSxP), no C50 before 1 Oct; CBE in the FY. */
function brSql(): HdcScreeningSqlSet {
  const meta = SCREENING_INDICATORS.BR;
  const withClause = `${RESIDENTS_CTE},${KNOWN_DIAGNOSIS_CTE},${targetCte("target", {
    maxAge: meta.maxAge !== null,
    female: meta.sex === "female",
    thaiOnly: meta.thaiOnly,
    excludeKnown: true,
  })},${specialppScreened(BREAST_CBE_PP_CODES)}`;
  return hdcSqlSet(withClause, false, (ctx) => ({
      ...baseParams(ctx),
      ...ageParams("BR", ctx.periodStart),
      ...BREAST_CANCER_ICD_RANGE,
    }));
}

/* ----------------------- HDC 2.1 / 2.2 DMC / HTC -------------------------- */

const T = CONFIRM_THRESHOLDS;

/** FPG = LABFU 0531002 'Glucose, serum/plasma' (= HOSxP provis_labcode). */
export const HDC_FPG_LABTEST = "0531002";

/**
 * Suspect screening in [:periodStart, :suspectUntil], one row per CID:
 *  - DM: fasting glucose >= 126: bstest 1 (venous fasting = HOSxP last_fpg)
 *    or 3 (capillary fasting = last_fgc).
 *  - HT: mean of the screening's readings (sbp_1/dbp_1 and, when present,
 *    sbp_2/dbp_2) with SBP 140–<180 and/or DBP 90–<110, not severe.
 */
const SUSPECT_CTE = {
  DM: `
su AS (
  SELECT n.cid, MIN(n.date_serv) AS suspect_date
  FROM ncdscreen n
  WHERE n.date_serv >= :periodStart
    AND n.date_serv <= :suspectUntil
    AND n.bstest IN ('1', '3')
    AND n.bslevel + 0 >= ${T.fastingGlucoseMin}
  GROUP BY n.cid
)`,
  HT: `
bp AS (
  SELECT n.cid, n.date_serv,
         CASE WHEN n.sbp_2 + 0 > 0 AND n.dbp_2 + 0 > 0
              THEN (n.sbp_1 + n.sbp_2) / 2 ELSE n.sbp_1 + 0 END AS sbp,
         CASE WHEN n.sbp_2 + 0 > 0 AND n.dbp_2 + 0 > 0
              THEN (n.dbp_1 + n.dbp_2) / 2 ELSE n.dbp_1 + 0 END AS dbp
  FROM ncdscreen n
  WHERE n.date_serv >= :periodStart
    AND n.date_serv <= :suspectUntil
    AND n.sbp_1 + 0 > 0
    AND n.dbp_1 + 0 > 0
),
su AS (
  SELECT bp.cid, MIN(bp.date_serv) AS suspect_date
  FROM bp
  WHERE (bp.sbp >= ${T.sbpMin} OR bp.dbp >= ${T.dbpMin})
    AND bp.sbp < ${T.sbpSevere}
    AND bp.dbp < ${T.dbpSevere}
  GROUP BY bp.cid
)`,
} as const;

/**
 * First confirmation AFTER suspect_date, up to :confirmUntil, any unit
 * (computed on `su`, joined to `target` by the final SELECT — referencing
 * the heavy target chain only once keeps MariaDB from expanding it twice):
 *  - DM: LABFU FPG with a non-empty result
 *  - HT: OBPM = a SERVICE with sbp > 0 and dbp > 0 (index cid, date_serv).
 *    HBPM is not in the 43 files (same gap as HOSxP).
 */
const CONFIRM_CTE = {
  DM: `
fpg AS (
  SELECT l.cid, l.date_serv, l.hospcode
  FROM labfu l
  WHERE l.labtest = '${HDC_FPG_LABTEST}'
    AND l.date_serv >= :periodStart
    AND l.date_serv <= :confirmUntil
    AND COALESCE(l.labresult, '') <> ''
),
screened AS (
  SELECT su.cid, MIN(CONCAT(f.date_serv, f.hospcode)) AS first_key
  FROM su
  JOIN fpg f ON f.cid = su.cid AND f.date_serv > su.suspect_date
  GROUP BY su.cid
)`,
  HT: `
screened AS (
  SELECT su.cid, MIN(CONCAT(s.date_serv, s.hospcode)) AS first_key
  FROM su
  JOIN service s
    ON s.cid = su.cid
   AND s.date_serv > su.suspect_date
   AND s.date_serv <= :confirmUntil
  WHERE s.sbp + 0 > 0
    AND s.dbp + 0 > 0
  GROUP BY su.cid
)`,
} as const;

/**
 * B = residents age >= 35, Thai, not diagnosed before 1 Oct, with a
 * suspect screening; A = confirmed afterwards (see above).
 * :suspectUntil = min(30 Jun, dataAsOf), :confirmUntil = min(30 Sep,
 * dataAsOf) — same window as HOSxP (confirmWindowParams).
 */
function confirmSql(code: "DMC" | "HTC"): HdcScreeningSqlSet {
  const base = code === "DMC" ? "DM" : "HT";
  const withClause = `${RESIDENTS_CTE},${KNOWN_DIAGNOSIS_CTE},${targetCte("pop", {
    maxAge: false,
    female: false,
    thaiOnly: true,
    excludeKnown: true,
  })},${SUSPECT_CTE[base]},
target AS (
  SELECT pop.cid, pop.vid, pop.hospcode, pop.pid, pop.birth, pop.sex,
         su.suspect_date
  FROM pop
  JOIN su ON su.cid = pop.cid
),${CONFIRM_CTE[base]}`;
  return hdcSqlSet(withClause, true, (ctx) => {
      const w = confirmWindowParams(ctx);
      return {
        periodStart: hdcDateParam(ctx.periodStart),
        suspectUntil: hdcDateParam(w.suspectUntil),
        confirmUntil: hdcDateParam(w.confirmUntil),
        ...ageParams(code, ctx.periodStart),
        ...SCREENING_ICD_RANGE[base],
      };
    });
}

/* ------------------- RLU 11.3 / 11.4 / 11.5 (DM lab use) ------------------ */

export type HdcRluCode = "RLU_HBA1C" | "RLU_LDL" | "RLU_CR";

/**
 * LABFU.labtest codes (c_labfu_labtest, verified with db-cli --conn 2,
 * FY 2569 volume, sent by all 22 units):
 *  - HbA1c  0531601 'Glycosylated hemoglobin whole blood (HbA1c)' (~16k)
 *  - LDL    0541402 'LDL Cholesterol, serum/plasma' (~28k; calculated and
 *           direct LDL share this code)
 *  - Cr     0581902 'Creatinine, serum/plasma' (~41k). Urine creatinine
 *           0581903 / other fluid 0581915 and eGFR 0581904 are NOT counted
 *           (same as HOSxP).
 */
export const HDC_RLU_LABTEST: Record<HdcRluCode, readonly string[]> = {
  RLU_HBA1C: ["0531601"],
  RLU_LDL: ["0541402"],
  RLU_CR: ["0581902"],
};

/**
 * RLU: B = DM patients among `residents` (area-based — HOSxP uses the
 * hospital DM clinic registry instead):
 *   a CHRONIC E10–E14 record (any unit) diagnosed on or before :dataAsOf,
 *   still under treatment (typedisch '03' ยังรักษาอยู่, '04' ไม่ทราบ, '05'
 *   รอจำหน่าย, '11' กลับเป็นซ้ำ or empty) and no record with typedisch '02'
 *   (ตาย). The hospital (11252) exports almost every DM record as '01'
 *   (หาย, 6.6k of 6.9k) although they are active clinic members, so '01'
 *   from 11252 counts as active; '01' from other units is excluded.
 *   No age limit (= HOSxP).
 * A = members of B with >= 1 LABFU result of the test in
 *   [:countFrom, :dataAsOf] at ANY unit; "result" = labresult starts with a
 *   number (optionally '<' / '>'), same rule as HOSxP.
 */
function rluSql(code: HdcRluCode): HdcScreeningSqlSet {
  const withClause = `${RESIDENTS_CTE},
dm_patient AS (
  SELECT c.cid
  FROM chronic c
  WHERE c.chronic >= 'E10' AND c.chronic < 'E15'
    AND c.date_diag <= :dataAsOf
  GROUP BY c.cid
  HAVING SUM(c.typedisch = '02') = 0
     AND SUM(COALESCE(c.typedisch, '') IN ('', '03', '04', '05', '11')
             OR (c.hospcode = :hospitalCode AND c.typedisch = '01')) > 0
),
target AS (
  SELECT r.cid, r.vid, r.hospcode, r.pid, r.birth, r.sex
  FROM residents r
  JOIN dm_patient dp ON dp.cid = r.cid
),
screened AS (
  SELECT l.cid, MIN(CONCAT(l.date_serv, l.hospcode)) AS first_key
  FROM labfu l
  WHERE l.labtest IN (${sqlCodeList(HDC_RLU_LABTEST[code])})
    AND l.date_serv >= :countFrom
    AND l.date_serv <= :dataAsOf
    AND l.labresult REGEXP '^[<>]?[ ]*[0-9]'
  GROUP BY l.cid
)`;
  return hdcSqlSet(withClause, false, (ctx) => ({
      countFrom: hdcDateParam(ctx.countFrom),
      dataAsOf: hdcDateParam(ctx.dataAsOf),
      hospitalCode: HOSPITAL_HOSPCODE,
    }));
}

export const HDC_SCREENING_SQL: Record<DistrictCode, HdcScreeningSqlSet> = {
  DM: dmHtSql("DM"),
  HT: dmHtSql("HT"),
  CX: cxSql(),
  BR: brSql(),
  DMC: confirmSql("DMC"),
  HTC: confirmSql("HTC"),
  RLU_HBA1C: rluSql("RLU_HBA1C"),
  RLU_LDL: rluSql("RLU_LDL"),
  RLU_CR: rluSql("RLU_CR"),
};

/**
 * Data freshness per unit (5-digit hospcode, "GA00…" merged):
 * latest SERVICE and NCDSCREEN date on or before :dataAsOf.
 * -> rows { hospcode, kind: 'service' | 'ncdscreen', last_date }
 */
export const HDC_FRESHNESS_SQL = `
SELECT CASE WHEN s.hospcode LIKE 'GA%' THEN RIGHT(s.hospcode, 5) ELSE s.hospcode END AS hospcode,
       'service' AS kind,
       MAX(s.date_serv) AS last_date
FROM service s
WHERE s.date_serv <= :dataAsOf
  AND (s.hospcode IN (${HDC_UNIT_LIST}) OR s.hospcode LIKE 'GA%')
GROUP BY 1
UNION ALL
SELECT CASE WHEN n.hospcode LIKE 'GA%' THEN RIGHT(n.hospcode, 5) ELSE n.hospcode END AS hospcode,
       'ncdscreen' AS kind,
       MAX(n.date_serv) AS last_date
FROM ncdscreen n
WHERE n.date_serv <= :dataAsOf
  AND (n.hospcode IN (${HDC_UNIT_LIST}) OR n.hospcode LIKE 'GA%')
GROUP BY 1
`;
