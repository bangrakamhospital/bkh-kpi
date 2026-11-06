import "server-only";

import { daysInMonth, fiscalYearOf } from "@/lib/kpi/fiscal-year";
import type {
  Ckd5DetailSource,
  Ckd5Raw,
  Ckd5Source,
  Ckd5SourceQuery,
  Ckd5VillageRaw,
} from "./ckd5-contract";
import type { ScreeningPersonRaw } from "./screening-contract";

/**
 * Deterministic mock data for CKD5 (no real PII). Whole-year counts are
 * 35–48 like the verified HOSxP figures; the same fiscal year + dataAsOf
 * always yields the same numbers, and village / person data add up to the
 * headline numbers.
 */

/** Share of a year's new cases per fiscal month (Oct -> Sep), sums to 1. */
const MONTH_WEIGHTS = [
  0.07, 0.09, 0.14, 0.06, 0.06, 0.17, 0.11, 0.11, 0.03, 0.08, 0.05, 0.03,
];

/** New cases of a whole fiscal year (BE): 35..48. */
function yearTotal(fiscalYear: number): number {
  return 35 + ((fiscalYear * 7) % 14);
}

/** Splits `total` over the 12 fiscal months by MONTH_WEIGHTS (largest remainder). */
function splitMonths(total: number): number[] {
  const exact = MONTH_WEIGHTS.map((w) => w * total);
  const result = exact.map(Math.floor);
  let remaining = total - result.reduce((a, b) => a + b, 0);
  const order = exact
    .map((x, i) => ({ i, frac: x - Math.floor(x) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (const o of order) {
    if (remaining <= 0) break;
    result[o.i] += 1;
    remaining -= 1;
  }
  return result;
}

/** Index of a "YYYY-MM" month in the fiscal year (Oct = 0). */
function fiscalMonthIndex(month: string): number {
  return (Number(month.slice(5, 7)) + 2) % 12;
}

/** Cases of the months of a fiscal year up to `dataAsOf` (last month prorated). */
function countUpTo(monthly: number[], asOfIndex: number, asOfDay: number, dim: number) {
  let sum = 0;
  for (let i = 0; i <= asOfIndex; i++) {
    sum += i === asOfIndex ? Math.round((monthly[i] * asOfDay) / dim) : monthly[i];
  }
  return sum;
}

function monthsOf(q: Ckd5SourceQuery) {
  const fy = fiscalYearOf(q.periodStart);
  const current = splitMonths(yearTotal(fy));
  const previous = splitMonths(yearTotal(fy - 1));
  const asOfMonth = q.dataAsOf.slice(0, 7);
  const asOfIndex = fiscalMonthIndex(asOfMonth);
  const asOfDay = Number(q.dataAsOf.slice(8, 10));
  const dim = daysInMonth(asOfMonth);
  const currentMonthly = current.map((n, i) =>
    i === asOfIndex ? Math.round((n * asOfDay) / dim) : n,
  );
  return { fy, current, previous, currentMonthly, asOfIndex, asOfDay, dim };
}

export const mockCkd5Source: Ckd5Source = async (q): Promise<Ckd5Raw> => {
  const m = monthsOf(q);
  return {
    currentCases: countUpTo(m.current, m.asOfIndex, m.asOfDay, m.dim),
    previousCases: yearTotal(m.fy - 1),
    previousSamePeriod: countUpTo(m.previous, m.asOfIndex, m.asOfDay, m.dim),
    monthly: q.months.map((month) => {
      const i = fiscalMonthIndex(month);
      return {
        month,
        currentCases: i <= m.asOfIndex ? m.currentMonthly[i] : 0,
        previousCases: m.previous[i],
      };
    }),
  };
};

/* ---------------- detail (mock) ------------------------------------------ */

const MOCK_VILLAGES = [
  { villageId: 101, moo: "1", villageName: "บ้านจำลองหนึ่ง" },
  { villageId: 102, moo: "2", villageName: "บ้านจำลองสอง" },
  { villageId: 103, moo: "3", villageName: "บ้านจำลองสาม" },
];
/** Share of cases per village: the 3 mock villages, rest outside (id 0). */
const VILLAGE_SHARES = [2, 1, 1];

function splitVillages(total: number): number[] {
  const inArea = VILLAGE_SHARES.map((s) => Math.min(s, Math.floor(total / 4)));
  const outside = total - inArea.reduce((a, b) => a + b, 0);
  return [...inArea, outside];
}

function mockVillageCounts(q: Ckd5SourceQuery): Ckd5VillageRaw[] {
  const m = monthsOf(q);
  const cur = splitVillages(countUpTo(m.current, m.asOfIndex, m.asOfDay, m.dim));
  const prev = splitVillages(yearTotal(m.fy - 1));
  const rows: Ckd5VillageRaw[] = MOCK_VILLAGES.map((v, i) => ({
    ...v,
    currentCases: cur[i],
    previousCases: prev[i],
  }));
  rows.push({
    villageId: 0,
    moo: null,
    villageName: null,
    currentCases: cur[3],
    previousCases: prev[3],
  });
  return rows;
}

const DAY_MS = 86_400_000;

function isoToUtcMs(iso: string): number {
  return Date.UTC(
    Number(iso.slice(0, 4)),
    Number(iso.slice(5, 7)) - 1,
    Number(iso.slice(8, 10)),
  );
}

function mockPersonsOfVillage(
  q: Ckd5SourceQuery,
  v: Ckd5VillageRaw,
): ScreeningPersonRaw[] {
  const startMs = isoToUtcMs(q.periodStart);
  const spanDays = Math.floor((isoToUtcMs(q.dataAsOf) - startMs) / DAY_MS) + 1;
  const people: ScreeningPersonRaw[] = [];
  for (let i = 0; i < v.currentCases; i++) {
    const personId = v.villageId * 100_000 + i + 1;
    const male = i % 2 === 0;
    const first = `ทดสอบ${String(i + 1).padStart(4, "0")}`;
    const last = `ข้อมูลจำลอง${v.moo ?? "0"}`;
    people.push({
      personId,
      villageId: v.villageId,
      hn: `MOCK${String(personId).padStart(8, "0")}`,
      fullName: `${male ? "นาย" : "นาง"}${first} ${last}`,
      sortName: `${first} ${last}`,
      sex: male ? "1" : "2",
      age: 55 + ((i * 7) % 30),
      screenDate: new Date(
        startMs + Math.floor((spanDays * (i + 1)) / (v.currentCases + 1)) * DAY_MS,
      )
        .toISOString()
        .slice(0, 10),
    });
  }
  return people;
}

export const mockCkd5DetailSource: Ckd5DetailSource = {
  async villages(q) {
    return mockVillageCounts(q);
  },

  async persons(q, filter, limit) {
    const rows: ScreeningPersonRaw[] = [];
    for (const v of mockVillageCounts(q)) {
      if (filter.kind === "village" && v.villageId !== filter.villageId) continue;
      for (const p of mockPersonsOfVillage(q, v)) {
        rows.push(p);
        if (rows.length > limit) return rows;
      }
    }
    return rows;
  },
};
