import "server-only";

import {
  daysInMonth,
  fiscalYearOf,
  fiscalYearRange,
} from "@/lib/kpi/fiscal-year";
import { SCREENING_INDICATORS } from "@/lib/kpi/screening-indicators";
import type { RatioCode } from "@/lib/kpi/types";
import type {
  ScreeningDetailSource,
  ScreeningPersonRaw,
  ScreeningRawIndicator,
  ScreeningSource,
  ScreeningSourceQuery,
  ScreeningVillageRaw,
} from "./screening-contract";

/**
 * Deterministic mock data for the screening KPIs (no real PII).
 * Same fiscal year + same dataAsOf always yields the same numbers.
 */

/** Share of the year's screening done in each fiscal month (Oct -> Sep), sums to 1. */
const MONTH_WEIGHTS = [
  0.07, 0.12, 0.13, 0.12, 0.11, 0.1, 0.08, 0.07, 0.06, 0.05, 0.05, 0.04,
];

interface MockBase {
  /** Target group size (before any target share). */
  eligible: number;
  /** Share of `eligible` newly screened during one whole fiscal year. */
  yearRate: number;
  /** Year-to-year variation of yearRate: [minus, plus] (absolute). */
  rateJitter: [number, number];
}

const BASE: Record<RatioCode, MockBase> = {
  // People aged >= 35 not yet diagnosed with DM / HT in the catchment area.
  DM: { eligible: 18_420, yearRate: 0.915, rateJitter: [0.04, 0.03] },
  HT: { eligible: 16_870, yearRate: 0.902, rateJitter: [0.04, 0.03] },
  // Thai women 30–60. ~13% newly screened per year -> ~37–45% of the 70%
  // target after the 2nd year of a phase.
  CX: { eligible: 7_860, yearRate: 0.135, rateJitter: [0.02, 0.02] },
  // Women 40–70 without known breast cancer; CBE coverage near the 80% target.
  BR: { eligible: 8_940, yearRate: 0.79, rateJitter: [0.05, 0.04] },
  // HDC 2.1 / 2.2: suspected DM / HT people and the share confirmed.
  DMC: { eligible: 31, yearRate: 0.87, rateJitter: [0.05, 0.05] },
  HTC: { eligible: 193, yearRate: 0.93, rateJitter: [0.03, 0.03] },
  // HDC 11.3–11.5: hospital DM clinic registry (~7,100), >= 1 lab per year.
  RLU_HBA1C: { eligible: 7_100, yearRate: 0.8, rateJitter: [0.03, 0.03] },
  RLU_LDL: { eligible: 7_100, yearRate: 0.8, rateJitter: [0.03, 0.03] },
  RLU_CR: { eligible: 7_100, yearRate: 0.83, rateJitter: [0.03, 0.03] },
  // STEMI episodes per year (B ~25) and the share who died (A ~1–3).
  STEMI: { eligible: 25, yearRate: 0.08, rateJitter: [0.05, 0.06] },
};

/** Mortality indicators report B per month too (see buildMortalityYear). */
function isMortality(code: RatioCode): boolean {
  return SCREENING_INDICATORS[code].targetOperator === "<";
}

/** FNV-1a string hash -> 32-bit seed. */
function hashSeed(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32 PRNG — deterministic replacement for Math.random. */
function prng(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * One fiscal year of an indicator. `alreadyScreened` people (earlier years
 * of a phase) are capped at eligible and reduce what can still be screened.
 */
function buildYear(
  code: RatioCode,
  fiscalYear: number,
  months: string[],
  dataAsOf: string,
  alreadyScreened: number,
): ScreeningRawIndicator {
  const rand = prng(hashSeed(`${code}:${fiscalYear}`));
  const base = BASE[code];

  // Population drifts slightly year to year (±2%).
  const eligible = Math.round(base.eligible * (0.98 + rand() * 0.04));
  const [minus, plus] = base.rateJitter;
  const yearRate = base.yearRate - minus + rand() * (minus + plus);

  if (isMortality(code)) {
    return buildMortalityYear(code, eligible, yearRate, months, rand);
  }

  const priorScreened = Math.min(alreadyScreened, eligible);
  const asOfMonth = dataAsOf.slice(0, 7);
  const asOfDay = Number(dataAsOf.slice(8, 10));

  let cumulative = 0;
  const monthlyScreened = months.map((month) => {
    // Index by the month's position in the fiscal year (Oct = 0).
    const i = (Number(month.slice(5, 7)) + 2) % 12;
    const jitter = 0.9 + rand() * 0.2; // ±10%
    let screened = eligible * yearRate * MONTH_WEIGHTS[i] * jitter;
    // Current (incomplete) month: prorate by elapsed days.
    if (month === asOfMonth) {
      screened *= asOfDay / daysInMonth(month);
    }
    // A is a subset of the target group — never exceed it.
    const value = Math.min(
      Math.round(screened),
      eligible - priorScreened - cumulative,
    );
    cumulative += value;
    return { month, screened: value };
  });

  return { code, eligible, priorScreened, monthlyScreened };
}

/**
 * Mortality year: B (episodes) is spread over the reported months; A (deaths)
 * is a few cases that never exceed the B of their month. Headline B is the
 * sum of the monthly B so the cumulative rate (cum A / cum B) is consistent.
 */
function buildMortalityYear(
  code: RatioCode,
  eligibleFullYear: number,
  yearRate: number,
  months: string[],
  rand: () => number,
): ScreeningRawIndicator {
  const weights = months.map(
    (m) => MONTH_WEIGHTS[(Number(m.slice(5, 7)) + 2) % 12],
  );
  const sumW = weights.reduce((a, b) => a + b, 0);
  const monthlyB = apportion(Math.round(eligibleFullYear * sumW), weights);
  const eligible = monthlyB.reduce((a, b) => a + b, 0);
  let remainingDeaths = Math.min(eligible, Math.round(eligible * yearRate));
  const monthlyScreened = months.map((month, i) => {
    const deaths = Math.min(
      monthlyB[i],
      remainingDeaths,
      rand() < 0.5 ? 1 : 0,
    );
    remainingDeaths -= deaths;
    return { month, screened: deaths, eligible: monthlyB[i] };
  });
  // Deaths that did not fit in a random month go to the last month with room.
  for (let i = monthlyScreened.length - 1; i >= 0 && remainingDeaths > 0; i--) {
    const room = monthlyScreened[i].eligible - monthlyScreened[i].screened;
    const add = Math.min(room, remainingDeaths);
    monthlyScreened[i].screened += add;
    remainingDeaths -= add;
  }
  return { code, eligible, priorScreened: 0, monthlyScreened };
}

/** Headline raw numbers, incl. earlier years of the phase for CX. */
function buildIndicator(
  code: RatioCode,
  q: ScreeningSourceQuery,
): ScreeningRawIndicator {
  let prior = 0;
  for (let fy = fiscalYearOf(q.countFrom); fy < q.fiscalYear; fy++) {
    const r = fiscalYearRange(fy);
    const year = buildYear(code, fy, r.months, r.end, prior);
    prior += year.monthlyScreened.reduce((s, m) => s + m.screened, 0);
  }
  return buildYear(code, q.fiscalYear, q.months, q.dataAsOf, prior);
}

export const mockScreeningSource: ScreeningSource = async (code, query) => {
  return buildIndicator(code, query);
};

/* ---------------- detail (mock) ------------------------------------------
 * Deterministic fake villages / people. Every name and HN is obviously fake
 * ("ข้อมูลจำลอง", HN prefix "MOCK"). Village totals add up exactly to the
 * headline mock numbers above for the same fiscal year and dataAsOf.
 * ---------------------------------------------------------------------- */

const MOCK_VILLAGES: { villageId: number; moo: string; villageName: string }[] =
  [
    "บ้านจำลองหนึ่ง",
    "บ้านจำลองสอง",
    "บ้านจำลองสาม",
    "บ้านจำลองสี่",
    "บ้านจำลองห้า",
    "บ้านจำลองหก",
    "บ้านจำลองเจ็ด",
    "บ้านจำลองแปด",
    "บ้านจำลองเก้า",
    "บ้านจำลองสิบ",
    "บ้านจำลองสิบเอ็ด",
    "บ้านจำลองสิบสอง",
  ].map((villageName, i) => ({
    villageId: 101 + i,
    moo: String(i + 1),
    villageName,
  }));

const MOCK_FIRST_NAMES = ["ทดสอบ", "สมมติ", "ตัวอย่าง", "จำลอง", "สาธิต"];

/** Oldest age generated when the indicator has no upper age bound. */
const MOCK_MAX_AGE = 90;

/**
 * Split `total` into integers proportional to `weights` (largest remainder),
 * never exceeding caps[i]. Requires total <= sum(caps).
 */
function apportion(total: number, weights: number[], caps?: number[]): number[] {
  const sumW = weights.reduce((a, b) => a + b, 0);
  const exact = weights.map((w) => (sumW > 0 ? (total * w) / sumW : 0));
  const result = exact.map((x, i) =>
    Math.min(Math.floor(x), caps ? caps[i] : Infinity),
  );
  let remaining = total - result.reduce((a, b) => a + b, 0);
  const order = exact
    .map((x, i) => ({ i, frac: x - Math.floor(x) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i)
    .map((o) => o.i);
  while (remaining > 0) {
    let progressed = false;
    for (const i of order) {
      if (remaining === 0) break;
      if (!caps || result[i] < caps[i]) {
        result[i] += 1;
        remaining -= 1;
        progressed = true;
      }
    }
    if (!progressed) break; // total > sum(caps): cannot happen for A <= eligible
  }
  return result;
}

function mockVillageCounts(
  code: RatioCode,
  q: ScreeningSourceQuery,
): ScreeningVillageRaw[] {
  const headline = buildIndicator(code, q);
  const totalEligible = headline.eligible;
  const totalA =
    headline.priorScreened +
    headline.monthlyScreened.reduce((s, m) => s + m.screened, 0);

  // Village sizes: same proportions for every indicator within a fiscal year.
  const sizeRand = prng(hashSeed(`villages:${q.fiscalYear}`));
  const sizeWeights = MOCK_VILLAGES.map(() => 0.5 + sizeRand());
  const eligibles = apportion(totalEligible, sizeWeights);

  // Coverage differs per village (±).
  const rateRand = prng(hashSeed(`${code}:${q.fiscalYear}:village-rate`));
  const aWeights = eligibles.map((b) => b * (0.8 + rateRand() * 0.3));
  const numerators = apportion(totalA, aWeights, eligibles);

  return MOCK_VILLAGES.map((v, i) => ({
    villageId: v.villageId,
    moo: v.moo,
    villageName: v.villageName,
    eligible: eligibles[i],
    numerator: numerators[i],
  }));
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
  code: RatioCode,
  q: ScreeningSourceQuery,
  village: ScreeningVillageRaw,
): ScreeningPersonRaw[] {
  const meta = SCREENING_INDICATORS[code];
  const rand = prng(
    hashSeed(`${code}:${q.fiscalYear}:persons:${village.villageId}`),
  );
  const n = village.eligible;

  // Pick exactly `numerator` screened people (partial Fisher–Yates).
  const idx = Array.from({ length: n }, (_, i) => i);
  for (let i = 0; i < village.numerator; i++) {
    const j = i + Math.floor(rand() * (n - i));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  const screenedSet = new Set(idx.slice(0, village.numerator));

  // Screening dates are spread over the whole counting window (for CX the
  // phase so far); they are not aligned with the monthly mock numbers.
  const startMs = isoToUtcMs(q.countFrom);
  const spanDays =
    Math.floor((isoToUtcMs(q.dataAsOf) - startMs) / DAY_MS) + 1;
  const ageSpan = (meta.maxAge ?? MOCK_MAX_AGE) - meta.minAge + 1;

  const people: ScreeningPersonRaw[] = [];
  for (let i = 0; i < n; i++) {
    const personId = village.villageId * 100_000 + i + 1;
    const r = rand();
    const sex =
      meta.sex === "female" ? "2" : r < 0.48 ? "1" : r < 0.98 ? "2" : null;
    const age = meta.minAge + Math.floor(rand() * ageSpan);
    const title =
      sex === "1" ? "นาย" : sex === "2" ? (rand() < 0.75 ? "นาง" : "นางสาว") : "";
    const first = `${MOCK_FIRST_NAMES[i % MOCK_FIRST_NAMES.length]}${String(i + 1).padStart(4, "0")}`;
    const last = `ข้อมูลจำลอง${village.moo}`;
    const screened = screenedSet.has(i);
    const screenDate = screened
      ? new Date(startMs + Math.floor(rand() * spanDays) * DAY_MS)
          .toISOString()
          .slice(0, 10)
      : null;
    // Mortality: one row per episode; screenDate = death date (after the start).
    const eventDate = isMortality(code)
      ? new Date(startMs + Math.floor(rand() * spanDays) * DAY_MS)
          .toISOString()
          .slice(0, 10)
      : null;
    people.push({
      personId,
      villageId: village.villageId,
      ...(eventDate !== null ? { eventDate } : {}),
      hn: `MOCK${String(personId).padStart(8, "0")}`,
      fullName: `${title}${first} ${last}`,
      sortName: `${first} ${last}`,
      sex,
      age,
      screenDate: eventDate !== null && screened ? eventDate : screenDate,
    });
  }
  return people;
}

export const mockScreeningDetailSource: ScreeningDetailSource = {
  async villages(code, q) {
    return mockVillageCounts(code, q);
  },

  async persons(code, q, filter, limit) {
    const villages = mockVillageCounts(code, q).filter(
      (v) => filter.kind === "all" || v.villageId === filter.villageId,
    );
    const rows: ScreeningPersonRaw[] = [];
    for (const v of villages) {
      for (const p of mockPersonsOfVillage(code, q, v)) {
        rows.push(p);
        if (rows.length > limit) return rows; // limit + 1 => truncated
      }
    }
    return rows;
  },
};
