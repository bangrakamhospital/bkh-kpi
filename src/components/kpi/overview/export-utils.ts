import type { OverviewRange } from "@/lib/kpi/overview-types";
import { formatThaiDate } from "../format";

/** Subtitle line for Excel reports: the selected date range in Thai (พ.ศ.). */
export function periodSubtitle(range: OverviewRange): string {
  return range.from === range.to
    ? `วันที่ ${formatThaiDate(range.from)}`
    : `ช่วงวันที่ ${formatThaiDate(range.from)} - ${formatThaiDate(range.to)}`;
}

/** File-name suffix from the range, e.g. "2026-11-01_2026-11-17". */
export function periodFileSuffix(range: OverviewRange): string {
  return range.from === range.to ? range.from : `${range.from}_${range.to}`;
}

/** Percent rounded to 1 decimal (number, for Excel). */
export function pct1(part: number, total: number): number {
  return total > 0 ? Math.round((part / total) * 1000) / 10 : 0;
}
