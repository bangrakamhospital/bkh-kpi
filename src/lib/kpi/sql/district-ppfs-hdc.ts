import "server-only";

import type { QueryParams } from "@/lib/db/read-only-pool";
import type { PpfsItemCode } from "@/lib/kpi/ppfs-rates";
import {
  hdcDateParam,
  RESIDENTS_CTE,
  targetCte,
  type HdcScreeningSqlContext,
  type TargetRules,
} from "./hdc-common";
import { CERVICAL_SCREENING_PP_CODES } from "./screening-cancer-hosxp";
import { minusYears, sqlCodeList } from "./screening-common";

/**
 * District PPFS items (/district/pp, page "ppfs") on the HDC 43-file
 * database ONLY (`sub_hdc`, never HOSxP). Same 9 items, rates and intent
 * as the hospital PPFS page (../ppfs-rates.ts PPFS_PHASE1_ITEMS,
 * ./ppfs-hosxp.ts), re-expressed with 43-file data. Definitions, FY2569
 * figures and the comparison with the hospital: docs/kpi/district-pp-ppfs.md.
 *
 * Population: `residents` (./hdc-common: PERSON typearea 1/3, discharge 9,
 * CID de-duplicated across all units, home village in 650401–650411, not
 * in DEATH) restricted to Thai nationality ('099', PPFS pays Thai people
 * only), age in full years on 1 Oct. A service counts at ANY unit of the
 * district (matched by the MD5 CID, which never leaves SQL).
 *
 * HDC history: SERVICE / LABFU / DIAGNOSIS / DRUG_OPD start 2025-10 and
 * SPECIALPP 2025-05; CHRONIC is a full snapshot but holds almost only
 * DM / HT (no E78, C18–C20 or B-codes). Hence two rules differ from HOSxP:
 *  1. "Done in the previous cycle" exclusions use their real window
 *     (:lookbackFrom … before :periodStart, or ever) so they work from
 *     FY2570 on, but for FY2569 they find (almost) nothing: the targets of
 *     FIT / CX / TC+HDL / HBsAg / Anti-HCV are ceilings that year.
 *  2. "Already known" exclusions (diagnosis, statin) are applied when the
 *     diagnosis / first statin is dated BEFORE the person's first counted
 *     service of the FY (statin: on or before), or at any time up to
 *     :dataAsOf when the person was not served. This includes everything
 *     before 1 Oct (= HOSxP) and, without history, also catches known
 *     patients whose first HDC record is in the FY; a condition found by
 *     the screening itself (diagnosed later) does not remove the person.
 *
 * Every query returns rows { vid, hospcode, code, target, done } — one per
 * village × responsible unit × code with target > 0. `hospcode` = 5-digit
 * unit of the person's chosen PERSON record ("GA00…" normalised): five
 * villages of 650404 (vid 65040401/06/09/10/11) are served by both 07529
 * and 11803, so per-unit totals need it. A loader keyed by vid only sums
 * the rows of a vid. Target / done are counts (SUM may come back as a
 * decimal string: convert with Number()). Rates are applied in TypeScript.
 *
 * Parameters (all 'YYYYMMDD', HDC dates are strings):
 *   :periodStart  1 Oct of the fiscal year (age reference, cycle boundary)
 *   :countFrom    first day services count (= periodStart for PPFS)
 *   :dataAsOf     inclusive end of counted data
 * plus per query (buildParams): :birthOnOrBefore [:birthAfter]
 * [:lookbackFrom] [:ancFrom].
 * Code lists are source constants; only values are bound.
 *
 * Verified with db-cli --conn 2 for FY2569 (periodStart 20251001,
 * dataAsOf 20260930); figures and timings per item below (district total
 * FY2569: target 12.31 M baht, earned 1.33 M baht).
 */

// --- codes (verified with db-cli --conn 2, FY2569) --------------------------

/** SPECIALPP.ppspecial (c_specialpp_ppspecial). */
const PP = {
  /** ตรวจคัดกรองมะเร็งลำไส้ ผลลบ / ผลบวก (FIT): 18 units. */
  FIT: ["1B0060", "1B0061"],
  /** HBV screening (unspecified / positive / negative): 9 units. */
  HBV: ["1B010", "1B0100", "1B0101"],
  /** HCV screening (unspecified / positive / negative): 10 units. */
  HCV: ["1B011", "1B0110", "1B0111"],
} as const;

/** LABFU.labtest (c_labfu_labtest). */
const LAB = {
  /** Cholesterol, total, serum/plasma (22 units). */
  TC: "0541602",
  /** HDL Cholesterol, serum/plasma (22 units). */
  HDL: "0541202",
  /** HBsAg (7 units). 0741499 = anti-HBs, not counted. */
  HBSAG: ["0746299"],
  /** Anti-HCV (6 units). HCV viral load 0749302 = follow-up, not counted. */
  HCV: ["0741699"],
  /** Glucose, serum/plasma = venous FPG (same code as the DMC confirmation). */
  FPG: ["0531002"],
  /**
   * CBC women: Hemoglobin, whole blood (5 units) and CBC with / without
   * automated differential (8 / 9 units). Hematocrit alone (0621201, 22
   * units) is NOT counted (= HOSxP: CBC = Hb).
   */
  CBC: ["0621401", "0620201", "0620401"],
  /** ANC lab set 1 proxy: VDRL, TPHA, HIV antibody. */
  ANC_LAB1: ["0721297", "0721299", "0743299"],
} as const;

/**
 * Statins in DRUG_OPD.didstd (24-digit drug code): generic prefixes
 * simvastatin 105573, atorvastatin 124823, rosuvastatin 143383 (only
 * statins carry them in sub_hdc) + one unit's local atorvastatin code.
 */
const STATIN_DIDSTD_PREFIXES = ["105573", "124823", "143383"] as const;
const STATIN_DIDSTD_CODES = ["1900665"] as const;

/** ICD-10 predicates (HDC codes have no dot), = HOSxP exclusions. */
type DxWhere = (col: string) => string;
const DX: Record<"CRC" | "DM" | "DM_HT" | "LIPID" | "HBV" | "HCV", DxWhere> = {
  CRC: (c) => `${c} >= 'C18' AND ${c} < 'C21'`, // C18–C20
  DM: (c) => `${c} >= 'E10' AND ${c} < 'E15'`, // E10–E14
  DM_HT: (c) =>
    `((${c} >= 'E10' AND ${c} < 'E15') OR (${c} >= 'I10' AND ${c} < 'I16'))`, // E10–E14, I10–I15
  LIPID: (c) => `${c} >= 'E78' AND ${c} < 'E79'`, // E78*
  HBV: (c) => `(${c} LIKE 'B16%' OR ${c} IN ('B180', 'B181', 'B191', 'Z225'))`,
  HCV: (c) => `${c} IN ('B171', 'B182')`,
};

/** HBsAg / Anti-HCV: born before 1 Jan 2535 BE (birth <= this). */
const HEP_BORN_ON_OR_BEFORE = "19911231";

/** Look-back windows (years before :periodStart) = HOSxP CYCLE_YEARS. */
const CYCLE_YEARS = { FIT: 1, CX: 5, TC_HDL: 5 } as const;
/** FPG risk group: NCD screening of this or the previous FY. */
const FPG_RISK_YEARS = 1;

/** ANC schedule (days from LMP) of the 8 paid visits = HOSxP. */
const ANC_SCHEDULE_DAYS = [84, 140, 182, 210, 238, 252, 266, 280] as const;
const ANC_MAX_VISITS = ANC_SCHEDULE_DAYS.length;
/** Lab set 1 is due by GA 12 weeks. */
const ANC_LAB1_DUE_DAYS = 84;
/** A pregnancy lasts at most 301 days (43 weeks) from LMP. */
const PREGNANCY_MAX_DAYS = 301;
/** Estimated LMPs of one woman further apart than this = another pregnancy. */
const PREGNANCY_SPLIT_DAYS = 120;

function digitsOnly(values: readonly string[]): readonly string[] {
  for (const v of values) {
    if (!/^[0-9]{1,24}$/.test(v)) throw new Error(`invalid code: ${v}`);
  }
  return values;
}

// --- fragments ---------------------------------------------------------------

const IN_FY = "$d >= :countFrom AND $d <= :dataAsOf";
const PRIOR_WINDOW = "$d >= :lookbackFrom AND $d < :periodStart";
const PRIOR_EVER = "$d < :periodStart";

/** Rows (cid, dt, part) of SPECIALPP `codes`; `$d` in dateCond = date column. */
function ppRows(codes: readonly string[], dateCond: string, part = "x"): string {
  return `
    SELECT s.cid, s.date_serv AS dt, '${part}' AS part
    FROM specialpp s
    WHERE s.ppspecial IN (${sqlCodeList(codes)})
      AND ${dateCond.replaceAll("$d", "s.date_serv")}`;
}

/** Rows (cid, dt, part) of LABFU `codes` with a non-empty result. */
function labRows(codes: readonly string[], dateCond: string, part = "x"): string {
  return `
    SELECT l.cid, l.date_serv AS dt, '${part}' AS part
    FROM labfu l
    WHERE l.labtest IN (${sqlCodeList(codes)})
      AND ${dateCond.replaceAll("$d", "l.date_serv")}
      AND COALESCE(l.labresult, '') <> ''`;
}

const unionAll = (parts: readonly string[]) => parts.join("\n    UNION ALL");

/** Rows (cid, dt) of a diagnosis up to :dataAsOf: CHRONIC + DIAGNOSIS_OPD / IPD. */
function dxRows(where: DxWhere): string {
  return `
    SELECT c.cid, c.date_diag AS dt FROM chronic c
    WHERE ${where("c.chronic")} AND c.date_diag <= :dataAsOf
    UNION ALL
    SELECT o.cid, o.date_serv FROM diagnosis_opd o
    WHERE ${where("o.diagcode")} AND o.date_serv <= :dataAsOf
    UNION ALL
    SELECT i.cid, LEFT(i.datetime_admit, 8) FROM diagnosis_ipd i
    WHERE ${where("i.diagcode")} AND LEFT(i.datetime_admit, 8) <= :dataAsOf`;
}

/** Rows (cid, dt) of a CHRONIC registration (no DIAGNOSIS) up to :dataAsOf. */
function chronicRows(where: DxWhere): string {
  return `
    SELECT c.cid, c.date_diag AS dt FROM chronic c
    WHERE ${where("c.chronic")} AND c.date_diag <= :dataAsOf`;
}

/** Rows (cid, dt) of statins dispensed in [:lookbackFrom, :dataAsOf]. */
const STATIN_ROWS = `
    SELECT d.cid, d.date_serv AS dt
    FROM drug_opd d
    WHERE (${STATIN_DIDSTD_PREFIXES.map(
      (p) => `d.didstd LIKE '${digitsOnly([p])[0]}%'`,
    ).join(" OR ")}
           OR d.didstd IN (${digitsOnly(STATIN_DIDSTD_CODES)
             .map((c) => `'${c}'`)
             .join(", ")}))
      AND d.date_serv >= :lookbackFrom
      AND d.date_serv <= :dataAsOf`;

/** 5-digit unit code ("GA0007535" -> "07535"), = hdc-common. */
const UNIT_CODE = (col: string) =>
  `CASE WHEN ${col} LIKE 'GA%' THEN RIGHT(${col}, 5) ELSE ${col} END`;

interface KnownRule {
  /** Rows (cid, dt). */
  rows: string;
  /** true: a record ON the first service day also excludes (statin). */
  sameDayExcludes: boolean;
}

interface CatchmentParts {
  /** Age / sex / Thai on `residents` (excludeKnown must be false). */
  rules: TargetRules;
  /**
   * CTE `risk(cid, …)` and the condition on `rk` / `pop` a target member
   * must meet. The CTE must not reference `pop` (MariaDB would then expand
   * residents laterally: 4.4 s instead of 2 s).
   */
  risk?: { cte: string; where: string };
  /** Rows (cid, …): already served in the cycle window -> not in target. */
  prior: readonly string[];
  /** Rows (cid, dt, part): services of the FY. */
  done: readonly string[];
  /** Parts that ALL must be present to count as done (default: any row). */
  requiredParts?: readonly string[];
  known: readonly KnownRule[];
}

/**
 * Catchment item: target = `pop` (targetCte on residents) [∩ risk] minus
 * `prior` minus "already known"; done = target members with a counted
 * FY service. -> rows { vid, hospcode, code, target, done }.
 */
function catchmentSql(code: PpfsItemCode, parts: CatchmentParts): string {
  const { rules, risk, prior, done, requiredParts, known } = parts;
  if (rules.excludeKnown) throw new Error("use `known` rules instead");
  const counted = requiredParts?.length
    ? requiredParts
        .map((p) => {
          if (!/^[A-Za-z0-9_]+$/.test(p)) throw new Error("invalid part");
          return `MAX(u.part = '${p}')`;
        })
        .join(" AND ")
    : "1";
  const knownCtes = known
    .map(
      (k, i) => `,
kx${i} AS (
  SELECT k.cid, MIN(k.dt) AS first_dt
  FROM (${k.rows}
  ) k
  GROUP BY k.cid
)`,
    )
    .join("");
  const knownJoins = known
    .map((_, i) => `\n  LEFT JOIN kx${i} ON kx${i}.cid = pop.cid`)
    .join("");
  const knownWhere = known
    .map(
      (k, i) =>
        `\n    AND (kx${i}.cid IS NULL OR kx${i}.first_dt ${k.sameDayExcludes ? ">" : ">="} COALESCE(dn.first_dt, '99999999'))`,
    )
    .join("");
  return `${RESIDENTS_CTE},${targetCte("pop", rules)}${risk ? `,${risk.cte}` : ""}${
    prior.length
      ? `,
prior AS (
  SELECT DISTINCT p.cid FROM (${unionAll(prior)}
  ) p
)`
      : ""
  },
done AS (
  SELECT u.cid, MIN(u.dt) AS first_dt, ${counted} AS counted
  FROM (${unionAll(done)}
  ) u
  GROUP BY u.cid
)${knownCtes},
target AS (
  SELECT pop.cid, pop.vid, pop.hospcode, COALESCE(dn.counted, 0) AS counted
  FROM pop${risk ? "\n  JOIN risk rk ON rk.cid = pop.cid" : ""}${
    prior.length ? "\n  LEFT JOIN prior pr ON pr.cid = pop.cid" : ""
  }
  LEFT JOIN done dn ON dn.cid = pop.cid${knownJoins}
  WHERE 1 = 1${risk ? `\n    AND (${risk.where})` : ""}${prior.length ? "\n    AND pr.cid IS NULL" : ""}${knownWhere}
)
SELECT t.vid AS vid,
       ${UNIT_CODE("t.hospcode")} AS hospcode,
       '${code}' AS code,
       COUNT(*) AS target,
       COALESCE(SUM(t.counted), 0) AS done
FROM target t
GROUP BY 1, 2
`;
}

/** Age bounds on 1 Oct ('YYYYMMDD'), same rule as hdc-screening ageParams. */
function ageParams(
  periodStart: string,
  minAge: number,
  maxAge: number | null,
): QueryParams {
  const p: QueryParams = {
    birthOnOrBefore: hdcDateParam(minusYears(periodStart, minAge)),
  };
  if (maxAge !== null) {
    p.birthAfter = hdcDateParam(minusYears(periodStart, maxAge + 1));
  }
  return p;
}

function baseParams(ctx: HdcScreeningSqlContext): QueryParams {
  return {
    periodStart: hdcDateParam(ctx.periodStart),
    countFrom: hdcDateParam(ctx.countFrom),
    dataAsOf: hdcDateParam(ctx.dataAsOf),
  };
}

function lookback(ctx: HdcScreeningSqlContext, years: number): QueryParams {
  return { lookbackFrom: hdcDateParam(minusYears(ctx.periodStart, years)) };
}

const THAI = { thaiOnly: true, excludeKnown: false } as const;
const dxRule = (where: DxWhere): KnownRule => ({
  rows: dxRows(where),
  sameDayExcludes: false,
});

// --- items -------------------------------------------------------------------

export interface DistrictPpfsQuery {
  /** Codes whose cells this query returns. */
  codes: readonly PpfsItemCode[];
  /** -> rows { vid, hospcode, code, target, done } (see module comment). */
  sql: string;
  buildParams(ctx: HdcScreeningSqlContext): QueryParams;
}

/**
 * FIT (A): Thai 50–70, no FIT SPECIALPP 1B0060/1 in the previous FY, no
 * C18–C20 known before the first FIT. Done = SPECIALPP 1B0060/1 in the FY.
 * LABFU 0583166 'Occult blood, stool' is NOT counted: it does not tell FIT
 * from guaiac (11252 sends ~400 more lab-only people than PP codes, and
 * almost every PP-coded person also has the lab; 263 lab-only people in
 * the FY2569 target). FY2569: target 20,690 / done 1,228 (1.2–1.6 s).
 */
const FIT_QUERY: DistrictPpfsQuery = {
  codes: ["FIT"],
  sql: catchmentSql("FIT", {
    rules: { maxAge: true, female: false, ...THAI },
    prior: [ppRows(PP.FIT, PRIOR_WINDOW)],
    done: [ppRows(PP.FIT, IN_FY)],
    known: [dxRule(DX.CRC)],
  }),
  buildParams: (ctx) => ({
    ...baseParams(ctx),
    ...ageParams(ctx.periodStart, 50, 70),
    ...lookback(ctx, CYCLE_YEARS.FIT),
  }),
};

/**
 * Cervical, collection + HPV (B): Thai women 30–59, no cervical SPECIALPP
 * (CERVICAL_SCREENING_PP_CODES, = district CX KPI) in the 5 years before
 * 1 Oct (HDC: only from 2025-05). Done = cervical SPECIALPP in the FY
 * (mostly 1B0046 HPV; LABFU has no HPV / Pap code).
 * FY2569: target 11,978 / done 1,006 (1.1 s).
 */
const CX_QUERY: DistrictPpfsQuery = {
  codes: ["CX_HPV"],
  sql: catchmentSql("CX_HPV", {
    rules: { maxAge: true, female: true, ...THAI },
    prior: [ppRows(CERVICAL_SCREENING_PP_CODES, PRIOR_WINDOW)],
    done: [ppRows(CERVICAL_SCREENING_PP_CODES, IN_FY)],
    known: [],
  }),
  buildParams: (ctx) => ({
    ...baseParams(ctx),
    ...ageParams(ctx.periodStart, 30, 59),
    ...lookback(ctx, CYCLE_YEARS.CX),
  }),
};

/**
 * TC + HDL (B): Thai 45–70, no TC or HDL result in the 5 years before
 * 1 Oct, no E78 known before the first TC/HDL test of the FY, no statin
 * (DRUG_OPD, from :lookbackFrom) dispensed on or before that day, and —
 * HDC proxy of the 5-year rule — not a DM / HT patient registered in
 * CHRONIC (E10–E14, I10–I15) before that test: they get a lipid profile
 * every year as chronic care (RLU), so with history the 5-year rule would
 * remove them; without it they were 4,797 of 6,133 "done" in FY2569.
 * Done = both TC (0541602) and HDL (0541202) with a result in the FY.
 * FY2569: target 14,465 / done 1,505 (2.2–3.9 s); without the DM / HT
 * rule 20,396 / 6,133.
 */
const TC_HDL_QUERY: DistrictPpfsQuery = {
  codes: ["TC_HDL"],
  sql: catchmentSql("TC_HDL", {
    rules: { maxAge: true, female: false, ...THAI },
    prior: [labRows([LAB.TC, LAB.HDL], PRIOR_WINDOW)],
    done: [labRows([LAB.TC], IN_FY, "TC"), labRows([LAB.HDL], IN_FY, "HDL")],
    requiredParts: ["TC", "HDL"],
    known: [
      dxRule(DX.LIPID),
      { rows: STATIN_ROWS, sameDayExcludes: true },
      { rows: chronicRows(DX.DM_HT), sameDayExcludes: false },
    ],
  }),
  buildParams: (ctx) => ({
    ...baseParams(ctx),
    ...ageParams(ctx.periodStart, 45, 70),
    ...lookback(ctx, CYCLE_YEARS.TC_HDL),
  }),
};

/**
 * HBsAg / Anti-HCV (B, ceiling): Thai, born before 1 Jan 1992, never
 * tested before 1 Oct (LABFU / SPECIALPP — history only from 2025-05),
 * no HBV / HCV diagnosis known before the first test. Done = LABFU with a
 * result or SPECIALPP in the FY. FY2569: HBsAg 38,147 / 1,849, Anti-HCV
 * 38,290 / 1,788 (1.3–1.4 s each).
 */
function hepQuery(
  code: "HBSAG" | "ANTI_HCV",
  dx: DxWhere,
  lab: readonly string[],
  pp: readonly string[],
): DistrictPpfsQuery {
  return {
    codes: [code],
    sql: catchmentSql(code, {
      rules: { maxAge: false, female: false, ...THAI },
      prior: [labRows(lab, PRIOR_EVER), ppRows(pp, PRIOR_EVER)],
      done: [labRows(lab, IN_FY), ppRows(pp, IN_FY)],
      known: [dxRule(dx)],
    }),
    buildParams: (ctx) => ({
      ...baseParams(ctx),
      birthOnOrBefore: HEP_BORN_ON_OR_BEFORE,
    }),
  };
}

/**
 * FPG risk group (B): Thai 35–59, no E10–E14 known before the first FPG
 * (CHRONIC has the DM history), with an NCD screening (NCDSCREEN) from
 * 1 Oct of the previous FY to :dataAsOf showing a risk: DM in a
 * first-degree relative (dmfamily 1), BMI >= 25, waist >= 90 cm (men) /
 * >= 80 cm (women) or BP >= 130/85 (first reading). HOSxP uses
 * dm_risk_count > 0 / BMI / BP of its own screening form.
 * Done = venous FPG in the FY: LABFU 0531002 with a result or NCDSCREEN
 * bstest 1 (venous, fasting) with a value. DTX (bstest 3/4) not counted.
 * FY2569: target 8,848 / done 1,699 (1,532 via LABFU, 167 NCDSCREEN only;
 * 2.9–3.8 s).
 */
const FPG_QUERY: DistrictPpfsQuery = {
  codes: ["FPG"],
  sql: catchmentSql("FPG", {
    rules: { maxAge: true, female: false, ...THAI },
    risk: {
      cte: `
risk AS (
  SELECT n.cid,
         MAX(n.dmfamily = '1'
             OR (n.height + 0 > 0 AND n.weight / POWER(n.height / 100, 2) >= 25)
             OR n.sbp_1 + 0 >= 130
             OR n.dbp_1 + 0 >= 85) AS any_risk,
         MAX(n.waist_cm + 0) AS max_waist
  FROM ncdscreen n
  WHERE n.date_serv >= :lookbackFrom
    AND n.date_serv <= :dataAsOf
  GROUP BY n.cid
)`,
      where:
        "rk.any_risk = 1 OR rk.max_waist >= CASE WHEN pop.sex = '2' THEN 80 ELSE 90 END",
    },
    prior: [],
    done: [
      labRows(LAB.FPG, IN_FY),
      `
    SELECT n.cid, n.date_serv AS dt, 'x' AS part
    FROM ncdscreen n
    WHERE n.date_serv >= :countFrom
      AND n.date_serv <= :dataAsOf
      AND n.bstest = '1'
      AND n.bslevel + 0 > 0`,
    ],
    known: [dxRule(DX.DM)],
  }),
  buildParams: (ctx) => ({
    ...baseParams(ctx),
    ...ageParams(ctx.periodStart, 35, 59),
    ...lookback(ctx, FPG_RISK_YEARS),
  }),
};

/**
 * CBC women (B): Thai women 13–24, not pregnant during the FY (no ANC
 * visit from :ancFrom = 301 days before 1 Oct to :dataAsOf, no LABOR in
 * the FY, no PRENATAL with LMP in that window — any unit). Done = Hb or
 * CBC (LAB.CBC) with a result in the FY. Hct alone is not counted (only
 * 2 target women have Hct without Hb). FY2569: target 2,300 / done 258
 * (1.2–1.4 s).
 */
const CBC_WOMEN_QUERY: DistrictPpfsQuery = {
  codes: ["CBC_WOMEN"],
  sql: catchmentSql("CBC_WOMEN", {
    rules: { maxAge: true, female: true, ...THAI },
    prior: [
      `
    SELECT a.cid FROM anc a
    WHERE a.date_serv >= :ancFrom AND a.date_serv <= :dataAsOf`,
      `
    SELECT lb.cid FROM labor lb
    WHERE lb.bdate >= :periodStart AND lb.bdate <= :dataAsOf`,
      `
    SELECT pn.cid FROM prenatal pn
    WHERE pn.lmp >= :ancFrom AND pn.lmp <= :dataAsOf`,
    ],
    done: [labRows(LAB.CBC, IN_FY)],
    known: [],
  }),
  buildParams: (ctx) => ({
    ...baseParams(ctx),
    ...ageParams(ctx.periodStart, 13, 24),
    ancFrom: ancFrom(ctx),
  }),
};

function ancFrom(ctx: HdcScreeningSqlContext): string {
  const d = new Date(`${ctx.periodStart}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - PREGNANCY_MAX_DAYS);
  return hdcDateParam(d.toISOString().slice(0, 10));
}

const D = (param: string) => `STR_TO_DATE(${param}, '%Y%m%d')`;
const IN_FY_DATE = (expr: string) =>
  `(${expr} BETWEEN ${D(":periodStart")} AND ${D(":dataAsOf")})`;

/**
 * ANC visit + lab set 1 (B) for pregnancies of resident Thai women with at
 * least one ANC visit (any unit) in the FY; attributed to the woman's
 * home village. HDC has no reliable pregnancy key (GRAVIDA differs between
 * units for the same pregnancy) and PRENATAL.LMP is sent by few units, so:
 *  - every ANC visit with a GA (weeks, 1–45) gives an estimated LMP
 *    (date_serv − GA weeks); visits from :ancFrom (1 Oct − 301 days) are
 *    used so the LMP is known for pregnancies that started before 1 Oct
 *  - one woman's distinct estimates, sorted, are split into pregnancies
 *    where two consecutive estimates are > 120 days apart (de-duplicated
 *    first: ties would make the split non-deterministic); LMP = average
 *    of the pregnancy's estimates
 *  - each visit (also visits without GA) belongs to the latest pregnancy
 *    with LMP <= visit <= LMP + 301 days; visits matching none are dropped
 *  - one visit per day (two units on the same day = one visit)
 * ANC_VISIT: target = schedule points (GA 12, 20, 26, 30, 34, 36, 38, 40
 *   weeks from LMP) in the FY; done = visit days in the FY, max 8 per
 *   pregnancy (= HOSxP; visits 9+ are not reported here).
 * ANC_LAB1: target = pregnancies with LMP + 84 days >= 1 Oct and LMP <=
 *   :dataAsOf; done = a VDRL / TPHA / HIV result (LABFU) in the FY within
 *   the pregnancy (proxy of lab set 1; HOSxP uses the 'LAB ANC' form).
 * Only women living in the district count (contract: home village);
 * FY2569: 203 pregnancies of 200 women; another 193 women with ANC at a
 * district unit (144 at 11252) live outside it and are not counted.
 * ANC data thins out in Aug–Sep 2026 (units' send lag).
 * FY2569: ANC_VISIT target 1,104 / done 999, ANC_LAB1 134 / 102 (≈0.8 s).
 * -> rows { vid, hospcode, code, target, done } for both codes.
 */
const ANC_QUERY: DistrictPpfsQuery = {
  codes: ["ANC_VISIT", "ANC_LAB1"],
  sql: `${RESIDENTS_CTE},
mother AS (
  SELECT r.cid, r.vid, r.hospcode
  FROM residents r
  WHERE r.sex = '2' AND r.nation = '099'
),
av AS (
  SELECT DISTINCT a.cid, ${D("a.date_serv")} AS visit_date,
         CASE WHEN a.ga REGEXP '^[0-9]{1,2}$' AND a.ga + 0 BETWEEN 1 AND 45
              THEN DATE_SUB(${D("a.date_serv")}, INTERVAL (a.ga + 0) * 7 DAY)
         END AS elmp
  FROM anc a
  JOIN mother m ON m.cid = a.cid
  WHERE a.date_serv >= :ancFrom
    AND a.date_serv <= :dataAsOf
),
est AS (
  SELECT e.cid, e.elmp,
         LAG(e.elmp) OVER (PARTITION BY e.cid ORDER BY e.elmp) AS prev_elmp
  FROM (SELECT DISTINCT av.cid, av.elmp FROM av WHERE av.elmp IS NOT NULL) e
),
isl AS (
  SELECT est.cid, est.elmp,
         SUM(CASE WHEN est.prev_elmp IS NULL
                    OR DATEDIFF(est.elmp, est.prev_elmp) > ${PREGNANCY_SPLIT_DAYS}
                  THEN 1 ELSE 0 END)
           OVER (PARTITION BY est.cid ORDER BY est.elmp
                 ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS preg_no
  FROM est
),
preg AS (
  SELECT isl.cid, isl.preg_no,
         FROM_DAYS(ROUND(AVG(TO_DAYS(isl.elmp)))) AS lmp
  FROM isl
  GROUP BY isl.cid, isl.preg_no
),
vp AS (
  SELECT av.cid, av.visit_date, p.preg_no,
         ROW_NUMBER() OVER (PARTITION BY av.cid, av.visit_date
                            ORDER BY p.lmp DESC) AS rn
  FROM av
  JOIN preg p
    ON p.cid = av.cid
   AND av.visit_date BETWEEN p.lmp AND DATE_ADD(p.lmp, INTERVAL ${PREGNANCY_MAX_DAYS} DAY)
),
fyv AS (
  SELECT vp.cid, vp.preg_no, COUNT(*) AS visits
  FROM vp
  WHERE vp.rn = 1
    AND ${IN_FY_DATE("vp.visit_date")}
  GROUP BY vp.cid, vp.preg_no
),
lab AS (
  SELECT l.cid, ${D("l.date_serv")} AS lab_date
  FROM labfu l
  JOIN mother m ON m.cid = l.cid
  WHERE l.labtest IN (${sqlCodeList(LAB.ANC_LAB1)})
    AND l.date_serv >= :countFrom
    AND l.date_serv <= :dataAsOf
    AND COALESCE(l.labresult, '') <> ''
),
pv AS (
  SELECT m.vid, m.hospcode,
         ${ANC_SCHEDULE_DAYS.map((d) => IN_FY_DATE(`DATE_ADD(p.lmp, INTERVAL ${d} DAY)`)).join("\n         + ")} AS exp_visits,
         LEAST(f.visits, ${ANC_MAX_VISITS}) AS done_visits,
         (DATE_ADD(p.lmp, INTERVAL ${ANC_LAB1_DUE_DAYS} DAY) >= ${D(":periodStart")}
          AND p.lmp <= ${D(":dataAsOf")}) AS exp_lab1,
         EXISTS (
           SELECT 1 FROM lab
           WHERE lab.cid = p.cid
             AND lab.lab_date BETWEEN p.lmp
                 AND DATE_ADD(p.lmp, INTERVAL ${PREGNANCY_MAX_DAYS} DAY)
         ) AS has_lab1
  FROM fyv f
  JOIN preg p ON p.cid = f.cid AND p.preg_no = f.preg_no
  JOIN mother m ON m.cid = f.cid
)
SELECT pv.vid AS vid,
       ${UNIT_CODE("pv.hospcode")} AS hospcode,
       c.code AS code,
       SUM(CASE WHEN c.code = 'ANC_VISIT' THEN pv.exp_visits ELSE pv.exp_lab1 END) AS target,
       SUM(CASE WHEN c.code = 'ANC_VISIT' THEN pv.done_visits
                ELSE pv.exp_lab1 AND pv.has_lab1 END) AS done
FROM pv
CROSS JOIN (SELECT 'ANC_VISIT' AS code UNION ALL SELECT 'ANC_LAB1') c
GROUP BY 1, 2, 3
`,
  buildParams: (ctx) => ({
    periodStart: hdcDateParam(ctx.periodStart),
    countFrom: hdcDateParam(ctx.countFrom),
    dataAsOf: hdcDateParam(ctx.dataAsOf),
    ancFrom: ancFrom(ctx),
  }),
};

/** Every PPFS query of the district page (run in parallel by the loader). */
export const DISTRICT_PPFS_QUERIES: readonly DistrictPpfsQuery[] = [
  FIT_QUERY,
  CX_QUERY,
  TC_HDL_QUERY,
  hepQuery("HBSAG", DX.HBV, LAB.HBSAG, PP.HBV),
  hepQuery("ANTI_HCV", DX.HCV, LAB.HCV, PP.HCV),
  FPG_QUERY,
  CBC_WOMEN_QUERY,
  ANC_QUERY,
];
