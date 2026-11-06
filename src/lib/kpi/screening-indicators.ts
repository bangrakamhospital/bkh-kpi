/**
 * Screening indicator definitions (KPI 1–9; 5–9 = HDC 2.1/2.2, 11.3–11.5): display metadata, target
 * group, counting period and target. Pure data / functions, no I/O —
 * safe for server and client (UI may import labels from here).
 *
 * Definitions: docs/kpi/01-screening-dm-ht.md, 03-screening-cervical.md,
 * 04-screening-breast.md. SQL lives in `@/lib/kpi/sql/*` (server-only).
 */

import { BE_OFFSET } from "@/lib/kpi/fiscal-year";
import type {
  RatioCode,
  ReductionCode,
  ScreeningCode,
  TargetOperator,
} from "@/lib/kpi/types";

/** Display / processing order of the indicators. */
export const SCREENING_CODES = [
  "DM",
  "HT",
  "CX",
  "BR",
  "DMC",
  "HTC",
  "RLU_HBA1C",
  "RLU_LDL",
  "RLU_CR",
] as const satisfies readonly RatioCode[];

/** Reduction-kind indicators (lower is better), processed separately. */
export const REDUCTION_CODES = [
  "CKD5",
] as const satisfies readonly ReductionCode[];

/** The 9 A/B-of-population indicators. */
export function isRatioCode(value: unknown): value is RatioCode {
  return (
    typeof value === "string" &&
    (SCREENING_CODES as readonly string[]).includes(value)
  );
}

export function isReductionCode(value: unknown): value is ReductionCode {
  return (
    typeof value === "string" &&
    (REDUCTION_CODES as readonly string[]).includes(value)
  );
}

/** Any indicator code of the dashboard (ratio or reduction). */
export function isScreeningCode(value: unknown): value is ScreeningCode {
  return isRatioCode(value) || isReductionCode(value);
}

/**
 * KPI 10 CKD5 — new CKD stage 5 patients vs the previous fiscal year.
 * KPI Template 2569 no. 20; docs/kpi/ckd-stage5.md. Target > 10% in
 * FY2569 and FY2570.
 */
export const CKD5_INDICATOR = {
  code: "CKD5",
  no: 10,
  name: "ร้อยละผู้ป่วยไตเรื้อรัง stage 5 รายใหม่ ที่ลดลงจากปีงบประมาณก่อนหน้า",
  shortName: "ผู้ป่วยไตเรื้อรัง stage 5 รายใหม่ ลดลงจากปีก่อน",
  targetPercent: 10,
  targetOperator: ">",
  population: "ผู้ป่วยที่มารับบริการที่ รพ. (ระดับโรงพยาบาล)",
  note: "ตีความจาก KPI Template 2569 ข้อ 20 / นับจากผล eGFR ใน HOSxP",
  /** Name of village id 0 in the village dialog / Excel. */
  unknownVillageName: "นอกเขต/ไม่ระบุหมู่บ้าน",
} as const satisfies {
  code: ReductionCode;
  no: number;
  name: string;
  shortName: string;
  targetPercent: number;
  targetOperator: TargetOperator;
  population: string;
  note: string;
  unknownVillageName: string;
};

/** Reduction percent ((B - A) / B x 100, 2 decimals); null when B is 0. */
export function reductionPercentOf(
  currentCases: number,
  previousCases: number,
): number | null {
  if (previousCases <= 0) return null;
  return (
    Math.round(((previousCases - currentCases) / previousCases) * 10000) / 100
  );
}

/* ------------------------- KPI 3 (CX) constants -------------------------- */

/**
 * Service Plan สาขาโรคมะเร็ง 2568 ตัวชี้วัด 3.1: the 5-year target (C1) is
 * 70% of women aged 30–60. B = round(share × eligible). Change here only.
 */
export const CERVICAL_TARGET_POPULATION_SHARE = 0.7;

/** Cervical screening is cumulative over a 5-year phase. */
export const CERVICAL_PHASE_LENGTH_YEARS = 5;

/**
 * First fiscal year (BE) of a known phase. Phases: 2563–2567, 2568–2572,
 * 2573–2577, ... (earlier years are extrapolated backwards: 2558–2562).
 */
export const CERVICAL_PHASE_ANCHOR_FISCAL_YEAR = 2563;

/* ----------------------------- definitions ------------------------------- */

export type ScreeningPeriodRule =
  /** A counted from 1 Oct of the selected fiscal year. */
  | { kind: "fiscalYear" }
  /** A counted from 1 Oct of the first fiscal year of the phase. */
  | { kind: "phase"; lengthYears: number; anchorFiscalYear: number };

export interface ScreeningIndicatorMeta {
  code: RatioCode;
  /** KPI number on the dashboard (1–9, one sequential list). */
  no: number;
  /** Full Thai name. */
  name: string;
  /** Short Thai title for tables / cards. */
  shortName: string;
  /** Target in percent; used when targetPercentByFiscalYear has no entry. */
  targetPercent: number;
  /** ">=" (default) or ">" (strictly above the target). */
  targetOperator?: TargetOperator;
  /**
   * Per-fiscal-year (BE) targets. A year without an entry uses the latest
   * earlier entry, else targetPercent (see screeningTargetPercent).
   */
  targetPercentByFiscalYear?: Record<number, number>;
  /**
   * Fiscal year (BE) whose official document sets targetPercent, or null
   * when the target has no fiscal-year-specific source (DM/HT). When it
   * differs from the selected fiscal year, a "รอยืนยัน" note is shown.
   */
  targetSourceFiscalYear: number | null;
  /** Short reference for the target, shown in notes. */
  targetSource: string | null;
  population: string;
  /** Target sex filter. */
  sex: "all" | "female";
  /** Thai nationality only (person.nationality = '99'). */
  thaiOnly: boolean;
  /** Minimum age (inclusive) on 1 Oct of the fiscal year. */
  minAge: number;
  /** Maximum age (inclusive) on 1 Oct of the fiscal year; null = no upper bound. */
  maxAge: number | null;
  ageRange: string;
  /** B = round(eligible × denominatorFactor). */
  denominatorFactor: number;
  period: ScreeningPeriodRule;
  /** Status labels for the person list / Excel. */
  statusLabels: ScreeningStatusLabels;
  /** Extra remark appended to the indicator note. */
  note?: string;
  /** Name of village id 0 when it differs from "ไม่ระบุหมู่บ้าน". */
  unknownVillageName?: string;
}

export interface ScreeningStatusLabels {
  screened: string;
  notScreened: string;
  /** Summary cards / Excel A; default "คัดกรองแล้ว" / "ยังไม่คัดกรอง". */
  summary?: { done: string; pending: string };
  /** Header of the person-list date column; default "วันที่คัดกรอง". */
  dateHeader?: string;
  /** Name of the B group; default "กลุ่มเป้าหมาย". */
  targetHeader?: string;
}

/** Target (percent) of `code` in the fiscal year `fiscalYear` (BE). */
export function screeningTargetPercent(
  code: RatioCode,
  fiscalYear: number,
): number {
  const meta = SCREENING_INDICATORS[code];
  const byYear = meta.targetPercentByFiscalYear;
  if (!byYear) return meta.targetPercent;
  const years = Object.keys(byYear)
    .map(Number)
    .filter((y) => y <= fiscalYear)
    .sort((a, b) => b - a);
  return years.length > 0 ? byYear[years[0]] : meta.targetPercent;
}

/** true when `percent` meets the target under the operator (">=" or ">"). */
export function meetsTarget(
  percent: number,
  targetPercent: number,
  operator: TargetOperator,
): boolean {
  return operator === ">" ? percent > targetPercent : percent >= targetPercent;
}

/** Sign for display: "≥" or ">". */
export function targetOperatorSign(operator: TargetOperator): string {
  return operator === ">" ? ">" : "≥";
}

/**
 * HDC 11.3–11.5 (RLU): diabetes clinic patients with >= 1 lab result per
 * fiscal year. Hospital level, no age limit. Target > 70 (FY2569), > 80
 * (FY2570+). Definitions: docs/kpi/hdc-phase1-definitions.md section 11.3–11.5.
 */
function rluMeta(
  code: RatioCode,
  no: number,
  test: string,
  shortName: string,
): ScreeningIndicatorMeta {
  return {
    code,
    no,
    name: `ร้อยละผู้ป่วยโรคเบาหวาน ได้รับการตรวจ ${test} อย่างน้อยปีละ 1 ครั้ง`,
    shortName,
    targetPercent: 70,
    targetOperator: ">",
    targetPercentByFiscalYear: { 2569: 70, 2570: 80 },
    targetSourceFiscalYear: null,
    targetSource: null,
    population: "ผู้ป่วยในทะเบียนคลินิกเบาหวาน",
    sex: "all",
    thaiOnly: false,
    minAge: 0,
    maxAge: null,
    ageRange: "ไม่จำกัดอายุ",
    denominatorFactor: 1,
    period: { kind: "fiscalYear" },
    statusLabels: {
      screened: "ได้รับการตรวจแล้ว",
      notScreened: "ยังไม่ได้รับการตรวจ",
      summary: { done: "ได้รับการตรวจแล้ว", pending: "ยังไม่ได้รับการตรวจ" },
      dateHeader: "วันที่ตรวจครั้งแรก",
    },
    note: "ระดับโรงพยาบาล รวมผู้ป่วยนอกเขต / นับเฉพาะ lab ที่มีผลใน HOSxP ของ รพ.",
    unknownVillageName: "นอกเขตรับผิดชอบ / ไม่ระบุหมู่บ้าน",
  };
}

/**
 * HDC 2.1 / 2.2: confirmation of suspected DM / HT (Thai people >= 35).
 * B = suspected group, A = confirmed after the suspect screening.
 */
function confirmMeta(
  code: RatioCode,
  no: number,
  disease: string,
  targetPercent: number,
  note: string,
): ScreeningIndicatorMeta {
  return {
    code,
    no,
    name: `ร้อยละการตรวจติดตามยืนยันวินิจฉัยกลุ่มสงสัยป่วยโรค${disease}`,
    shortName: `ยืนยันวินิจฉัยกลุ่มสงสัยป่วย${disease}`,
    targetPercent,
    targetOperator: ">=",
    targetSourceFiscalYear: null,
    targetSource: null,
    population: "ประชาชนไทยอายุ 35 ปีขึ้นไป กลุ่มสงสัยป่วย",
    sex: "all",
    thaiOnly: true,
    minAge: 35,
    maxAge: null,
    ageRange: "35 ปีขึ้นไป",
    denominatorFactor: 1,
    period: { kind: "fiscalYear" },
    statusLabels: {
      screened: "ยืนยันแล้ว",
      notScreened: "ยังไม่ยืนยัน",
      summary: { done: "ได้รับการยืนยัน", pending: "ยังไม่ยืนยัน" },
      dateHeader: "วันที่ยืนยัน",
      targetHeader: "กลุ่มสงสัยป่วย",
    },
    note,
  };
}

export const SCREENING_INDICATORS: Record<RatioCode, ScreeningIndicatorMeta> =
  {
    DM: {
      code: "DM",
      no: 1,
      name: "ร้อยละของประชาชนอายุ 35 ปีขึ้นไปที่ได้รับการคัดกรองเบาหวาน",
      shortName: "คัดกรองเบาหวาน ประชาชนอายุ 35 ปีขึ้นไป",
      targetPercent: 90,
      targetSourceFiscalYear: null,
      targetSource: null,
      population: "ประชาชน",
      sex: "all",
      thaiOnly: false,
      minAge: 35,
      maxAge: null,
      ageRange: "35 ปีขึ้นไป",
      denominatorFactor: 1,
      period: { kind: "fiscalYear" },
      statusLabels: { screened: "คัดกรองแล้ว", notScreened: "ยังไม่คัดกรอง" },
    },
    HT: {
      code: "HT",
      no: 2,
      name: "ร้อยละของประชาชนอายุ 35 ปีขึ้นไปที่ได้รับการคัดกรองความดันโลหิตสูง",
      shortName: "คัดกรองความดันโลหิตสูง ประชาชนอายุ 35 ปีขึ้นไป",
      targetPercent: 90,
      targetSourceFiscalYear: null,
      targetSource: null,
      population: "ประชาชน",
      sex: "all",
      thaiOnly: false,
      minAge: 35,
      maxAge: null,
      ageRange: "35 ปีขึ้นไป",
      denominatorFactor: 1,
      period: { kind: "fiscalYear" },
      statusLabels: { screened: "คัดกรองแล้ว", notScreened: "ยังไม่คัดกรอง" },
    },
    CX: {
      code: "CX",
      no: 3,
      name: "ร้อยละของผู้ที่ได้รับการคัดกรองมะเร็งปากมดลูก (สะสม)",
      shortName: "คัดกรองมะเร็งปากมดลูก หญิงไทยอายุ 30–60 ปี (สะสม 5 ปี)",
      // TODO(kpi-cx): Service Plan 2568 = >= 25% (cumulative); แผนตรวจราชการ
      // 2567 = >= 60%. No official FY 2569/2570 target found yet — confirm.
      targetPercent: 25,
      targetSourceFiscalYear: 2568,
      targetSource: "Service Plan สาขาโรคมะเร็ง 2568",
      population: "หญิงไทย",
      sex: "female",
      thaiOnly: true,
      minAge: 30,
      maxAge: 60,
      ageRange: "30–60 ปี",
      denominatorFactor: CERVICAL_TARGET_POPULATION_SHARE,
      period: {
        kind: "phase",
        lengthYears: CERVICAL_PHASE_LENGTH_YEARS,
        anchorFiscalYear: CERVICAL_PHASE_ANCHOR_FISCAL_YEAR,
      },
      statusLabels: {
        screened: "คัดกรองแล้ว (ใน Phase นี้)",
        notScreened: "ยังไม่คัดกรองใน Phase นี้",
      },
    },
    BR: {
      code: "BR",
      no: 4,
      name: "ร้อยละของสตรีอายุ 40–70 ปีที่ได้รับการตรวจเต้านมโดยบุคลากรสาธารณสุข (CBE)",
      shortName: "คัดกรองมะเร็งเต้านม (CBE) หญิงอายุ 40–70 ปี",
      // TODO(kpi-br): Service Plan 2568 ตัวชี้วัด 2.2 = >= 80%. Confirm FY 2570.
      targetPercent: 80,
      targetSourceFiscalYear: 2568,
      targetSource: "Service Plan สาขาโรคมะเร็ง 2568",
      population: "หญิง",
      sex: "female",
      thaiOnly: false,
      minAge: 40,
      maxAge: 70,
      ageRange: "40–70 ปี",
      denominatorFactor: 1,
      period: { kind: "fiscalYear" },
      statusLabels: { screened: "ตรวจ CBE แล้ว", notScreened: "ยังไม่ได้ตรวจ CBE" },
    },
    DMC: confirmMeta(
      "DMC",
      5,
      "เบาหวาน",
      70,
      "B = คัดกรอง 1 ต.ค.–30 มิ.ย. ค่าน้ำตาลอดอาหาร ≥126; A = ตรวจ FPG ทางห้องปฏิบัติการหลังวันคัดกรอง",
    ),
    HTC: confirmMeta(
      "HTC",
      6,
      "ความดันโลหิตสูง",
      80,
      "นับเฉพาะการวัดซ้ำที่ รพ. (OBPM) ไม่รวมวัดที่บ้าน (HBPM) ผลอาจต่ำกว่า HDC",
    ),
    RLU_HBA1C: rluMeta("RLU_HBA1C", 7, "HbA1c", "ตรวจ HbA1c ผู้ป่วยเบาหวาน"),
    RLU_LDL: rluMeta("RLU_LDL", 8, "LDL", "ตรวจ LDL ผู้ป่วยเบาหวาน"),
    RLU_CR: rluMeta("RLU_CR", 9, "Creatinine", "ตรวจ Creatinine ผู้ป่วยเบาหวาน"),
  };

/* ------------------------------ periods ---------------------------------- */

/** First fiscal year (BE) of the phase containing `fiscalYear`. */
export function phaseFirstFiscalYear(
  fiscalYear: number,
  lengthYears: number,
  anchorFiscalYear: number,
): number {
  return (
    anchorFiscalYear +
    Math.floor((fiscalYear - anchorFiscalYear) / lengthYears) * lengthYears
  );
}

/** "YYYY-MM-DD" of 1 Oct that starts fiscal year `fiscalYear` (BE). */
function fiscalYearStart(fiscalYear: number): string {
  return `${fiscalYear - BE_OFFSET - 1}-10-01`;
}

export interface ScreeningCountWindow {
  /** First fiscal year (BE) included in A. */
  firstFiscalYear: number;
  /** Last fiscal year of the phase (= fiscalYear for fiscal-year indicators). */
  lastFiscalYear: number;
  /** "YYYY-MM-DD" first day A is counted from. */
  countFrom: string;
  periodLabel: string;
}

/** Counting window for A of `code` in the selected fiscal year. */
export function screeningCountWindow(
  code: RatioCode,
  fiscalYear: number,
): ScreeningCountWindow {
  const rule = SCREENING_INDICATORS[code].period;
  if (rule.kind === "fiscalYear") {
    return {
      firstFiscalYear: fiscalYear,
      lastFiscalYear: fiscalYear,
      countFrom: fiscalYearStart(fiscalYear),
      periodLabel: `ปีงบประมาณ ${fiscalYear}`,
    };
  }
  const first = phaseFirstFiscalYear(
    fiscalYear,
    rule.lengthYears,
    rule.anchorFiscalYear,
  );
  return {
    firstFiscalYear: first,
    lastFiscalYear: first + rule.lengthYears - 1,
    countFrom: fiscalYearStart(first),
    periodLabel:
      first === fiscalYear
        ? `สะสม ปีงบ ${fiscalYear}`
        : `สะสม ปีงบ ${first}–${fiscalYear}`,
  };
}

/** Display remarks for the indicator in the selected fiscal year. */
export function screeningIndicatorNote(
  code: RatioCode,
  fiscalYear: number,
): string | undefined {
  const meta = SCREENING_INDICATORS[code];
  const notes: string[] = [];
  if (meta.period.kind === "phase") {
    const w = screeningCountWindow(code, fiscalYear);
    notes.push(
      `Phase ${meta.period.lengthYears} ปี (ปีงบ ${w.firstFiscalYear}–${w.lastFiscalYear})`,
    );
  }
  if (meta.denominatorFactor !== 1) {
    const pct = Math.round(meta.denominatorFactor * 100);
    notes.push(
      `เป้าหมาย 5 ปี = ${pct}% ของ${meta.population} ${meta.ageRange}`,
    );
  }
  if (
    meta.targetSourceFiscalYear !== null &&
    meta.targetSourceFiscalYear !== fiscalYear
  ) {
    notes.push(
      `เกณฑ์ปี ${fiscalYear} รอยืนยัน (ใช้เกณฑ์ ${meta.targetSource ?? `ปี ${meta.targetSourceFiscalYear}`})`,
    );
  }
  if (meta.note) notes.push(meta.note);
  return notes.length > 0 ? notes.join(" · ") : undefined;
}

/* ------------------------- target share (CX B) --------------------------- */

const SHARE_SCALE = 10_000;

function shareUnits(share: number): number {
  return Math.round(share * SHARE_SCALE);
}

/**
 * round(eligible × share), half up, computed with integers so e.g.
 * 0.7 × 5 = 3.5 -> 4 is not affected by floating point error.
 */
export function applyTargetShare(eligible: number, share: number): number {
  if (share === 1) return eligible;
  return Math.round((eligible * shareUnits(share)) / SHARE_SCALE);
}

/**
 * Splits B = applyTargetShare(sum(eligibles), share) over the parts by
 * largest remainder. The result sums exactly to that B and each part is
 * floor or ceil of eligible_i × share (so never above eligible_i).
 */
export function apportionTargetShare(
  eligibles: readonly number[],
  share: number,
): number[] {
  if (share === 1) return [...eligibles];
  const units = shareUnits(share);
  const total = applyTargetShare(
    eligibles.reduce((a, b) => a + b, 0),
    share,
  );
  const parts = eligibles.map((e, i) => {
    const scaled = e * units;
    const floor = Math.floor(scaled / SHARE_SCALE);
    return { i, floor, rem: scaled - floor * SHARE_SCALE };
  });
  const result = parts.map((p) => p.floor);
  let remaining = total - result.reduce((a, b) => a + b, 0);
  const order = [...parts]
    .filter((p) => p.rem > 0)
    .sort((a, b) => b.rem - a.rem || a.i - b.i);
  for (const p of order) {
    if (remaining <= 0) break;
    result[p.i] += 1;
    remaining -= 1;
  }
  return result;
}
