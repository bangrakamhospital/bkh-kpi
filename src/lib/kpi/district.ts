import "server-only";

import { cacheLife, cacheTag, io } from "next/cache";

import {
  DISTRICT_CODE,
  DISTRICT_NAME,
  DISTRICT_TAMBONS,
  type TambonDef,
} from "@/lib/kpi/district-areas";
import {
  resolveDataSourceKind,
  resolveScreeningPeriod,
  SCREENING_CACHE_TAG,
  toPercent,
} from "@/lib/kpi/screening";
import {
  apportionTargetShare,
  CKD5_INDICATOR,
  reductionPercentOf,
  SCREENING_INDICATORS,
  screeningCountWindow,
  screeningTargetPercent,
} from "@/lib/kpi/screening-indicators";
import type {
  AreaCounts,
  DistrictCkd5Result,
  DistrictKpiCode,
  DistrictKpiResult,
  DistrictStemiResult,
  DistrictUnitStatus,
  DistrictCode,
  DistrictScreeningResult,
  DistrictTambonRow,
  DistrictVillageRow,
} from "@/lib/kpi/types";
import {
  HDC_DATA_START_ISO,
  maxIsoDate,
} from "@/lib/kpi/sql/hdc-common";
import {
  hisHdcCkd5Source,
  hisHdcDistrictSource,
  hisHdcStemiSource,
  mockHdcCkd5Source,
  mockHdcDistrictSource,
  mockHdcStemiSource,
  type HdcCkd5Raw,
  type HdcDistrictRaw,
  type HdcStemiRaw,
  type HdcUnitFreshnessRaw,
} from "./sources/district-hdc";
import { previousYearComparable } from "./sql/hdc-ckd5";

/**
 * District KPI (อ.บางระกำ): อำเภอ -> ตำบล -> หมู่ for DISTRICT_CODES
 * (DM / HT screening, RLU 11.3–11.5).
 *
 * Source: the district HDC database ONLY, for all 11 sub-districts
 * (650401 included, via the hospital's 43-file export). The hospital page
 * keeps HOSxP; numbers of the two pages may differ (decided by the user).
 * District total = sum of the raw eligible / A / B of the sub-districts,
 * percent computed once from the sums (`toPercent`, as the headline).
 *
 * Aggregates only — no person data. Cached ("use cache", hours, tags
 * SCREENING_CACHE_TAG + DISTRICT_CACHE_TAG). Errors propagate (not cached).
 */

export const DISTRICT_CACHE_TAG = "kpi:district";

export {
  DISTRICT_CODES,
  DISTRICT_KPI_CODES,
  isDistrictCode,
  isDistrictKpiCode,
} from "@/lib/kpi/district-areas";

const HDC_NOTE =
  "ข้อมูลจากฐาน HDC (43 แฟ้ม) ล่าช้าตามการส่งของแต่ละหน่วยบริการ ตัวเลขอาจไม่ตรงกับแท็บตัวชี้วัดในโรงพยาบาล";

/** Indicator-specific district remarks (appended to HDC_NOTE). */
const DISTRICT_NOTES: Partial<Record<DistrictCode, string>> = {
  CX: "นับสะสมตั้งแต่ปีงบ 2569 เท่านั้น ไม่รวมปีงบ 2568 (HDC ไม่มีข้อมูล) ตัวเลขต่ำกว่าความจริง / B = 70% ของหญิงไทย 30–60 ปี / รหัส SPECIALPP 1B0040–1B0049, 1B30, 1B40",
  BR: "รหัส SPECIALPP 1B0030–1B0039 / ไม่รวมผู้ที่เคยวินิจฉัย C50 / หน่วยที่ไม่ส่งข้อมูลจะได้ร้อยละต่ำ",
  DMC: "B = กลุ่มสงสัยป่วยจากคัดกรอง (น้ำตาลขณะอดอาหาร ≥ 126) 1 ต.ค.–30 มิ.ย. / A = ตรวจ FPG (LABFU 0531002) หลังวันคัดกรอง ถึง 30 ก.ย. ที่หน่วยใดก็ได้",
  HTC: "B = กลุ่มสงสัยป่วยจากคัดกรอง (ค่าเฉลี่ย 140–179 / 90–109) 1 ต.ค.–30 มิ.ย. / A = วัดความดันที่หน่วยบริการ (SERVICE) หลังวันคัดกรอง ถึง 30 ก.ย. ไม่รวม HBPM",
};

function isRlu(code: DistrictCode): boolean {
  return code.startsWith("RLU_");
}

/** District wording (the hospital page keeps its own meta). */
function districtDescription(code: DistrictCode): {
  population: string;
  note: string;
} {
  const meta = SCREENING_INDICATORS[code];
  if (isRlu(code)) {
    return {
      population: "ผู้ป่วยเบาหวานที่อาศัยในอำเภอ (ทะเบียน 1, 3)",
      note: `${HDC_NOTE} / ผู้ป่วยเบาหวานจากแฟ้ม CHRONIC ที่ยังรักษาอยู่ (รพ.บางระกำ ส่งสถานะส่วนใหญ่เป็น "หาย" จึงนับสถานะนี้ของ รพ. เป็นยังรักษาอยู่) นับผลตรวจจากแฟ้ม LABFU ของทุกหน่วยบริการ`,
    };
  }
  const extra = DISTRICT_NOTES[code];
  return {
    population: `${meta.population} ${meta.ageRange} ที่อาศัยในอำเภอ (ทะเบียน 1, 3)`,
    note: extra ? `${HDC_NOTE} / ${extra}` : HDC_NOTE,
  };
}

/**
 * Counting window on HDC: the indicator's window, but never before the
 * first HDC data day (CX phase start is earlier -> cumulative since FY 2569).
 */
export function hdcCountFrom(code: DistrictCode, fy: number): string {
  return maxIsoDate(screeningCountWindow(code, fy).countFrom, HDC_DATA_START_ISO);
}

function counts(
  eligible: number,
  denominator: number,
  numerator: number,
): AreaCounts {
  return {
    eligible,
    denominator,
    numerator,
    percent: toPercent(numerator, denominator),
  };
}

function sumCounts(rows: readonly AreaCounts[]): AreaCounts {
  const eligible = rows.reduce((s, r) => s + r.eligible, 0);
  const denominator = rows.reduce((s, r) => s + r.denominator, 0);
  const numerator = rows.reduce((s, r) => s + r.numerator, 0);
  return {
    eligible,
    denominator,
    numerator,
    percent: toPercent(numerator, denominator),
  };
}

function mooNumber(moo: string): number {
  const n = Number.parseInt(moo, 10);
  return Number.isFinite(n) ? n : Number.MAX_SAFE_INTEGER;
}

function byMoo(a: DistrictVillageRow, b: DistrictVillageRow): number {
  return mooNumber(a.moo) - mooNumber(b.moo) || a.key.localeCompare(b.key);
}

/** Cached HDC raw counts (aggregates only, safe to share). */
async function loadHdcRaw(
  code: DistrictCode,
  fiscalYear: number,
): Promise<HdcDistrictRaw> {
  "use cache";
  cacheLife("hours");
  cacheTag(SCREENING_CACHE_TAG, DISTRICT_CACHE_TAG);
  const period = resolveScreeningPeriod(fiscalYear, new Date());
  const source =
    resolveDataSourceKind() === "mock"
      ? mockHdcDistrictSource
      : hisHdcDistrictSource;
  return source(code, {
    periodStart: period.range.start,
    countFrom: hdcCountFrom(code, period.fy),
    dataAsOf: period.dataAsOf,
  });
}

/**
 * Village rows of the whole district. B = eligible × target share (CX
 * 0.7), apportioned over ALL villages by largest remainder so that village
 * B values add up exactly to round(share × district eligible).
 */
function villageRows(raw: HdcDistrictRaw, factor: number): DistrictVillageRow[] {
  const denominators = apportionTargetShare(
    raw.villages.map((v) => v.eligible),
    factor,
  );
  return raw.villages.map(
    (v, i): DistrictVillageRow => ({
      key: v.vid,
      moo: String(Number(v.vid.slice(6, 8))),
      villageName: null,
      ...counts(v.eligible, denominators[i], v.numerator),
    }),
  );
}

function tambonRow(
  t: TambonDef,
  allVillages: readonly DistrictVillageRow[],
  raw: HdcDistrictRaw,
): DistrictTambonRow {
  const villages = allVillages
    .filter((v) => v.key.startsWith(t.code))
    .sort(byMoo);
  return {
    tambonCode: t.code,
    tambonName: t.name,
    ...sumCounts(villages),
    ...unitStatus(t, raw.units),
    villages,
  };
}

/**
 * Freshness of the sub-district's units; dataAsOf = OLDEST latest SERVICE
 * date among them (null when none sent data).
 */
function unitStatus(
  t: TambonDef,
  rawUnits: readonly HdcUnitFreshnessRaw[],
): { units: DistrictUnitStatus[]; dataAsOf: string | null } {
  const units = t.units.map((u) => {
    const f = rawUnits.find((x) => x.hospcode === u.hospcode);
    return {
      ...u,
      lastServiceDate: f?.lastServiceDate ?? null,
      lastScreenDate: f?.lastScreenDate ?? null,
    };
  });
  const sent = units
    .map((u) => u.lastServiceDate)
    .filter((d): d is string => d !== null)
    .sort();
  return { units, dataAsOf: sent[0] ?? null };
}

/**
 * District breakdown of one indicator for a fiscal year (BE).
 * Must be called at request time (route handler / inside <Suspense>).
 * @throws RangeError for an out-of-range fiscal year.
 * @throws HisConfigError / HisQueryError when HDC cannot be queried.
 */
export async function getDistrictScreening(
  code: DistrictCode,
  fiscalYear: number,
): Promise<DistrictScreeningResult> {
  await io();
  const now = new Date();
  const period = resolveScreeningPeriod(fiscalYear, now);
  const meta = SCREENING_INDICATORS[code];
  const raw = await loadHdcRaw(code, period.fy);

  const villages = villageRows(raw, meta.denominatorFactor);
  const tambons = DISTRICT_TAMBONS.map((t) => tambonRow(t, villages, raw));

  return {
    kind: "ratio",
    code,
    name: meta.name,
    shortName: meta.shortName,
    ...districtDescription(code),
    targetPercent: screeningTargetPercent(code, period.fy),
    targetOperator: meta.targetOperator ?? ">=",
    fiscalYear: period.fy,
    periodStart: period.range.start,
    periodEnd: period.range.end,
    dataAsOf: period.dataAsOf,
    updatedAt: now.toISOString(),
    district: {
      code: DISTRICT_CODE,
      name: DISTRICT_NAME,
      ...sumCounts(tambons),
      complete: true,
    },
    tambons,
  };
}

/* --------------------------------- CKD5 ---------------------------------- */

const CKD5_NOTE =
  "รายใหม่ = วินิจฉัย N18.5 ครั้งแรก (แฟ้ม CHRONIC / DIAGNOSIS_OPD / DIAGNOSIS_IPD ทุกหน่วย) ของประชากรในอำเภอ (รวมผู้ที่เสียชีวิตแล้ว) ต่างจากแท็บโรงพยาบาลที่ใช้ผล eGFR / HDC มีแฟ้มวินิจฉัยตั้งแต่ ต.ค. 2568 จึงไม่มีข้อมูลปีงบ 2568 และรายใหม่ปีงบ 2569 อาจรวมผู้ป่วยเก่าที่เพิ่งถูกบันทึก";

async function loadCkd5Raw(fiscalYear: number): Promise<HdcCkd5Raw> {
  "use cache";
  cacheLife("hours");
  cacheTag(SCREENING_CACHE_TAG, DISTRICT_CACHE_TAG);
  const period = resolveScreeningPeriod(fiscalYear, new Date());
  const ctx = { periodStart: period.range.start, dataAsOf: period.dataAsOf };
  return resolveDataSourceKind() === "mock"
    ? mockHdcCkd5Source(ctx)
    : hisHdcCkd5Source(ctx);
}

/**
 * KPI 10 per sub-district. When the previous FY is not comparable
 * (FY 2569) previous counts are forced to 0 and reductionPercent is null.
 */
export async function getDistrictCkd5(
  fiscalYear: number,
): Promise<DistrictCkd5Result> {
  await io();
  const now = new Date();
  const period = resolveScreeningPeriod(fiscalYear, now);
  const raw = await loadCkd5Raw(period.fy);
  const comparable = previousYearComparable(period.range.start);
  const prev = (n: number) => (comparable ? n : 0);

  const tambons = DISTRICT_TAMBONS.map((t) => {
    const vs = raw.villages
      .filter((v) => v.vid.startsWith(t.code))
      .map((v) => ({
        key: v.vid,
        moo: String(Number(v.vid.slice(6, 8))),
        currentCases: v.currentCases,
        previousCases: prev(v.previousCases),
        previousSamePeriod: prev(v.previousSamePeriod),
      }))
      .filter((v) => v.currentCases > 0 || v.previousCases > 0)
      .sort((a, b) => Number(a.moo) - Number(b.moo));
    return {
      tambonCode: t.code,
      tambonName: t.name,
      currentCases: vs.reduce((n, v) => n + v.currentCases, 0),
      previousCases: vs.reduce((n, v) => n + v.previousCases, 0),
      previousSamePeriod: vs.reduce((n, v) => n + v.previousSamePeriod, 0),
      ...unitStatus(t, raw.units),
      villages: vs.map(({ key, moo, currentCases, previousCases }) => ({
        key,
        moo,
        currentCases,
        previousCases,
      })),
    };
  });
  const currentCases = tambons.reduce((n, t) => n + t.currentCases, 0);
  const previousCases = tambons.reduce((n, t) => n + t.previousCases, 0);

  return {
    kind: "reduction",
    code: "CKD5",
    name: CKD5_INDICATOR.name,
    shortName: CKD5_INDICATOR.shortName,
    population: "ประชากรในอำเภอ (ทะเบียน 1, 3)",
    note: `${HDC_NOTE} / ${CKD5_NOTE}`,
    targetPercent: CKD5_INDICATOR.targetPercent,
    targetOperator: CKD5_INDICATOR.targetOperator,
    fiscalYear: period.fy,
    periodStart: period.range.start,
    periodEnd: period.range.end,
    dataAsOf: period.dataAsOf,
    updatedAt: now.toISOString(),
    previousYearComparable: comparable,
    district: {
      code: DISTRICT_CODE,
      name: DISTRICT_NAME,
      currentCases,
      previousCases,
      previousSamePeriod: tambons.reduce((n, t) => n + t.previousSamePeriod, 0),
      reductionPercent: comparable
        ? reductionPercentOf(currentCases, previousCases)
        : null,
    },
    tambons,
  };
}

/* --------------------------------- STEMI --------------------------------- */

async function loadStemiRaw(fiscalYear: number): Promise<HdcStemiRaw> {
  "use cache";
  cacheLife("hours");
  cacheTag(SCREENING_CACHE_TAG, DISTRICT_CACHE_TAG);
  const period = resolveScreeningPeriod(fiscalYear, new Date());
  return resolveDataSourceKind() === "mock"
    ? mockHdcStemiSource()
    : hisHdcStemiSource({
        periodStart: period.range.start,
        dataAsOf: period.dataAsOf,
      });
}

/**
 * KPI 11 district total only. Callers MUST check the session first
 * (route: requireSession) — small numbers can identify a patient.
 */
export async function getDistrictStemi(
  fiscalYear: number,
): Promise<DistrictStemiResult> {
  await io();
  const now = new Date();
  const period = resolveScreeningPeriod(fiscalYear, now);
  const meta = SCREENING_INDICATORS.STEMI;
  const raw = await loadStemiRaw(period.fy);
  return {
    kind: "mortality",
    code: "STEMI",
    name: meta.name,
    shortName: meta.shortName,
    population: "ผู้ป่วย STEMI ที่มารับบริการที่หน่วยบริการในอำเภอ (ระดับอำเภอ)",
    note: `${HDC_NOTE} / B = จำนวนครั้งการเจ็บป่วย STEMI (I21.0–I21.3) ที่รับไว้ ส่งต่อ เสียชีวิต มาโดย EMS หรือรับส่งต่อ / A = เสียชีวิตที่หน่วยบริการในอำเภอภายใน 28 วัน ไม่รวมเสียชีวิตหลังส่งต่อ / แสดงเฉพาะยอดรวมอำเภอ`,
    targetPercent: screeningTargetPercent("STEMI", period.fy),
    targetOperator: meta.targetOperator ?? "<",
    fiscalYear: period.fy,
    periodStart: period.range.start,
    periodEnd: period.range.end,
    dataAsOf: period.dataAsOf,
    updatedAt: now.toISOString(),
    district: {
      code: DISTRICT_CODE,
      name: DISTRICT_NAME,
      episodes: raw.episodes,
      deaths: raw.deaths,
      percent: toPercent(raw.deaths, raw.episodes),
    },
  };
}

/**
 * Dispatcher for the district API / page. STEMI requires a session check
 * by the caller BEFORE calling this.
 */
export async function getDistrictKpi(
  code: DistrictKpiCode,
  fiscalYear: number,
): Promise<DistrictKpiResult> {
  if (code === "CKD5") return getDistrictCkd5(fiscalYear);
  if (code === "STEMI") return getDistrictStemi(fiscalYear);
  return getDistrictScreening(code, fiscalYear);
}
