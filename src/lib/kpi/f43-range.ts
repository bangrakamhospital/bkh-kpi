/**
 * Date range of "ตรวจ 43 แฟ้ม" (/f43): ?from=YYYY-MM-DD&to=YYYY-MM-DD,
 * inclusive, like @start_date/@end_date of the 43-file export SQL.
 * Pure functions, no I/O — safe for server and client.
 */

import type { F43Range } from "./f43-types";
import { todayIsoDate } from "./fiscal-year";
import { addDays, isIsoDate, rangeDays } from "./overview-range";

/** Longest range in days (inclusive), to keep the checks light on HOSxP. */
export const F43_MAX_RANGE_DAYS = 92;

/** Earliest date accepted (checks verified from FY2569). */
export const F43_MIN_DATE = "2025-10-01";

export interface F43Preset {
  label: string;
  from: string;
  to: string;
}

/** First day of the month of an ISO date. */
const monthStart = (iso: string) => `${iso.slice(0, 7)}-01`;

/** เดือนนี้ (1st – today) and เดือนก่อน (whole previous month). */
export function f43Presets(today = todayIsoDate()): F43Preset[] {
  const thisStart = monthStart(today);
  const prevEnd = addDays(thisStart, -1);
  return [
    { label: "เดือนนี้", from: thisStart, to: today },
    { label: "เดือนก่อน", from: monthStart(prevEnd), to: prevEnd },
  ];
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** Validates ?from=&to= (both or neither); default = this month up to today. */
export function parseF43Range(
  rawFrom: string | string[] | undefined,
  rawTo: string | string[] | undefined,
  today = todayIsoDate(),
): { range: F43Range; error?: undefined } | { range?: undefined; error: string } {
  const from = one(rawFrom);
  const to = one(rawTo);
  if (from === undefined && to === undefined) {
    const start = monthStart(today);
    return { range: { from: start, to: today, days: rangeDays(start, today) } };
  }
  if (!isIsoDate(from) || !isIsoDate(to)) {
    return { error: "รูปแบบวันที่ไม่ถูกต้อง (ตัวอย่าง: ?from=2026-11-01&to=2026-11-19)" };
  }
  if (from > to) return { error: "วันที่เริ่มต้องไม่หลังวันที่สิ้นสุด" };
  if (from < F43_MIN_DATE) return { error: `เลือกได้ตั้งแต่ ${F43_MIN_DATE} เป็นต้นไป` };
  if (to > today) return { error: "วันที่สิ้นสุดต้องไม่เกินวันนี้" };
  const days = rangeDays(from, to);
  if (days > F43_MAX_RANGE_DAYS) {
    return { error: `เลือกช่วงได้ไม่เกิน ${F43_MAX_RANGE_DAYS} วัน (เลือกไว้ ${days} วัน)` };
  }
  return { range: { from, to, days } };
}
