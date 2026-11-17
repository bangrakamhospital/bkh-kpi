import "server-only";

import type { QueryParams } from "@/lib/db/his";
import type { PpfsHospitalItemCode, PpfsItemCode } from "@/lib/kpi/ppfs-rates";

import { CERVICAL_SCREENING_PP_CODES } from "./screening-cancer-hosxp";
import {
  AGE_MAX_WHERE,
  AGE_MIN_WHERE,
  ageParams,
  minusYears,
  NO_PRIOR_CLINIC_MEMBER_WHERE,
  NO_PRIOR_DIAGNOSIS_WHERE,
  PERSON_FEMALE_WHERE,
  PERSON_IN_CATCHMENT_WHERE,
  PERSON_THAI_WHERE,
  sqlCodeList,
  type ScreeningSqlContext,
  type ScreeningSqlSpec,
} from "./screening-common";

/**
 * SQL for the "PP / รายได้ สปสช." tab (PPFS Phase 1 + mother-and-child
 * items) against HOSxP.
 * Definitions and FY2569 verification: docs/kpi/ppfs-revenue-feasibility.md
 * ("Implemented", 10.6 for the mother-and-child items). All codes below were verified with db-cli.
 *
 * Catchment items follow the screening pattern (./screening-common): a
 * `ScreeningSqlSpec` (targetWhere on `person p` + screenedSubquery) plus
 * an optional billed subquery, turned by buildPpfsVillageSql() into ONE
 * per-village aggregate query; the headline is the sum of the villages.
 * Unlike buildScreeningSql() no person-level query is generated: this tab
 * returns aggregates only.
 *
 * Rates are applied in TypeScript (ppfs-rates.ts), never in SQL.
 * All SQL is static: code lists are source constants (validated by
 * sqlCodeList / sqlIntList); only values are bound as named parameters:
 *   :periodStart   'YYYY-MM-DD'  1 Oct of the fiscal year (age reference)
 *   :countFrom     'YYYY-MM-DD'  = :periodStart (services counted in FY)
 *   :dataAsOf      'YYYY-MM-DD'  30 Sep of the fiscal year (inclusive)
 *   :lookbackFrom  'YYYY-MM-DD'  start of the "already done" window
 *                                (cycle exclusion), item specific
 * plus age / ICD / clinic parameters per item (see each spec).
 */

// --- codes (verified with db-cli, see feasibility doc section 2) -----------

/** lab_order.lab_items_code (int). */
const LAB = {
  FIT: [978],
  FBS: [76, 817], // code changed during FY2568: both are needed
  TC: 102,
  HDL: 91,
  HPV_PAP: [1017, 474], // HPV DNA (external lab), Pap smear
  HBSAG: [122],
  HCV: [219, 430, 1081], // Anti-HCV, Anti-HCV (N), HCV-Ag
  HB: 3,
  UPT: [67], // urine pregnancy test
} as const;

/** lab_head.form_name of the CBC (Hb is read from this form only). */
const HEMATOLOGY_FORM = "01 - HEMOTOLOGY";
/** lab_head.form_name used as the ANC lab set 1 proxy. */
const ANC_LAB_FORM = "LAB ANC";

/** pp_special_type.pp_special_code (SPECIALPP). */
const PP = {
  FIT: ["1B0060", "1B0061"],
  HBV: ["1B010", "1B0100", "1B0101"],
  HCV: ["1B011", "1B0110", "1B0111"],
} as const;

/** nondrugitems.nhso_adp_code charged in opitemrece ("billed"). */
const ADP = {
  FIT: ["90005"],
  CX_COLLECT: ["C30"],
  TC_HDL: ["12004"],
  FPG: ["12003"],
  CBC: ["13001"],
  ANC_VISIT: ["30011"],
  ANC_LAB1: ["30012"],
  ANC_LAB2: ["30013"],
  ANC_US: ["30010"],
  ANC_DENTAL: ["30009"],
  PP_VISIT: ["30015"], // nondrugitems 3001988
  // HOSxP prices 135 / 75 baht, rates not yet confirmed by NHSO FY2569:
  MCH_IODINE: ["30016"], // nondrugitems 3002640
  MCH_UPT: ["30014"], // nondrugitems 3002426, 3002639
} as const;

/** nondrugitems.icode of the ADP codes (opitemrece.icode IN (…)). */
function adpIcodes(adpCodes: readonly string[]): string {
  return `SELECT n.icode FROM nondrugitems n
                      WHERE n.nhso_adp_code IN (${sqlCodeList(adpCodes)})`;
}

/** dtmain.tmcode of an ANC dental exam / scaling (any one counts). */
const ANC_DENTAL_TMCODES = ["000309", "000310", "000292"] as const;
/** ovstdiag.icd10 of a routine postpartum follow-up (Z39.2). */
const PP_VISIT_ICD10 = ["Z392"] as const;
/** drugitems.icode of the iodine + iron + folate tablet (Triferdine). */
const IODINE_DRUG_ICODES = ["1650047"] as const;

/** Statins in drugitems (opitemrece.icode), TC+HDL exclusion. */
const STATIN_ICODES = [
  "1460327",
  "1460501",
  "1460556",
  "1480601",
  "1480905",
  "1550004",
  "1570016",
  "1670094",
  "1900514",
] as const;

/** HBsAg / Anti-HCV: people born before 1 Jan 2535 BE. */
const HEP_BORN_BEFORE = "1992-01-01";

/** Fixed ICD-10 code ranges (sargable, icd10 has no dot). */
const ICD = {
  CRC: { icdFrom: "C18", icdToExclusive: "C21" }, // C18–C20
  DM: { icdFrom: "E10", icdToExclusive: "E15" }, // E10–E14
  LIPID: { icdFrom: "E78", icdToExclusive: "E79" }, // E78*
} as const;
const DM_CLINIC = "001";

/** Look-back windows (years before :periodStart) for the cycle exclusions. */
const CYCLE_YEARS = {
  FIT: 1, // every 2 years: not tested in the previous fiscal year
  CX: 5,
  TC_HDL: 5, // also bounds the statin look-back (was unbounded: 24 s)
} as const;
/** FPG risk group: NCD screening results of this or the previous FY. */
const FPG_RISK_YEARS = 1;

function sqlIntList(codes: readonly number[]): string {
  if (codes.length === 0) throw new Error("empty code list");
  for (const c of codes) {
    if (!Number.isInteger(c) || c < 0) throw new Error(`invalid code: ${c}`);
  }
  return codes.join(", ");
}

// --- fragments (static, on `person p`) -------------------------------------

/** Lab orders of `codes` for p, optionally requiring a non-empty result. */
function labExists(
  codes: readonly number[],
  dateCond: string,
  requireResult: boolean,
): string {
  return `EXISTS (
        SELECT 1
        FROM lab_head h
        JOIN lab_order lo
          ON lo.lab_order_number = h.lab_order_number
        WHERE h.hn = p.patient_hn
          AND lo.lab_items_code IN (${sqlIntList(codes)})
          AND ${dateCond}${
            requireResult
              ? `
          AND lo.lab_order_result IS NOT NULL AND lo.lab_order_result <> ''`
              : ""
          }
      )`;
}

function ppSpecialExists(codes: readonly string[], dateCond: string): string {
  return `EXISTS (
        SELECT 1
        FROM ovst o
        JOIN pp_special ps
          ON ps.vn = o.vn
        JOIN pp_special_type pt
          ON pt.pp_special_type_id = ps.pp_special_type_id
        WHERE o.hn = p.patient_hn
          AND pt.pp_special_code IN (${sqlCodeList(codes)})
          AND ${dateCond}
      )`;
}

/** Window [:lookbackFrom, :periodStart) / lifetime (< :periodStart). */
const LAB_PRIOR_WINDOW = "h.order_date >= :lookbackFrom AND h.order_date < :periodStart";
const LAB_PRIOR_EVER = "h.order_date < :periodStart";
const PP_PRIOR_WINDOW = "o.vstdate >= :lookbackFrom AND o.vstdate < :periodStart";
const PP_PRIOR_EVER = "o.vstdate < :periodStart";

/** No lab of `codes` in the cycle window (or ever when lifetime). */
function noPriorLabWhere(
  codes: readonly number[],
  opts: { lifetime?: boolean; requireResult?: boolean } = {},
): string {
  return `
  AND NOT ${labExists(codes, opts.lifetime ? LAB_PRIOR_EVER : LAB_PRIOR_WINDOW, opts.requireResult ?? false)}`;
}

/** No SPECIALPP of `codes` in the cycle window (or ever when lifetime). */
function noPriorPpSpecialWhere(
  codes: readonly string[],
  opts: { lifetime?: boolean } = {},
): string {
  return `
  AND NOT ${ppSpecialExists(codes, opts.lifetime ? PP_PRIOR_EVER : PP_PRIOR_WINDOW)}`;
}

/**
 * No statin dispensed in [:lookbackFrom, :periodStart). Bounded to the
 * 5-year cycle window and driven by ix_hn (opitemrece.hn).
 */
const NO_STATIN_WHERE = `
  AND NOT EXISTS (
        SELECT 1
        FROM opitemrece oi
        WHERE oi.hn = p.patient_hn
          AND oi.icode IN (${sqlCodeList(STATIN_ICODES)})
          AND oi.vstdate >= :lookbackFrom
          AND oi.vstdate <  :periodStart
      )`;

/** No HBV (B16*, B180, B181, B191, Z225) diagnosis before :periodStart. */
const NO_PRIOR_HBV_DX_WHERE = `
  AND NOT EXISTS (
        SELECT 1
        FROM ovstdiag d
        WHERE d.hn = p.patient_hn
          AND (d.icd10 LIKE 'B16%' OR d.icd10 IN ('B180', 'B181', 'B191', 'Z225'))
          AND d.vstdate < :periodStart
      )`;

/** No HCV (B171, B182) diagnosis before :periodStart. */
const NO_PRIOR_HCV_DX_WHERE = `
  AND NOT EXISTS (
        SELECT 1
        FROM ovstdiag d
        WHERE d.hn = p.patient_hn
          AND d.icd10 IN ('B171', 'B182')
          AND d.vstdate < :periodStart
      )`;

/** Born before :bornBefore (fixed date, not fiscal-year relative). */
const BORN_BEFORE_WHERE = `
  AND p.birthdate < :bornBefore`;

/**
 * FPG risk group proxy: an NCD screening (person_dmht_risk_screen_head) in
 * [:lookbackFrom, :dataAsOf] with a DM risk score > 0, BMI >= 25 or
 * BP >= 130/85.
 */
const FPG_RISK_WHERE = `
  AND EXISTS (
        SELECT 1
        FROM person_dmht_screen_summary s
        JOIN person_dmht_risk_screen_head h
          ON h.person_dmht_screen_summary_id = s.person_dmht_screen_summary_id
        WHERE s.person_id = p.person_id
          AND h.screen_date >= :lookbackFrom
          AND h.screen_date <  DATE_ADD(:dataAsOf, INTERVAL 1 DAY)
          AND (h.dm_risk_count > 0 OR h.bmi >= 25
               OR h.last_bps >= 130 OR h.last_bpd >= 85)
      )`;

/** Not pregnant: no person_anc pregnancy overlapping the fiscal year. */
const NOT_PREGNANT_WHERE = `
  AND NOT EXISTS (
        SELECT 1
        FROM person_anc a
        WHERE a.person_id = p.person_id
          AND COALESCE(a.lmp, a.anc_register_date) < DATE_ADD(:dataAsOf, INTERVAL 1 DAY)
          AND COALESCE(a.labor_date,
                       DATE_ADD(COALESCE(a.lmp, a.anc_register_date), INTERVAL 280 DAY))
              >= :periodStart
      )`;

const CATCHMENT_THAI = `${PERSON_IN_CATCHMENT_WHERE}${PERSON_THAI_WHERE}`;

// --- screened / billed subqueries (one row per person_id) -----------------

const IN_FY_LAB = "h.order_date >= :countFrom AND h.order_date < DATE_ADD(:dataAsOf, INTERVAL 1 DAY)";
const IN_FY_VISIT = "o.vstdate >= :countFrom AND o.vstdate < DATE_ADD(:dataAsOf, INTERVAL 1 DAY)";

function labScreened(
  codes: readonly number[],
  requireResult: boolean,
  extra = "",
): string {
  return `
  SELECT sp.person_id, MIN(h.order_date) AS first_screen_date
  FROM lab_head h
  JOIN lab_order lo
    ON lo.lab_order_number = h.lab_order_number
  JOIN person sp
    ON sp.patient_hn = h.hn
  WHERE ${IN_FY_LAB}
    AND lo.lab_items_code IN (${sqlIntList(codes)})${
      requireResult
        ? `
    AND lo.lab_order_result IS NOT NULL AND lo.lab_order_result <> ''`
        : ""
    }${extra}
  GROUP BY sp.person_id`;
}

function ppSpecialScreened(codes: readonly string[]): string {
  return `
  SELECT sp.person_id, MIN(o.vstdate) AS first_screen_date
  FROM pp_special ps
  JOIN pp_special_type pt
    ON pt.pp_special_type_id = ps.pp_special_type_id
  JOIN ovst o
    ON o.vn = ps.vn
  JOIN person sp
    ON sp.patient_hn = o.hn
  WHERE pt.pp_special_code IN (${sqlCodeList(codes)})
    AND ${IN_FY_VISIT}
  GROUP BY sp.person_id`;
}

/** Union of lab and SPECIALPP services, first date per person. */
function unionScreened(...parts: string[]): string {
  return `
  SELECT u.person_id, MIN(u.first_screen_date) AS first_screen_date
  FROM (${parts.join(`
  UNION ALL`)}
  ) u
  GROUP BY u.person_id`;
}

/**
 * Visits charged with one of the ADP codes in the fiscal year, per person
 * (opitemrece -> nondrugitems.nhso_adp_code; driven by ix_icode).
 */
function billedSubquery(adpCodes: readonly string[]): string {
  return `
  SELECT bp.person_id, COUNT(DISTINCT oi.vn) AS billed_visits
  FROM opitemrece oi
  JOIN person bp
    ON bp.patient_hn = oi.hn
  WHERE oi.icode IN (
          SELECT n.icode FROM nondrugitems n
          WHERE n.nhso_adp_code IN (${sqlCodeList(adpCodes)})
        )
    AND oi.vstdate >= :countFrom
    AND oi.vstdate <  DATE_ADD(:dataAsOf, INTERVAL 1 DAY)
  GROUP BY bp.person_id`;
}

// --- builder ---------------------------------------------------------------

export interface PpfsSqlSpec extends ScreeningSqlSpec {
  /** SELECT person_id, billed_visits; null = no ADP code for this item. */
  billedSubquery: string | null;
}

export interface PpfsVillageSql {
  /**
   * -> rows { village_id, village_moo, village_name, eligible, numerator,
   *           billed } (billed NULL when the item has no ADP code)
   */
  village: string;
  hasBilled: boolean;
  buildParams(ctx: ScreeningSqlContext): QueryParams;
}

/**
 * Per-village aggregates of one catchment item; same shape and grouping as
 * buildScreeningSql().village plus a billed column. Each joined subquery
 * has one row per person_id, so there is no fan-out.
 */
export function buildPpfsVillageSql(spec: PpfsSqlSpec): PpfsVillageSql {
  const { targetWhere: where, screenedSubquery: screened, billedSubquery: billed } = spec;
  const village = `
SELECT CASE WHEN v.village_id IS NULL THEN 0 ELSE p.village_id END AS village_id,
       MAX(CAST(v.village_moo AS CHAR)) AS village_moo,
       MAX(v.village_name)              AS village_name,
       COUNT(DISTINCT p.person_id)      AS eligible,
       COUNT(DISTINCT sc.person_id)     AS numerator,
       ${billed ? "COALESCE(SUM(bl.billed_visits), 0)" : "NULL"} AS billed
FROM person p
LEFT JOIN village v
  ON v.village_id = p.village_id
LEFT JOIN (${screened}
) sc
  ON sc.person_id = p.person_id${
    billed
      ? `
LEFT JOIN (${billed}
) bl
  ON bl.person_id = p.person_id`
      : ""
  }
WHERE ${where}
GROUP BY CASE WHEN v.village_id IS NULL THEN 0 ELSE p.village_id END
`;
  return { village, hasBilled: billed !== null, buildParams: spec.buildParams };
}

function baseParams(ctx: ScreeningSqlContext): QueryParams {
  return {
    periodStart: ctx.periodStart,
    countFrom: ctx.countFrom,
    dataAsOf: ctx.dataAsOf,
  };
}

// --- catchment items -------------------------------------------------------

type CatchmentCode = Exclude<PpfsItemCode, "ANC_VISIT" | "ANC_LAB1">;

/**
 * FIT (A): Thai, 50–70 on 1 Oct, no C18–C20 before 1 Oct, no FIT (lab 978
 * with a result or SPECIALPP 1B0060/1B0061) in the previous fiscal year.
 * Done = FIT (lab or SPECIALPP) in the fiscal year. Billed = ADP 90005.
 */
const FIT_SPEC: PpfsSqlSpec = {
  targetWhere: `${CATCHMENT_THAI}${AGE_MIN_WHERE}${AGE_MAX_WHERE}${NO_PRIOR_DIAGNOSIS_WHERE}${noPriorLabWhere(LAB.FIT, { requireResult: true })}${noPriorPpSpecialWhere(PP.FIT)}`,
  screenedSubquery: unionScreened(
    labScreened(LAB.FIT, true),
    ppSpecialScreened(PP.FIT),
  ),
  billedSubquery: billedSubquery(ADP.FIT),
  buildParams: (ctx) => ({
    ...baseParams(ctx),
    ...ageParams(ctx.periodStart, 50, 70),
    ...ICD.CRC,
    lookbackFrom: minusYears(ctx.periodStart, CYCLE_YEARS.FIT),
  }),
};

/**
 * Cervical (B): Thai women 30–59, not screened (SPECIALPP cervical codes
 * or lab HPV DNA 1017 / Pap 474) in the 5 years before 1 Oct.
 * Done = screened in the fiscal year. Billed = ADP C30 (sample collection).
 */
const CX_SPEC: PpfsSqlSpec = {
  targetWhere: `${CATCHMENT_THAI}${PERSON_FEMALE_WHERE}${AGE_MIN_WHERE}${AGE_MAX_WHERE}${noPriorPpSpecialWhere(CERVICAL_SCREENING_PP_CODES)}${noPriorLabWhere(LAB.HPV_PAP)}`,
  screenedSubquery: unionScreened(
    ppSpecialScreened(CERVICAL_SCREENING_PP_CODES),
    labScreened(LAB.HPV_PAP, false),
  ),
  billedSubquery: billedSubquery(ADP.CX_COLLECT),
  buildParams: (ctx) => ({
    ...baseParams(ctx),
    ...ageParams(ctx.periodStart, 30, 59),
    lookbackFrom: minusYears(ctx.periodStart, CYCLE_YEARS.CX),
  }),
};

/**
 * TC + HDL (B): Thai, 45–70, no E78 before 1 Oct, no statin and no TC/HDL
 * (with result) in the 5 years before 1 Oct. Done = both TC (102) and
 * HDL (91) with a result in the fiscal year. Billed = ADP 12004.
 */
const TC_HDL_SPEC: PpfsSqlSpec = {
  targetWhere: `${CATCHMENT_THAI}${AGE_MIN_WHERE}${AGE_MAX_WHERE}${NO_PRIOR_DIAGNOSIS_WHERE}${NO_STATIN_WHERE}${noPriorLabWhere([LAB.TC, LAB.HDL], { requireResult: true })}`,
  screenedSubquery: `
  SELECT sp.person_id, MIN(h.order_date) AS first_screen_date
  FROM lab_head h
  JOIN lab_order lo
    ON lo.lab_order_number = h.lab_order_number
  JOIN person sp
    ON sp.patient_hn = h.hn
  WHERE ${IN_FY_LAB}
    AND lo.lab_items_code IN (${sqlIntList([LAB.TC, LAB.HDL])})
    AND lo.lab_order_result IS NOT NULL AND lo.lab_order_result <> ''
  GROUP BY sp.person_id
  HAVING MAX(lo.lab_items_code = ${LAB.TC}) = 1
     AND MAX(lo.lab_items_code = ${LAB.HDL}) = 1`,
  billedSubquery: billedSubquery(ADP.TC_HDL),
  buildParams: (ctx) => ({
    ...baseParams(ctx),
    ...ageParams(ctx.periodStart, 45, 70),
    ...ICD.LIPID,
    lookbackFrom: minusYears(ctx.periodStart, CYCLE_YEARS.TC_HDL),
  }),
};

/**
 * HBsAg (B, ceiling): Thai, born before 1992-01-01, never tested before
 * 1 Oct (lab 122 or SPECIALPP 1B010*), no HBV diagnosis before 1 Oct.
 * Done = tested in the fiscal year. No ADP code -> billed null.
 */
const HBSAG_SPEC: PpfsSqlSpec = {
  targetWhere: `${CATCHMENT_THAI}${BORN_BEFORE_WHERE}${NO_PRIOR_HBV_DX_WHERE}${noPriorLabWhere(LAB.HBSAG, { lifetime: true })}${noPriorPpSpecialWhere(PP.HBV, { lifetime: true })}`,
  screenedSubquery: unionScreened(
    labScreened(LAB.HBSAG, false),
    ppSpecialScreened(PP.HBV),
  ),
  billedSubquery: null,
  buildParams: (ctx) => ({ ...baseParams(ctx), bornBefore: HEP_BORN_BEFORE }),
};

/** Anti-HCV (B, ceiling): as HBsAg with lab 219/430/1081, SPECIALPP 1B011*. */
const ANTI_HCV_SPEC: PpfsSqlSpec = {
  targetWhere: `${CATCHMENT_THAI}${BORN_BEFORE_WHERE}${NO_PRIOR_HCV_DX_WHERE}${noPriorLabWhere(LAB.HCV, { lifetime: true })}${noPriorPpSpecialWhere(PP.HCV, { lifetime: true })}`,
  screenedSubquery: unionScreened(
    labScreened(LAB.HCV, false),
    ppSpecialScreened(PP.HCV),
  ),
  billedSubquery: null,
  buildParams: (ctx) => ({ ...baseParams(ctx), bornBefore: HEP_BORN_BEFORE }),
};

/**
 * FPG (B): Thai, 35–59, no DM (E10–E14 before 1 Oct or DM clinic member),
 * in the risk group (FPG_RISK_WHERE). Done = FBS (lab 76/817) with a
 * result in the fiscal year (DTX not counted). Billed = ADP 12003.
 */
const FPG_SPEC: PpfsSqlSpec = {
  targetWhere: `${CATCHMENT_THAI}${AGE_MIN_WHERE}${AGE_MAX_WHERE}${NO_PRIOR_DIAGNOSIS_WHERE}${NO_PRIOR_CLINIC_MEMBER_WHERE}${FPG_RISK_WHERE}`,
  screenedSubquery: labScreened(LAB.FBS, true),
  billedSubquery: billedSubquery(ADP.FPG),
  buildParams: (ctx) => ({
    ...baseParams(ctx),
    ...ageParams(ctx.periodStart, 35, 59),
    ...ICD.DM,
    clinicCode: DM_CLINIC,
    lookbackFrom: minusYears(ctx.periodStart, FPG_RISK_YEARS),
  }),
};

/**
 * CBC women (B): Thai women 13–24, not pregnant during the fiscal year.
 * Done = Hb (lab 3) with a result on the Hematology form in the fiscal
 * year. Billed = ADP 13001.
 */
const CBC_WOMEN_SPEC: PpfsSqlSpec = {
  targetWhere: `${CATCHMENT_THAI}${PERSON_FEMALE_WHERE}${AGE_MIN_WHERE}${AGE_MAX_WHERE}${NOT_PREGNANT_WHERE}`,
  screenedSubquery: labScreened(
    [LAB.HB],
    true,
    `
    AND h.form_name = '${HEMATOLOGY_FORM}'`,
  ),
  billedSubquery: billedSubquery(ADP.CBC),
  buildParams: (ctx) => ({
    ...baseParams(ctx),
    ...ageParams(ctx.periodStart, 13, 24),
  }),
};

export const PPFS_CATCHMENT_SQL: Record<CatchmentCode, PpfsVillageSql> = {
  FIT: buildPpfsVillageSql(FIT_SPEC),
  CX_HPV: buildPpfsVillageSql(CX_SPEC),
  TC_HDL: buildPpfsVillageSql(TC_HDL_SPEC),
  HBSAG: buildPpfsVillageSql(HBSAG_SPEC),
  ANTI_HCV: buildPpfsVillageSql(ANTI_HCV_SPEC),
  FPG: buildPpfsVillageSql(FPG_SPEC),
  CBC_WOMEN: buildPpfsVillageSql(CBC_WOMEN_SPEC),
};

export function isCatchmentCode(code: PpfsHospitalItemCode): code is CatchmentCode {
  return code in PPFS_CATCHMENT_SQL;
}

// --- service-based ANC -----------------------------------------------------

/** ANC schedule: gestational age (days from LMP) of the 8 visits. */
const ANC_SCHEDULE_DAYS = [84, 140, 182, 210, 238, 252, 266, 280] as const;
/**
 * PPFS pays visits 1-8 per pregnancy without extra documents; visit 9+
 * needs supporting evidence (reported separately as extra_visits).
 */
const ANC_MAX_VISITS = ANC_SCHEDULE_DAYS.length;
/** Gestational age (days from LMP) used by the ANC items. */
const ANC_GA = {
  /** First-trimester lab set 1 is due by GA 12 weeks (start of care). */
  START_DUE: 84,
  /** Lab orders from GA 28 weeks on are lab set 2, before it lab set 1. */
  LAB2_FROM: 196,
  /** Lab set 2 is due at GA 32 weeks. */
  LAB2_DUE: 224,
  /** End of a pregnancy when no labor date is known (exclusive). */
  END: 301,
} as const;

/** Billed visits of `codes` from the `bill` CTE of PPFS_ANC_SQL. */
const billedFrom = (codes: readonly string[]) =>
  `(SELECT COALESCE(SUM(b.visits), 0) FROM bill b
         WHERE b.adp IN (${sqlCodeList(codes)}))`;

const inFy = (expr: string) => `(${expr} BETWEEN :periodStart AND :dataAsOf)`;
const lmpPlus = (days: number) => `DATE_ADD(a.lmp, INTERVAL ${days} DAY)`;

/**
 * ANC items (service-based): pregnancies (person_anc with LMP) of Thai
 * women with at least one ANC service (person_anc_service) at the hospital
 * in the fiscal year, any TYPEAREA. One query for all five ANC items.
 * "Start of care in the FY" (exp_start) = GA 12 weeks on/after 1 Oct and
 * LMP before the end of the fiscal year.
 *
 * ANC visit (B):
 *  - target_visits = scheduled visits (ANC_SCHEDULE_DAYS from LMP) that
 *    fall in the fiscal year
 *  - done_visits   = distinct ANC service dates in the fiscal year, at most
 *    ANC_MAX_VISITS per pregnancy (the in-FY schedule is NOT used as the
 *    cap: LMP-based schedules are approximate and visits outside them are
 *    still payable). FY2569: 984 (uncapped 1,086, capped at the in-FY
 *    schedule 900). Visits before 1 Oct are not subtracted from the cap.
 *    NHSO pays visits 1-8 per pregnancy without extra documents.
 *  - extra_visits  = in-FY visits beyond ANC_MAX_VISITS per pregnancy
 *    ("visit 9+"): claimable only with supporting evidence reviewed by
 *    NHSO, so reported separately and never added to done / target.
 *    FY2569: 102 (= 1,086 - 984). extra_pregnancies = pregnancies with
 *    at least one such visit.
 *  - target_visits counts at most one visit per schedule point, i.e. at
 *    most 8 per pregnancy, so it already follows the 1-8 rule.
 * Lab set 1 (B):
 *  - target_lab1 = exp_start
 *  - done_lab1   = those with a 'LAB ANC' order in the fiscal year before
 *    GA 28 weeks (later orders are lab set 2). FY2569: 167 (188 when any
 *    in-FY order counted).
 * Lab set 2 (B):
 *  - target_lab2 = pregnancies whose GA 32 weeks falls in the fiscal year
 *  - done_lab2   = those with a 'LAB ANC' order in the fiscal year at
 *    GA 28 weeks up to the end of pregnancy (LMP + 300 days)
 * Ultrasound (B):
 *  - target_us = exp_start
 *  - done_us   = those with person_anc_service.ultrasound_flag = 'Y' in
 *    the fiscal year, at most one per pregnancy (what the hospital bills)
 * Dental (B):
 *  - target_dental = exp_start
 *  - done_dental   = those with a dental exam / scaling (dtmain.tmcode
 *    ANC_DENTAL_TMCODES) in the fiscal year between LMP and LMP + 300
 * billed_* = OPD visits (opitemrece.an empty) of these women in the fiscal
 * year charged with the item's ADP code.
 * -> one row.
 */
export const PPFS_ANC_SQL = `
WITH a AS (
  SELECT DISTINCT pa.person_anc_id, pa.lmp, p.patient_hn
  FROM person_anc pa
  JOIN person p
    ON p.person_id = pa.person_id
  JOIN person_anc_service s
    ON s.person_anc_id = pa.person_anc_id
  WHERE s.anc_service_date >= :periodStart
    AND s.anc_service_date <  DATE_ADD(:dataAsOf, INTERVAL 1 DAY)
    AND p.nationality = '99'
    AND pa.lmp IS NOT NULL
),
sched AS (
  SELECT a.person_anc_id,
         ${ANC_SCHEDULE_DAYS.map((d) => inFy(lmpPlus(d))).join("\n       + ")} AS exp_visits,
         (${lmpPlus(ANC_GA.START_DUE)} >= :periodStart
          AND a.lmp < DATE_ADD(:dataAsOf, INTERVAL 1 DAY)) AS exp_start,
         ${inFy(lmpPlus(ANC_GA.LAB2_DUE))} AS exp_lab2
  FROM a
),
v AS (
  SELECT s.person_anc_id, COUNT(DISTINCT s.anc_service_date) AS visits
  FROM person_anc_service s
  JOIN a
    ON a.person_anc_id = s.person_anc_id
  WHERE s.anc_service_date >= :periodStart
    AND s.anc_service_date <  DATE_ADD(:dataAsOf, INTERVAL 1 DAY)
  GROUP BY s.person_anc_id
),
lab AS (
  SELECT a.person_anc_id,
         MAX(h.order_date < ${lmpPlus(ANC_GA.LAB2_FROM)}) AS lab1,
         MAX(h.order_date >= ${lmpPlus(ANC_GA.LAB2_FROM)}
             AND h.order_date < ${lmpPlus(ANC_GA.END)}) AS lab2
  FROM a
  JOIN lab_head h
    ON h.hn = a.patient_hn
  WHERE h.order_date >= :periodStart
    AND h.order_date <  DATE_ADD(:dataAsOf, INTERVAL 1 DAY)
    AND h.form_name = '${ANC_LAB_FORM}'
  GROUP BY a.person_anc_id
),
us AS (
  SELECT DISTINCT s.person_anc_id
  FROM person_anc_service s
  JOIN a
    ON a.person_anc_id = s.person_anc_id
  WHERE s.ultrasound_flag = 'Y'
    AND s.anc_service_date >= :periodStart
    AND s.anc_service_date <  DATE_ADD(:dataAsOf, INTERVAL 1 DAY)
),
dent AS (
  SELECT DISTINCT a.person_anc_id
  FROM a
  JOIN dtmain d
    ON d.hn = a.patient_hn
  WHERE d.tmcode IN (${sqlCodeList(ANC_DENTAL_TMCODES)})
    AND d.vstdate >= :periodStart
    AND d.vstdate <  DATE_ADD(:dataAsOf, INTERVAL 1 DAY)
    AND d.vstdate >= a.lmp
    AND d.vstdate <  ${lmpPlus(ANC_GA.END)}
),
bill AS (
  SELECT n.nhso_adp_code AS adp, COUNT(DISTINCT oi.vn) AS visits
  FROM opitemrece oi
  JOIN nondrugitems n
    ON n.icode = oi.icode
  WHERE n.nhso_adp_code IN (${sqlCodeList([
    ...ADP.ANC_VISIT,
    ...ADP.ANC_LAB1,
    ...ADP.ANC_LAB2,
    ...ADP.ANC_US,
    ...ADP.ANC_DENTAL,
  ])})
    AND (oi.an IS NULL OR oi.an = '')
    AND oi.vstdate >= :periodStart
    AND oi.vstdate <  DATE_ADD(:dataAsOf, INTERVAL 1 DAY)
    AND oi.hn IN (SELECT patient_hn FROM a)
  GROUP BY n.nhso_adp_code
)
SELECT COUNT(*)                                            AS pregnancies,
       COALESCE(SUM(sc.exp_visits), 0)                     AS target_visits,
       COALESCE(SUM(LEAST(COALESCE(v.visits, 0), ${ANC_MAX_VISITS})), 0) AS done_visits,
       COALESCE(SUM(GREATEST(COALESCE(v.visits, 0) - ${ANC_MAX_VISITS}, 0)), 0) AS extra_visits,
       COALESCE(SUM(COALESCE(v.visits, 0) > ${ANC_MAX_VISITS}), 0) AS extra_pregnancies,
       COALESCE(SUM(sc.exp_start), 0)                      AS target_lab1,
       COALESCE(SUM(sc.exp_start AND lab.lab1 = 1), 0)     AS done_lab1,
       COALESCE(SUM(sc.exp_lab2), 0)                       AS target_lab2,
       COALESCE(SUM(sc.exp_lab2 AND lab.lab2 = 1), 0)      AS done_lab2,
       COALESCE(SUM(sc.exp_start), 0)                      AS target_us,
       COALESCE(SUM(sc.exp_start AND us.person_anc_id IS NOT NULL), 0) AS done_us,
       COALESCE(SUM(sc.exp_start), 0)                      AS target_dental,
       COALESCE(SUM(sc.exp_start AND dent.person_anc_id IS NOT NULL), 0) AS done_dental,
       ${billedFrom(ADP.ANC_VISIT)} AS billed_visits,
       ${billedFrom(ADP.ANC_LAB1)} AS billed_lab1,
       ${billedFrom(ADP.ANC_LAB2)} AS billed_lab2,
       ${billedFrom(ADP.ANC_US)} AS billed_us,
       ${billedFrom(ADP.ANC_DENTAL)} AS billed_dental
FROM a
JOIN sched sc
  ON sc.person_anc_id = a.person_anc_id
LEFT JOIN v
  ON v.person_anc_id = a.person_anc_id
LEFT JOIN lab
  ON lab.person_anc_id = a.person_anc_id
LEFT JOIN us
  ON us.person_anc_id = a.person_anc_id
LEFT JOIN dent
  ON dent.person_anc_id = a.person_anc_id
`;

export function ppfsAncParams(ctx: ScreeningSqlContext): QueryParams {
  return { periodStart: ctx.periodStart, dataAsOf: ctx.dataAsOf };
}

// --- service-based delivery (postpartum) -----------------------------------

/** Postpartum window: days after the labor date (inclusive). */
const POSTPARTUM_DAYS = 42;
/** PPFS pays up to 3 postpartum visits per woman. */
export const PPFS_PP_MAX_VISITS = 3;

/**
 * Thai women who gave birth in the fiscal year, one row per hn with the
 * earliest labor date: IPD deliveries (ipt_pregnancy -> ipt.hn) plus
 * labor dates recorded on the ANC record (person_anc -> person.patient_hn).
 */
const DELIVERY_CTE = `
d0 AS (
  SELECT i.hn, pg.labor_date
  FROM ipt_pregnancy pg
  JOIN ipt i
    ON i.an = pg.an
  JOIN patient pt
    ON pt.hn = i.hn
  WHERE pg.labor_date BETWEEN :periodStart AND :dataAsOf
    AND pt.nationality = '99'
  UNION ALL
  SELECT p.patient_hn, pa.labor_date
  FROM person_anc pa
  JOIN person p
    ON p.person_id = pa.person_id
  WHERE pa.labor_date BETWEEN :periodStart AND :dataAsOf
    AND p.nationality = '99'
),
d AS (
  -- latest date: an earlier ipt_pregnancy row is usually a false-labour /
  -- preterm admission before the real delivery (FY2569: 2 women, 21-29 d apart)
  SELECT hn, MAX(labor_date) AS labor_date
  FROM d0
  WHERE hn IS NOT NULL AND hn <> ''
  GROUP BY hn
)`;

/**
 * Postpartum visit (B, ceiling) + iodine/iron after delivery (B), both on
 * DELIVERY_CTE (`d`):
 *  - deliveries     = women in d; target PP = deliveries × PPFS_PP_MAX_VISITS,
 *    target iodine = deliveries (computed in TypeScript)
 *  - done_pp        = distinct OPD visit dates 1-42 days after labor with
 *    ICD-10 Z392 or charged ADP 30015, at most PPFS_PP_MAX_VISITS per woman
 *  - billed_pp      = those visit dates charged with ADP 30015
 *  - done_iodine    = women dispensed IODINE_DRUG_ICODES (IPD or OPD)
 *    from the labor date to +42 days
 *  - billed_iodine  = visits (vn) charged ADP 30016 in the same window
 *    (visits, like every other "คิดเงินแล้ว (ครั้ง)" figure)
 * Cohort by labor date: a woman delivering late in the fiscal year has her
 * 42-day window (and services) partly in the next fiscal year; they still
 * count here. The next year's cohort is a different set of deliveries, so
 * nothing is counted twice or dropped.
 * -> one row.
 */
export const PPFS_DELIVERY_SQL = `
WITH ${DELIVERY_CTE},
pv AS (
  SELECT d.hn, o.vstdate,
         ROW_NUMBER() OVER (PARTITION BY d.hn ORDER BY o.vstdate) AS rn,
         MAX(oi.icode IS NOT NULL) AS billed
  FROM d
  JOIN ovst o
    ON o.hn = d.hn
   AND o.vstdate >  d.labor_date
   AND o.vstdate <= DATE_ADD(d.labor_date, INTERVAL ${POSTPARTUM_DAYS} DAY)
  LEFT JOIN opitemrece oi
    ON oi.vn = o.vn
   AND oi.icode IN (${adpIcodes(ADP.PP_VISIT)})
  WHERE oi.icode IS NOT NULL
     OR EXISTS (
          SELECT 1
          FROM ovstdiag x
          WHERE x.vn = o.vn
            AND x.icd10 IN (${sqlCodeList(PP_VISIT_ICD10)})
        )
  GROUP BY d.hn, o.vstdate
),
rx AS (
  SELECT d.hn,
         MAX(oi.icode IN (${sqlCodeList(IODINE_DRUG_ICODES)})) AS dispensed,
         -- rows are the drug or an ADP 30016 item only
         COUNT(DISTINCT CASE WHEN oi.icode NOT IN (${sqlCodeList(IODINE_DRUG_ICODES)})
                             THEN oi.vn END) AS billed
  FROM d
  JOIN opitemrece oi
    ON oi.hn = d.hn
   AND oi.vstdate >= d.labor_date
   AND oi.vstdate <= DATE_ADD(d.labor_date, INTERVAL ${POSTPARTUM_DAYS} DAY)
  WHERE oi.icode IN (${sqlCodeList(IODINE_DRUG_ICODES)})
     OR oi.icode IN (${adpIcodes(ADP.MCH_IODINE)})
  GROUP BY d.hn
)
SELECT (SELECT COUNT(*) FROM d)                                       AS deliveries,
       (SELECT COALESCE(SUM(pv.rn <= ${PPFS_PP_MAX_VISITS}), 0) FROM pv)   AS done_pp,
       (SELECT COALESCE(SUM(pv.rn <= ${PPFS_PP_MAX_VISITS} AND pv.billed), 0) FROM pv) AS billed_pp,
       (SELECT COALESCE(SUM(rx.dispensed), 0) FROM rx)                AS done_iodine,
       (SELECT COALESCE(SUM(rx.billed), 0) FROM rx)                   AS billed_iodine
`;

export function ppfsDeliveryParams(ctx: ScreeningSqlContext): QueryParams {
  return { periodStart: ctx.periodStart, dataAsOf: ctx.dataAsOf };
}

// --- pregnancy test (no target) --------------------------------------------

/**
 * Pregnancy test (C, no target): OPD visits (lab_head.vn not an admission
 * in an_stat) of Thai women (patient.sex '2') with a resulted urine
 * pregnancy test (lab LAB.UPT) ordered in the fiscal year.
 *  - done_upt   = those visits
 *  - billed_upt = those visits charged with ADP 30014
 * Includes pre-operative / pre-X-ray tests that may not be PP services.
 * -> one row.
 */
export const PPFS_UPT_SQL = `
WITH t AS (
  SELECT DISTINCT h.vn
  FROM lab_head h
  JOIN lab_order lo
    ON lo.lab_order_number = h.lab_order_number
  JOIN patient pt
    ON pt.hn = h.hn
  WHERE lo.lab_items_code IN (${sqlIntList(LAB.UPT)})
    AND h.order_date >= :periodStart
    AND h.order_date <  DATE_ADD(:dataAsOf, INTERVAL 1 DAY)
    AND lo.lab_order_result IS NOT NULL AND lo.lab_order_result <> ''
    AND pt.nationality = '99'
    AND pt.sex = '2'
    AND NOT EXISTS (SELECT 1 FROM an_stat x WHERE x.an = h.vn)
),
b AS (
  SELECT DISTINCT oi.vn
  FROM opitemrece oi
  WHERE oi.icode IN (${adpIcodes(ADP.MCH_UPT)})
    AND oi.vstdate >= :periodStart
    AND oi.vstdate <  DATE_ADD(:dataAsOf, INTERVAL 1 DAY)
)
SELECT COUNT(*)              AS done_upt,
       COUNT(b.vn)           AS billed_upt
FROM t
LEFT JOIN b
  ON b.vn = t.vn
`;

export function ppfsUptParams(ctx: ScreeningSqlContext): QueryParams {
  return { periodStart: ctx.periodStart, dataAsOf: ctx.dataAsOf };
}

// --- family planning (no target) -------------------------------------------

/**
 * drugitems.icode of the contraceptives (verified with db-cli, 2026-11-17).
 * DMPA 1460145 is inactive (istatus 'N') but kept for past fiscal years.
 * COC qty is dispensed in packs (แผง): 1900424 is labelled แผง; 1510047 is
 * labelled เม็ด but its OPD qty is 1-6 per visit, i.e. packs as well.
 */
const FP_DRUG_ICODES = {
  DMPA: ["1900342", "1460145"],
  COC: ["1510047", "1900424"],
} as const;

/** nondrugitems.nhso_adp_code of the FP service fees. */
const FP_ADP = {
  DMPA: ["FP003_4"], // nondrugitems 3002638, 60 baht
  COC: ["FP003_1"], // nondrugitems 3002132, 40 baht per pack
} as const;

/** NHSO FY2569 caps. */
export const PPFS_FP_LIMITS = {
  /** DMPA injections paid per woman per year. */
  DMPA_PER_YEAR: 5,
  /** COC packs paid per dispensing visit. */
  COC_PER_VISIT: 3,
  /** COC packs paid per woman per year. */
  COC_PER_YEAR: 13,
} as const;

/**
 * Family planning (C, no target), OPD (opitemrece.an empty) dispensing
 * (qty > 0: a 0-qty row is not a dispensing) to Thai women
 * (patient.nationality '99', sex '2') in the fiscal year:
 *  - done_dmpa   = distinct visits with a DMPA drug, at most
 *                  DMPA_PER_YEAR per woman (in date order)
 *  - billed_dmpa = those visits charged FP003_4
 *  - done_pill   = COC packs: SUM(qty) per visit capped at COC_PER_VISIT,
 *                  then cumulated per woman and capped at COC_PER_YEAR
 *  - billed_pill = COC visits (still under the yearly cap) charged
 *                  FP003_1 — visits, not packs
 * Emergency (FP003_3) and progestin-only (FP003_2) pills are not counted.
 * -> one row.
 */
export const PPFS_FP_SQL = `
WITH rx AS (
  SELECT oi.vn, oi.hn, oi.vstdate, oi.icode, oi.qty
  FROM opitemrece oi
  JOIN patient pt
    ON pt.hn = oi.hn
  WHERE oi.icode IN (${sqlCodeList([...FP_DRUG_ICODES.DMPA, ...FP_DRUG_ICODES.COC])})
    AND oi.vstdate >= :periodStart
    AND oi.vstdate <  DATE_ADD(:dataAsOf, INTERVAL 1 DAY)
    AND (oi.an IS NULL OR oi.an = '')
    AND oi.vn IS NOT NULL AND oi.vn <> ''
    AND oi.qty > 0
    AND pt.nationality = '99'
    AND pt.sex = '2'
),
bill AS (
  SELECT DISTINCT oi.vn, n.nhso_adp_code AS adp
  FROM opitemrece oi
  JOIN nondrugitems n
    ON n.icode = oi.icode
  WHERE n.nhso_adp_code IN (${sqlCodeList([...FP_ADP.DMPA, ...FP_ADP.COC])})
    AND oi.vstdate >= :periodStart
    AND oi.vstdate <  DATE_ADD(:dataAsOf, INTERVAL 1 DAY)
),
dmpa AS (
  SELECT x.vn,
         ROW_NUMBER() OVER (PARTITION BY x.hn ORDER BY x.vstdate, x.vn) AS rn
  FROM (
    SELECT DISTINCT rx.vn, rx.hn, rx.vstdate
    FROM rx
    WHERE rx.icode IN (${sqlCodeList(FP_DRUG_ICODES.DMPA)})
  ) x
),
pill AS (
  SELECT x.vn, x.packs,
         SUM(x.packs) OVER (PARTITION BY x.hn ORDER BY x.vstdate, x.vn) AS cum
  FROM (
    SELECT rx.vn, rx.hn, MIN(rx.vstdate) AS vstdate,
           LEAST(SUM(rx.qty), ${PPFS_FP_LIMITS.COC_PER_VISIT}) AS packs
    FROM rx
    WHERE rx.icode IN (${sqlCodeList(FP_DRUG_ICODES.COC)})
    GROUP BY rx.vn, rx.hn
  ) x
)
SELECT
  (SELECT COUNT(*) FROM dmpa
    WHERE dmpa.rn <= ${PPFS_FP_LIMITS.DMPA_PER_YEAR})                    AS done_dmpa,
  (SELECT COUNT(*) FROM dmpa
    JOIN bill b ON b.vn = dmpa.vn AND b.adp IN (${sqlCodeList(FP_ADP.DMPA)})
    WHERE dmpa.rn <= ${PPFS_FP_LIMITS.DMPA_PER_YEAR})                    AS billed_dmpa,
  (SELECT COALESCE(SUM(GREATEST(0, LEAST(pill.packs,
            ${PPFS_FP_LIMITS.COC_PER_YEAR} - (pill.cum - pill.packs)))), 0)
     FROM pill)                                                        AS done_pill,
  (SELECT COUNT(*) FROM pill
    JOIN bill b ON b.vn = pill.vn AND b.adp IN (${sqlCodeList(FP_ADP.COC)})
    WHERE pill.cum - pill.packs < ${PPFS_FP_LIMITS.COC_PER_YEAR})        AS billed_pill
`;

export function ppfsFpParams(ctx: ScreeningSqlContext): QueryParams {
  return { periodStart: ctx.periodStart, dataAsOf: ctx.dataAsOf };
}

// --- influenza vaccine (no target) -----------------------------------------

/**
 * person_vaccine.export_vaccine_code of the NHSO influenza vaccine
 * (person_vaccine_id 32 'Flu'). 817 (social-security insured, 50+) and
 * 818 (others) are not NHSO-funded and are not counted. Not part of
 * EPI_FEE_CODES (P&P Basic, sql/ppbasic-child-hosxp.ts): no double count.
 */
const FLU_VACCINE_CODES = ["815"] as const;

/**
 * Influenza vaccine service fee (C, no target): doses given by the
 * hospital (ovst_vaccine) to Thai patients (patient.nationality '99') with
 * the visit date in the fiscal year; one dose per (visit, vaccine code)
 * (the same dose is sometimes recorded twice on one visit).
 * No billed figure: claimed through KTB / MOPH Immunization Center, there
 * is no fee item in HOSxP.
 * -> one row.
 */
export const PPFS_FLU_SQL = `
SELECT COUNT(*) AS done_flu
FROM (
  SELECT STRAIGHT_JOIN DISTINCT ov.vn, pv.export_vaccine_code
  FROM ovst_vaccine ov
  JOIN person_vaccine pv
    ON pv.person_vaccine_id = ov.person_vaccine_id
  JOIN ovst o
    ON o.vn = ov.vn
  JOIN patient pt
    ON pt.hn = o.hn
  WHERE pv.export_vaccine_code IN (${sqlCodeList(FLU_VACCINE_CODES)})
    AND o.vstdate >= :periodStart
    AND o.vstdate <  DATE_ADD(:dataAsOf, INTERVAL 1 DAY)
    AND pt.nationality = '99'
) f
`;

export function ppfsFluParams(ctx: ScreeningSqlContext): QueryParams {
  return { periodStart: ctx.periodStart, dataAsOf: ctx.dataAsOf };
}
