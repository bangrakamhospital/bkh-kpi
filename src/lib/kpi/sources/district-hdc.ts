import "server-only";

import type { RowDataPacket } from "mysql2";

import { hdcQuery } from "@/lib/db/hdc";
import { DISTRICT_TAMBONS } from "@/lib/kpi/district-areas";
import {
  HDC_FRESHNESS_SQL,
  HDC_SCREENING_SQL,
  hdcDateParam,
  hdcDateToIso,
  type HdcScreeningSqlContext,
} from "@/lib/kpi/sql/hdc-screening";
import { HDC_CKD5_VILLAGE_SQL, hdcCkd5Params } from "@/lib/kpi/sql/hdc-ckd5";
import { HDC_STEMI_TOTALS_SQL, hdcStemiParams } from "@/lib/kpi/sql/hdc-stemi";
import {
  DSPM_AGE_MONTHS,
  HDC_DSPM_VILLAGE_SQL,
  hdcDspmParams,
  type HdcDspmContext,
} from "@/lib/kpi/sql/hdc-dspm";
import {
  HDC_CAVITY_FREE_VILLAGE_SQL,
  hdcCavityFreeParams,
  type HdcCavityFreeContext,
} from "@/lib/kpi/sql/hdc-cavity-free";
import type { DistrictCode } from "@/lib/kpi/types";
import { decryptHdc } from "@/lib/kpi/hdc-crypto";

/**
 * District HDC source (all 11 sub-districts 650401–650411). Returns raw counts
 * only; B / percent / sums are derived in `@/lib/kpi/district`.
 * Errors propagate (no silent mock fallback).
 */

export interface HdcVillageRaw {
  /** 8-digit village code, e.g. "65040203". */
  vid: string;
  eligible: number;
  numerator: number;
}

export interface HdcUnitFreshnessRaw {
  /** 5-digit hospcode ("GA00…" merged). */
  hospcode: string;
  /** "YYYY-MM-DD" or null. */
  lastServiceDate: string | null;
  lastScreenDate: string | null;
}

export interface HdcDistrictRaw {
  villages: HdcVillageRaw[];
  units: HdcUnitFreshnessRaw[];
}

export type HdcDistrictSource = (
  code: DistrictCode,
  ctx: HdcScreeningSqlContext,
) => Promise<HdcDistrictRaw>;

interface VillageRow extends RowDataPacket {
  vid: string | null;
  eligible: number | string;
  numerator: number | string;
}

interface FreshnessRow extends RowDataPacket {
  hospcode: string;
  kind: "service" | "ncdscreen";
  last_date: string | null;
}

function toUnits(rows: FreshnessRow[]): HdcUnitFreshnessRaw[] {
  const byUnit = new Map<string, HdcUnitFreshnessRaw>();
  for (const r of rows) {
    const u = byUnit.get(r.hospcode) ?? {
      hospcode: r.hospcode,
      lastServiceDate: null,
      lastScreenDate: null,
    };
    const iso = hdcDateToIso(r.last_date);
    if (r.kind === "service") u.lastServiceDate = iso;
    else u.lastScreenDate = iso;
    byUnit.set(r.hospcode, u);
  }
  return [...byUnit.values()];
}

export const hisHdcDistrictSource: HdcDistrictSource = async (code, ctx) => {
  const sql = HDC_SCREENING_SQL[code];
  const [villageRows, freshnessRows] = await Promise.all([
    hdcQuery<VillageRow>(sql.village, sql.buildParams(ctx)),
    hdcQuery<FreshnessRow>(HDC_FRESHNESS_SQL, {
      dataAsOf: hdcDateParam(ctx.dataAsOf),
    }),
  ]);
  return {
    villages: villageRows
      .filter((r): r is VillageRow & { vid: string } => !!r.vid)
      .map((r) => ({
        vid: r.vid,
        eligible: Number(r.eligible),
        numerator: Number(r.numerator),
      })),
    units: toUnits(freshnessRows),
  };
};

const MOCK_RATE: Record<DistrictCode, number> = {
  DM: 0.78,
  HT: 0.84,
  CX: 0.12,
  BR: 0.7,
  DMC: 0.68,
  HTC: 0.8,
  RLU_HBA1C: 0.74,
  RLU_LDL: 0.76,
  RLU_CR: 0.8,
  RLU_HBA1C_REPEAT: 0.18,
  RLU_LDL_REPEAT: 0.06,
  RLU_CHOL_REPEAT: 0.05,
  RLU_TG_REPEAT: 0.05,
};

const MOCK_SIZE: Record<DistrictCode, number> = {
  DM: 1,
  HT: 0.8,
  CX: 0.4,
  BR: 0.45,
  DMC: 0.02,
  HTC: 0.05,
  RLU_HBA1C: 0.2,
  RLU_LDL: 0.2,
  RLU_CR: 0.2,
  RLU_HBA1C_REPEAT: 0.15,
  RLU_LDL_REPEAT: 0.15,
  RLU_CHOL_REPEAT: 0.2,
  RLU_TG_REPEAT: 0.2,
};

/** Deterministic fake data for KPI_DATA_SOURCE=mock (UI work without DB). */
export const mockHdcDistrictSource: HdcDistrictSource = async (code, ctx) => {
  const villages: HdcVillageRaw[] = [];
  DISTRICT_TAMBONS.forEach((t, ti) => {
    for (let moo = 1; moo <= 8 + (ti % 4); moo++) {
      const base = 120 + ((ti * 37 + moo * 53) % 260);
      // Rough target-group sizes relative to the 35+ population.
      const eligible = Math.round(base * MOCK_SIZE[code]);
      const rate = MOCK_RATE[code] + ((moo + ti) % 5) / 50;
      villages.push({
        vid: `${t.code}${String(moo).padStart(2, "0")}`,
        eligible,
        numerator: Math.min(eligible, Math.round(eligible * rate)),
      });
    }
  });
  const units = [
    ...new Set(DISTRICT_TAMBONS.flatMap((t) => t.units.map((u) => u.hospcode))),
  ].map((hospcode, i) => ({
    hospcode,
    lastServiceDate:
      i % 3 === 0 ? `${ctx.dataAsOf.slice(0, 8)}01` : ctx.dataAsOf,
    lastScreenDate: null,
  }));
  return { villages, units };
};

/* ------------------------------ CKD5 / STEMI ------------------------------ */

export interface HdcCkd5VillageRaw {
  vid: string;
  currentCases: number;
  previousCases: number;
  previousSamePeriod: number;
}

export interface HdcCkd5Raw {
  villages: HdcCkd5VillageRaw[];
  units: HdcUnitFreshnessRaw[];
}

export interface HdcStemiRaw {
  episodes: number;
  deaths: number;
}

export interface HdcPeriodContext {
  /** ISO 1 Oct of the fiscal year. */
  periodStart: string;
  /** ISO inclusive cutoff. */
  dataAsOf: string;
}

interface Ckd5Row extends RowDataPacket {
  vid: string | null;
  current_cases: number | string | null;
  previous_cases: number | string | null;
  previous_same_period: number | string | null;
}

interface StemiRow extends RowDataPacket {
  episodes: number | string | null;
  deaths: number | string | null;
}

async function loadFreshness(dataAsOf: string): Promise<HdcUnitFreshnessRaw[]> {
  const rows = await hdcQuery<FreshnessRow>(HDC_FRESHNESS_SQL, {
    dataAsOf: hdcDateParam(dataAsOf),
  });
  return toUnits(rows);
}

export async function hisHdcCkd5Source(
  ctx: HdcPeriodContext,
): Promise<HdcCkd5Raw> {
  const [rows, units] = await Promise.all([
    hdcQuery<Ckd5Row>(HDC_CKD5_VILLAGE_SQL, hdcCkd5Params(ctx)),
    loadFreshness(ctx.dataAsOf),
  ]);
  return {
    villages: rows
      .filter((r): r is Ckd5Row & { vid: string } => !!r.vid)
      .map((r) => ({
        vid: r.vid,
        currentCases: Number(r.current_cases ?? 0),
        previousCases: Number(r.previous_cases ?? 0),
        previousSamePeriod: Number(r.previous_same_period ?? 0),
      })),
    units,
  };
}

export async function hisHdcStemiSource(
  ctx: HdcPeriodContext,
): Promise<HdcStemiRaw> {
  const rows = await hdcQuery<StemiRow>(
    HDC_STEMI_TOTALS_SQL,
    hdcStemiParams(ctx),
  );
  return {
    episodes: Number(rows[0]?.episodes ?? 0),
    deaths: Number(rows[0]?.deaths ?? 0),
  };
}

/* --------------------------------- DSPM ---------------------------------- */

/** Raw DSPM counts of one village × age group (see hdc-dspm.ts). */
export interface HdcDspmRowRaw {
  vid: string;
  ageMonths: number;
  target: number;
  screened: number;
  normalFirst: number;
  suspectWait: number;
  suspectRefer: number;
  followed: number;
  normalAfter: number;
  delayedAfter: number;
  waiting: number;
  lost: number;
}

export interface HdcDspmRaw {
  rows: HdcDspmRowRaw[];
  units: HdcUnitFreshnessRaw[];
}

interface DspmRow extends RowDataPacket {
  vid: string | null;
  age_months: number | string;
  target: number | string | null;
  screened: number | string | null;
  normal_first: number | string | null;
  suspect_wait: number | string | null;
  suspect_refer: number | string | null;
  followed: number | string | null;
  normal_after: number | string | null;
  delayed_after: number | string | null;
  waiting: number | string | null;
  lost: number | string | null;
}

const n = (v: number | string | null | undefined) => Number(v ?? 0);

export async function hisHdcDspmSource(
  ctx: HdcDspmContext & { dataAsOf: string },
): Promise<HdcDspmRaw> {
  const [rows, units] = await Promise.all([
    hdcQuery<DspmRow>(HDC_DSPM_VILLAGE_SQL, hdcDspmParams(ctx)),
    loadFreshness(ctx.dataAsOf),
  ]);
  return {
    rows: rows
      .filter((r): r is DspmRow & { vid: string } => !!r.vid)
      .map((r) => ({
        vid: r.vid,
        ageMonths: n(r.age_months),
        target: n(r.target),
        screened: n(r.screened),
        normalFirst: n(r.normal_first),
        suspectWait: n(r.suspect_wait),
        suspectRefer: n(r.suspect_refer),
        followed: n(r.followed),
        normalAfter: n(r.normal_after),
        delayedAfter: n(r.delayed_after),
        waiting: n(r.waiting),
        lost: n(r.lost),
      })),
    units,
  };
}

/** Deterministic fake DSPM counts (KPI_DATA_SOURCE=mock). */
export async function mockHdcDspmSource(
  ctx: HdcDspmContext & { dataAsOf: string },
): Promise<HdcDspmRaw> {
  const rows: HdcDspmRowRaw[] = DISTRICT_TAMBONS.flatMap((t, ti) =>
    [1, 2, 3, 4].flatMap((moo) =>
      DSPM_AGE_MONTHS.map((ageMonths, ai): HdcDspmRowRaw => {
        const target = 3 + ((ti + moo + ai) % 5);
        const screened = Math.max(0, target - ((ti + ai) % 2));
        const suspectWait = (moo + ai) % 3 === 0 ? 1 : 0;
        const followed = suspectWait;
        return {
          vid: `${t.code}${String(moo).padStart(2, "0")}`,
          ageMonths,
          target,
          screened,
          normalFirst: screened - suspectWait,
          suspectWait,
          suspectRefer: 0,
          followed,
          normalAfter: followed,
          delayedAfter: 0,
          waiting: 0,
          lost: 0,
        };
      }),
    ),
  );
  const { units } = await mockHdcDistrictSource("DM", {
    periodStart: ctx.periodStart,
    countFrom: ctx.periodStart,
    dataAsOf: ctx.dataAsOf,
  });
  return { rows, units };
}

/* ------------------------------ Cavity Free ------------------------------- */

/** Raw Cavity Free counts of one village × age (see hdc-cavity-free.ts). */
export interface HdcCavityFreeRowRaw {
  vid: string;
  ageYears: number;
  target: number;
  examined: number;
  cavityFree: number;
}

export interface HdcCavityFreeRaw {
  rows: HdcCavityFreeRowRaw[];
  units: HdcUnitFreshnessRaw[];
}

interface CavityFreeRow extends RowDataPacket {
  vid: string | null;
  age_years: number | string;
  target: number | string | null;
  examined: number | string | null;
  cavity_free: number | string | null;
}

export async function hisHdcCavityFreeSource(
  ctx: HdcCavityFreeContext & { dataAsOf: string },
): Promise<HdcCavityFreeRaw> {
  const [rows, units] = await Promise.all([
    hdcQuery<CavityFreeRow>(
      HDC_CAVITY_FREE_VILLAGE_SQL,
      hdcCavityFreeParams(ctx),
    ),
    loadFreshness(ctx.dataAsOf),
  ]);
  return {
    rows: rows
      .filter((r): r is CavityFreeRow & { vid: string } => !!r.vid)
      .map((r) => ({
        vid: r.vid,
        ageYears: n(r.age_years),
        target: n(r.target),
        examined: n(r.examined),
        cavityFree: n(r.cavity_free),
      })),
    units,
  };
}

/** Deterministic fake Cavity Free counts (KPI_DATA_SOURCE=mock). */
export async function mockHdcCavityFreeSource(
  ctx: HdcCavityFreeContext & { dataAsOf: string },
): Promise<HdcCavityFreeRaw> {
  const rows: HdcCavityFreeRowRaw[] = DISTRICT_TAMBONS.flatMap((t, ti) =>
    [1, 2, 3].flatMap((moo) =>
      [0, 1, 2, 3, 4, 5].map((ageYears): HdcCavityFreeRowRaw => {
        const target = 4 + ((ti + moo + ageYears) % 4);
        const examined = Math.max(0, target - 1 - (ageYears === 0 ? 2 : 0));
        return {
          vid: `${t.code}${String(moo).padStart(2, "0")}`,
          ageYears,
          target,
          examined,
          cavityFree: Math.max(0, examined - ((ti + ageYears) % 2)),
        };
      }),
    ),
  );
  const { units } = await mockHdcDistrictSource("DM", {
    periodStart: ctx.periodStart,
    countFrom: ctx.periodStart,
    dataAsOf: ctx.dataAsOf,
  });
  return { rows, units };
}

export async function mockHdcCkd5Source(
  ctx: HdcPeriodContext,
): Promise<HdcCkd5Raw> {
  const villages = DISTRICT_TAMBONS.flatMap((t, ti) =>
    [1, 3, 5].map((moo) => ({
      vid: `${t.code}${String(moo).padStart(2, "0")}`,
      currentCases: (ti + moo) % 3,
      previousCases: (ti + moo + 1) % 3,
      previousSamePeriod: (ti + moo) % 2,
    })),
  );
  const { units } = await mockHdcDistrictSource("DM", {
    periodStart: ctx.periodStart,
    countFrom: ctx.periodStart,
    dataAsOf: ctx.dataAsOf,
  });
  return { villages, units };
}

export async function mockHdcStemiSource(): Promise<HdcStemiRaw> {
  return { episodes: 12, deaths: 1 };
}

/* ------------------- person list (patient-identifiable) ------------------- */

/**
 * One person of the target group. Patient-identifiable: server-side only
 * until mapped to DistrictPerson in a no-store response / Excel file.
 * Never cached, never logged.
 */
export interface HdcPersonRaw {
  vid: string;
  fullName: string;
  sortName: string;
  /** PERSON.sex '1' / '2'. */
  sex: string | null;
  /** 'YYYYMMDD' (used for the age only, never returned). */
  birth: string | null;
  unitCode: string | null;
  unitName: string | null;
  /** 'YYYY-MM-DD' or null. */
  screenDate: string | null;
  screenUnitCode: string | null;
  screenUnitName: string | null;
  /** DMC / HTC only. */
  suspectDate?: string | null;
}

export type HdcPersonScope =
  { kind: "village"; vid: string } | { kind: "tambon"; tambonCode: string };

interface PersonRow extends RowDataPacket {
  vid: string;
  prename: string | null;
  first_name: string | null;
  /** AES-256-GCM hex (see hdc-crypto.ts). */
  lname_enc: string | null;
  sex: string | null;
  birth: string | null;
  unit_code: string | null;
  unit_name: string | null;
  screen_date: string | null;
  screen_unit_code: string | null;
  screen_unit_name: string | null;
  suspect_date?: string | null;
}

function trimOrNull(v: string | null | undefined): string | null {
  const t = v?.trim();
  return t ? t : null;
}

/** May return limit + 1 rows (the SQL LIMIT) so the caller can detect truncation. */
export async function hisHdcPersonsSource(
  code: DistrictCode,
  ctx: HdcScreeningSqlContext,
  scope: HdcPersonScope,
): Promise<HdcPersonRaw[]> {
  const sql = HDC_SCREENING_SQL[code];
  const params = sql.buildParams(ctx);
  const rows =
    scope.kind === "village"
      ? await hdcQuery<PersonRow>(sql.personsByVillage, {
          ...params,
          vid: scope.vid,
        })
      : await hdcQuery<PersonRow>(sql.personsByTambon, {
          ...params,
          tambon: scope.tambonCode,
        });
  return rows.map((r) => {
    const first = trimOrNull(r.first_name) ?? "";
    const last = decryptHdc(r.lname_enc) ?? "";
    return {
      vid: r.vid,
      fullName: `${trimOrNull(r.prename) ?? ""}${first} ${last}`.trim(),
      sortName: `${first} ${last}`.trim(),
      sex: trimOrNull(r.sex),
      birth: trimOrNull(r.birth),
      unitCode: trimOrNull(r.unit_code),
      unitName: trimOrNull(r.unit_name),
      screenDate: hdcDateToIso(r.screen_date),
      screenUnitCode: trimOrNull(r.screen_unit_code),
      screenUnitName: trimOrNull(r.screen_unit_name),
      ...(sql.withSuspect ? { suspectDate: hdcDateToIso(r.suspect_date) } : {}),
    };
  });
}

const MOCK_FIRST = [
  "สมชาย",
  "สมหญิง",
  "มานี",
  "มานะ",
  "ปิติ",
  "ชูใจ",
  "วีระ",
  "สุดา",
];
const MOCK_LAST = ["ตัวอย่าง", "ทดสอบ", "สมมติ", "จำลอง"];

/** Fake people (KPI_DATA_SOURCE=mock) — clearly fictitious names. */
export async function mockHdcPersonsSource(
  code: DistrictCode,
  ctx: HdcScreeningSqlContext,
  scope: HdcPersonScope,
): Promise<HdcPersonRaw[]> {
  const vids =
    scope.kind === "village"
      ? [scope.vid]
      : [1, 2, 3].map(
          (m) => `${scope.tambonCode}${String(m).padStart(2, "0")}`,
        );
  const year = Number(ctx.periodStart.slice(0, 4));
  return vids.flatMap((vid, vi) =>
    Array.from({ length: 12 }, (_, i): HdcPersonRaw => {
      const screened = (i + vi) % 4 !== 0;
      const first = MOCK_FIRST[(i + vi) % MOCK_FIRST.length];
      const last = MOCK_LAST[i % MOCK_LAST.length];
      return {
        vid,
        fullName: `(ข้อมูลจำลอง) ${first} ${last}`,
        sortName: `${first} ${last}`,
        sex: i % 2 === 0 ? "1" : "2",
        birth: `${year - 36 - i}0615`,
        unitCode: "00000",
        unitName: "หน่วยบริการจำลอง",
        screenDate: screened ? ctx.periodStart : null,
        screenUnitCode: screened ? "00000" : null,
        screenUnitName: screened ? "หน่วยบริการจำลอง" : null,
        ...(code === "DMC" || code === "HTC"
          ? { suspectDate: ctx.periodStart }
          : {}),
      };
    }),
  );
}
