import "server-only";

import type { RowDataPacket } from "mysql2";
import { cacheLife, cacheTag, io } from "next/cache";

import { query } from "@/lib/db/his";
import { todayIsoDate } from "@/lib/kpi/fiscal-year";
import {
  resolveOverviewRange,
  type OverviewRangeInput,
} from "@/lib/kpi/overview-range";
import type {
  AgeSexBand,
  CountWithPrev,
  DiseaseGroupCount,
  DiseaseGroupRanking,
  HourlyVisit,
  NamedCount,
  OverviewRange,
  ServiceOverview,
  WardOccupancy,
} from "@/lib/kpi/overview-types";
import { OVERVIEW_SQL } from "@/lib/kpi/sql/overview-hosxp";

/**
 * "ผู้รับบริการ" (hospital service overview) — HOSxP only, aggregates only.
 * Definitions: docs/kpi/service-overview.md. SQL: ./sql/overview-hosxp.ts.
 */

export const OVERVIEW_CACHE_TAG = "kpi:overview";

export const AGE_BANDS = [
  "0-4",
  "5-14",
  "15-24",
  "25-34",
  "35-44",
  "45-54",
  "55-64",
  "65-74",
  "75+",
] as const;

/**
 * Home ward ("Home ward", ward 17 at this site) is identified by ward name;
 * HOSxP has no home-ward flag on ward/ipt (checked information_schema).
 * HOME_WARD_CODES is a fallback in case the name is ever changed.
 */
export const HOME_WARD_CODES: readonly string[] = ["17"];
const HOME_WARD_NAME = /home\s*-?\s*ward|โฮม\s*วอร์ด/i;

export function isHomeWard(code: string, name: string | null): boolean {
  return HOME_WARD_CODES.includes(code) || HOME_WARD_NAME.test(name ?? "");
}

/**
 * pttype.hipdata_code (NHSO main fund) -> display group. Codes not listed
 * fall into OTHER_PTTYPE_GROUP.
 */
export const PTTYPE_GROUPS: readonly {
  code: string;
  name: string;
  hipdata: readonly string[];
}[] = [
  { code: "UC", name: "สิทธิ UC", hipdata: ["UCS"] },
  { code: "OFC", name: "สิทธิข้าราชการ", hipdata: ["OFC"] },
  { code: "SSS", name: "สิทธิประกันสังคม", hipdata: ["SSS", "SSI"] },
  { code: "LGO", name: "สิทธิ อปท", hipdata: ["LGO"] },
  { code: "CSH", name: "ชำระเงิน", hipdata: ["CSH"] },
  { code: "INS", name: "พ.ร.บ.ผู้ประสบภัยจากรถ", hipdata: ["INS"] },
  { code: "NR", name: "สิทธิต่างด้าว", hipdata: ["NRD", "NRH"] },
  {
    code: "GOV",
    name: "สิทธิเบิกหน่วยงานอื่น",
    hipdata: ["BKK", "BMT", "SRT", "PTY", "PVT", "STP", "A2"],
  },
];
export const OTHER_PTTYPE_GROUP = { code: "OTHER", name: "อื่นๆ/ไม่ระบุ" };

/**
 * Parse the tab's search params into a range (Asia/Bangkok "today").
 * Reads the clock: call it in request scope (e.g. after `await
 * searchParams`), not inside "use cache". Pure version for client/tests:
 * resolveOverviewRange in ./overview-range.
 */
export function parseOverviewRange(
  searchParams: OverviewRangeInput,
): OverviewRange {
  return resolveOverviewRange(searchParams, todayIsoDate());
}

/**
 * All overview data for a range. Runs the queries in parallel.
 *
 * Rendering contract (Cache Components), same as getScreeningKpi:
 *  - `await io()` first, so HIS is never queried during prerender /
 *    `next build`; render the caller inside `<Suspense>`.
 *  - Work is in a `"use cache"` scope keyed by the range, cacheLife
 *    "minutes" (today's figures move constantly). Invalidate with
 *    revalidateTag(OVERVIEW_CACHE_TAG).
 * Throws HisQueryError / HisConfigError if the database fails.
 */
export async function getServiceOverview(
  range: OverviewRange,
): Promise<ServiceOverview> {
  await io();
  return loadServiceOverview(
    range.preset,
    range.from,
    range.to,
    range.prevFrom,
    range.prevTo,
  );
}

// --- rows -------------------------------------------------------------------

interface CardsRow extends RowDataPacket {
  opd_visits: number | string;
  patients: number | string;
  er: number | string;
  admit_new: number | string;
}
interface WardRow extends RowDataPacket {
  ward: string;
  ward_name: string | null;
  beds: number | string;
  ward_active: string | null;
  patients: number | string;
}
interface HourRow extends RowDataPacket {
  hour: number | string | null;
  visits: number | string;
}
interface DepRow extends RowDataPacket {
  code: string;
  dep_name: string | null;
  visits: number | string;
}
interface PttypeRow extends RowDataPacket {
  hipdata_code: string;
  visits: number | string;
}
interface DiseaseGroupRow extends RowDataPacket {
  group_id: number | string | null;
  no_dx: number | string | null;
  name_th: string | null;
  ranges: string | null;
  visits?: number | string;
  admissions?: number | string;
}
interface AgeSexRow extends RowDataPacket {
  band: string;
  sex: string | null;
  patients: number | string;
}

/** COUNT/SUM may arrive as number or (DECIMAL) string. */
const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

// --- loader -----------------------------------------------------------------

async function loadServiceOverview(
  preset: OverviewRange["preset"],
  from: string,
  to: string,
  prevFrom: string,
  prevTo: string,
): Promise<ServiceOverview> {
  "use cache";
  cacheLife("minutes");
  cacheTag(OVERVIEW_CACHE_TAG);

  const cur = { from, to };
  const prev = { from: prevFrom, to: prevTo };

  const [
    curCards,
    prevCards,
    wardRows,
    hourRows,
    depRows,
    ptRows,
    asRows,
    dxOpdRows,
    dxIpdRows,
  ] = await Promise.all([
    query<CardsRow>(OVERVIEW_SQL.cards, cur),
    query<CardsRow>(OVERVIEW_SQL.cards, prev),
    query<WardRow>(OVERVIEW_SQL.wards),
    query<HourRow>(OVERVIEW_SQL.hourly, cur),
    query<DepRow>(OVERVIEW_SQL.departments, cur),
    query<PttypeRow>(OVERVIEW_SQL.pttypes, cur),
    query<AgeSexRow>(OVERVIEW_SQL.ageSex, cur),
    query<DiseaseGroupRow>(OVERVIEW_SQL.diseaseGroupsOpd, cur),
    query<DiseaseGroupRow>(OVERVIEW_SQL.diseaseGroupsIpd, cur),
  ]);

  const c = curCards[0];
  const p = prevCards[0];
  const pair = (
    k: "patients" | "opd_visits" | "er" | "admit_new",
  ): CountWithPrev => ({
    value: num(c?.[k]),
    prev: num(p?.[k]),
  });

  const { wards, homeWardNow } = toWards(wardRows);

  return {
    range: { preset, from, to, prevFrom, prevTo },
    cards: {
      patients: pair("patients"),
      opdVisits: pair("opd_visits"),
      er: pair("er"),
      admitNew: pair("admit_new"),
      inpatientNow: wards.reduce((s, w) => s + w.patients, 0),
      bedTotal: wards.reduce((s, w) => s + w.beds, 0),
      homeWardNow,
    },
    hourly: toHourly(hourRows),
    wards,
    departments: toDepartments(depRows),
    pttypes: toPttypes(ptRows),
    ageSex: toAgeSex(asRows),
    diseaseGroups: {
      opd: toDiseaseRanking(dxOpdRows, (r) => r.visits),
      ipd: toDiseaseRanking(dxIpdRows, (r) => r.admissions, NAME_505_FIXES),
    },
  };
}

// --- mapping ------------------------------------------------------------------

function toWards(rows: readonly WardRow[]): {
  wards: WardOccupancy[];
  homeWardNow: number;
} {
  let homeWardNow = 0;
  const wards: WardOccupancy[] = [];
  for (const r of rows) {
    const patients = num(r.patients);
    if (isHomeWard(r.ward, r.ward_name)) {
      homeWardNow += patients;
      continue;
    }
    wards.push({
      ward: r.ward,
      name: r.ward_name?.trim() || r.ward,
      patients,
      beds: num(r.beds),
    });
  }
  wards.sort((a, b) => b.patients - a.patients || a.ward.localeCompare(b.ward));
  return { wards, homeWardNow };
}

function toHourly(rows: readonly HourRow[]): HourlyVisit[] {
  const out: HourlyVisit[] = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    visits: 0,
  }));
  for (const r of rows) {
    const h = num(r.hour);
    if (r.hour !== null && h >= 0 && h <= 23) out[h].visits += num(r.visits);
  }
  return out;
}

function depLabel(code: string, name: string | null): string {
  const n = name?.trim();
  if (!code) return n || "ไม่ระบุแผนก";
  if (!n) return `${code}-ไม่ระบุ`;
  // kskdepartment.department already carries "NNN-" at this site
  // (also "ปิดใช้งาน-NNN-..." for disabled ones).
  return n.includes(`${code}-`) ? n : `${code}-${n}`;
}

function toDepartments(rows: readonly DepRow[]): NamedCount[] {
  return rows
    .map((r) => ({
      code: r.code,
      name: depLabel(r.code, r.dep_name),
      visits: num(r.visits),
    }))
    .filter((d) => d.visits > 0)
    .sort((a, b) => b.visits - a.visits || a.code.localeCompare(b.code));
}

function toPttypes(rows: readonly PttypeRow[]): NamedCount[] {
  const totals = new Map<string, NamedCount>();
  for (const r of rows) {
    const g =
      PTTYPE_GROUPS.find((x) => x.hipdata.includes(r.hipdata_code)) ??
      OTHER_PTTYPE_GROUP;
    const cur = totals.get(g.code) ?? { code: g.code, name: g.name, visits: 0 };
    cur.visits += num(r.visits);
    totals.set(g.code, cur);
  }
  return [...totals.values()]
    .filter((g) => g.visits > 0)
    .sort((a, b) => b.visits - a.visits || a.code.localeCompare(b.code));
}

function toAgeSex(rows: readonly AgeSexRow[]): AgeSexBand[] {
  const out = new Map<string, AgeSexBand>(
    AGE_BANDS.map((band) => [band, { band, male: 0, female: 0 }]),
  );
  for (const r of rows) {
    const b = out.get(r.band);
    if (!b) continue;
    if (r.sex === "1") b.male += num(r.patients);
    else if (r.sex === "2") b.female += num(r.patients);
    // other / unknown sex is not shown (0 rows in FY2570 to date)
  }
  return [...out.values()];
}

/**
 * Corrections to HOSxP's rpt_505_name.name1 at this site: group 14 (CA
 * Cervix) carries group 13's Thai name, group 17 has a typo.
 */
const NAME_505_FIXES: Readonly<Record<string, string>> = {
  "14": "เนื้องอกร้ายที่ปากมดลูก",
  "17": "ความผิดปกติของต่อมไทรอยด์",
};

/** "Y85-Y85, Y86-Y89" -> "Y85, Y86-Y89" */
function icdLabel(ranges: string | null): string {
  return (ranges ?? "")
    .split(",")
    .map((r) => r.trim())
    .filter(Boolean)
    .map((r) => {
      const [a, b] = r.split("-");
      return a === b ? a : r;
    })
    .join(", ");
}

function toDiseaseRanking(
  rows: readonly DiseaseGroupRow[],
  countOf: (r: DiseaseGroupRow) => unknown,
  nameFixes: Readonly<Record<string, string>> = {},
): DiseaseGroupRanking {
  let unclassified = 0;
  let uncoded = 0;
  const groups: DiseaseGroupCount[] = [];
  for (const r of rows) {
    const count = num(countOf(r));
    if (num(r.no_dx) === 1) {
      uncoded += count;
      continue;
    }
    if (r.group_id === null || r.group_id === undefined) {
      unclassified += count;
      continue;
    }
    if (count <= 0) continue;
    const code = String(r.group_id);
    groups.push({
      code,
      name: nameFixes[code] ?? (r.name_th?.trim() || `กลุ่ม ${code}`),
      icd: icdLabel(r.ranges),
      count,
    });
  }
  groups.sort((a, b) => b.count - a.count || Number(a.code) - Number(b.code));
  return {
    groups,
    classified: groups.reduce((s, g) => s + g.count, 0),
    unclassified,
    uncoded,
  };
}
