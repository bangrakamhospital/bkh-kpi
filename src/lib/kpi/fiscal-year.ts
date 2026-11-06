/**
 * Thai government fiscal year helpers (1 Oct – 30 Sep).
 * Fiscal year is expressed in Buddhist Era (BE = CE + 543) and is named
 * after the calendar year in which it ends: FY 2570 = 2026-10-01 .. 2027-09-30.
 *
 * Pure functions, no I/O — safe for server and client.
 */

export const BE_OFFSET = 543;
export const HOSPITAL_TIME_ZONE = "Asia/Bangkok";

/** Today's date as "YYYY-MM-DD" in the hospital time zone. */
export function todayIsoDate(now: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: HOSPITAL_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** Fiscal year (BE) that contains the given ISO date "YYYY-MM-DD". */
export function fiscalYearOf(isoDate: string): number {
  const year = Number(isoDate.slice(0, 4));
  const month = Number(isoDate.slice(5, 7));
  const fyCe = month >= 10 ? year + 1 : year;
  return fyCe + BE_OFFSET;
}

export interface FiscalYearRange {
  /** "YYYY-MM-DD" — 1 Oct of the previous CE year. */
  start: string;
  /** "YYYY-MM-DD" — 30 Sep. */
  end: string;
  /** 12 months "YYYY-MM" ordered Oct -> Sep. */
  months: string[];
}

export function fiscalYearRange(fiscalYearBe: number): FiscalYearRange {
  const endCe = fiscalYearBe - BE_OFFSET;
  const startCe = endCe - 1;
  const months: string[] = [];
  for (let i = 0; i < 12; i++) {
    const m = ((9 + i) % 12) + 1; // 10,11,12,1,...,9
    const y = m >= 10 ? startCe : endCe;
    months.push(`${y}-${String(m).padStart(2, "0")}`);
  }
  return { start: `${startCe}-10-01`, end: `${endCe}-09-30`, months };
}

/** Number of days in a "YYYY-MM" month. */
export function daysInMonth(month: string): number {
  const y = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7));
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}
