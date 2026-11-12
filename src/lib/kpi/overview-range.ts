/**
 * Date-range logic of the "ผู้รับบริการ" (service overview) tab.
 * Pure functions, no I/O — safe for server and client (UI may reuse the
 * preset labels and resolveOverviewRange for links / display).
 *
 * All dates are ISO "YYYY-MM-DD" (Gregorian) in Asia/Bangkok, inclusive.
 * prevFrom..prevTo = the period of the same number of days immediately
 * before `from` (today -> yesterday, 7d -> the 7 days before, month 1..12
 * -> the 12 days before the 1st, ...).
 */

import { todayIsoDate } from "./fiscal-year";
import type { OverviewPreset, OverviewRange } from "./overview-types";

export const OVERVIEW_PRESETS: readonly OverviewPreset[] = [
  "today",
  "yesterday",
  "7d",
  "month",
  "fiscal",
  "custom",
];

export const OVERVIEW_PRESET_LABELS: Record<OverviewPreset, string> = {
  today: "วันนี้",
  yesterday: "เมื่อวาน",
  "7d": "7 วันล่าสุด",
  month: "เดือนนี้",
  fiscal: "ปีงบประมาณนี้",
  custom: "กำหนดเอง",
};

export const DEFAULT_OVERVIEW_PRESET: OverviewPreset = "today";

/** Longest custom range in days (inclusive) — about one year. */
export const MAX_OVERVIEW_RANGE_DAYS = 366;

/** Earliest date accepted for a custom range. */
export const MIN_OVERVIEW_DATE = "2015-01-01";

export interface OverviewRangeInput {
  preset?: string | string[];
  from?: string | string[];
  to?: string | string[];
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

/** True for a real calendar date "YYYY-MM-DD". */
export function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !ISO_DATE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

export function isOverviewPreset(value: unknown): value is OverviewPreset {
  return (
    typeof value === "string" &&
    (OVERVIEW_PRESETS as readonly string[]).includes(value)
  );
}

/** ISO date + n days (n may be negative). */
export function addDays(iso: string, n: number): string {
  const t = Date.parse(`${iso}T00:00:00Z`) + n * DAY_MS;
  return new Date(t).toISOString().slice(0, 10);
}

/** Inclusive number of days from..to (1 when from === to). */
export function rangeDays(from: string, to: string): number {
  return (
    Math.round(
      (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) /
        DAY_MS,
    ) + 1
  );
}

/** 1 Oct of the Thai fiscal year that contains `iso`. */
export function fiscalYearStartOf(iso: string): string {
  const y = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7));
  return `${m >= 10 ? y : y - 1}-10-01`;
}

function withPrev(
  preset: OverviewPreset,
  from: string,
  to: string,
): OverviewRange {
  const days = rangeDays(from, to);
  const prevTo = addDays(from, -1);
  return { preset, from, to, prevFrom: addDays(prevTo, -(days - 1)), prevTo };
}

/**
 * Resolve a range from URL search params. Never throws: unknown preset ->
 * "today"; custom with invalid dates -> "today"; custom from > to ->
 * swapped; dates after today are clamped to today, before
 * MIN_OVERVIEW_DATE to that date; spans longer than MAX_OVERVIEW_RANGE_DAYS
 * keep `to` and move `from` forward. A custom range with only one valid
 * date is a single day.
 *
 * @param today "YYYY-MM-DD" in Asia/Bangkok (default: now). Pass it
 *   explicitly from code that must be deterministic.
 */
export function resolveOverviewRange(
  input: OverviewRangeInput,
  today: string = todayIsoDate(),
): OverviewRange {
  const rawPreset = first(input.preset);
  const preset = isOverviewPreset(rawPreset)
    ? rawPreset
    : DEFAULT_OVERVIEW_PRESET;

  switch (preset) {
    case "yesterday": {
      const d = addDays(today, -1);
      return withPrev(preset, d, d);
    }
    case "7d":
      return withPrev(preset, addDays(today, -6), today);
    case "month":
      return withPrev(preset, `${today.slice(0, 7)}-01`, today);
    case "fiscal":
      return withPrev(preset, fiscalYearStartOf(today), today);
    case "custom": {
      const rawFrom = first(input.from);
      const rawTo = first(input.to);
      const f = isIsoDate(rawFrom) ? rawFrom : undefined;
      const t = isIsoDate(rawTo) ? rawTo : undefined;
      if (!f && !t) return withPrev("today", today, today);
      let from = f ?? (t as string);
      let to = t ?? (f as string);
      if (from > to) [from, to] = [to, from];
      const clamp = (d: string) =>
        d > today ? today : d < MIN_OVERVIEW_DATE ? MIN_OVERVIEW_DATE : d;
      from = clamp(from);
      to = clamp(to);
      if (rangeDays(from, to) > MAX_OVERVIEW_RANGE_DAYS) {
        from = addDays(to, -(MAX_OVERVIEW_RANGE_DAYS - 1));
      }
      return withPrev(preset, from, to);
    }
    case "today":
    default:
      return withPrev("today", today, today);
  }
}
