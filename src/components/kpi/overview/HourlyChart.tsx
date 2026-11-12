import type { HourlyVisit } from "@/lib/kpi/overview-types";
import { formatNumber } from "../format";
import { ChartCard } from "./ChartCard";
import {
  tableClass,
  tdClass,
  tdRightClass,
  theadClass,
  thClass,
  thRightClass,
  trClass,
} from "./table-styles";

/** Round max up to a "nice" value divisible by 4 so the 4 gridlines are clean. */
function niceMax(max: number): number {
  if (max <= 4) return 4;
  const step = 10 ** Math.floor(Math.log10(max / 4));
  const raw = max / 4 / step;
  const nice = raw <= 1 ? 1 : raw <= 2 ? 2 : raw <= 5 ? 5 : 10;
  return nice * step * 4;
}

const hh = (h: number) => `${String(h).padStart(2, "0")}:00`;

export function HourlyChart({ hourly }: { hourly: HourlyVisit[] }) {
  const peak = hourly.reduce<HourlyVisit | null>(
    (best, h) => (best === null || h.visits > best.visits ? h : best),
    null,
  );
  const hasPeak = peak !== null && peak.visits > 0;
  const top = niceMax(peak?.visits ?? 0);
  const ticks = [0, 1, 2, 3, 4].map((i) => (top / 4) * i);
  const peakText = hasPeak
    ? `สูงสุด ${hh(peak.hour)} น. · ${formatNumber(peak.visits)} visit`
    : "ไม่มีข้อมูล";

  const chart = (
    <div>
      <p className="mb-2 text-right text-xs text-zinc-600 dark:text-zinc-400">{peakText}</p>
      <div
        role="img"
        aria-label={`แผนภูมิแท่งจำนวน visit รายชั่วโมง ${peakText}`}
        className="flex gap-2"
      >
        <div className="relative h-48 w-10 shrink-0 text-xs text-zinc-600 dark:text-zinc-400">
          {ticks.map((t) => (
            <span
              key={t}
              className="absolute right-0 translate-y-1/2 tabular-nums"
              style={{ bottom: `${(t / top) * 100}%` }}
            >
              {formatNumber(t)}
            </span>
          ))}
        </div>
        <div className="min-w-0 flex-1">
          <div className="relative h-48 border-b border-zinc-300 dark:border-zinc-700">
            {ticks.slice(1).map((t) => (
              <div
                key={t}
                className="absolute inset-x-0 border-t border-dashed border-zinc-200 dark:border-zinc-800"
                style={{ bottom: `${(t / top) * 100}%` }}
              />
            ))}
            <div className="absolute inset-0 flex items-end gap-0.5">
              {hourly.map((h) => (
                <div key={h.hour} className="flex h-full flex-1 items-end">
                  <div
                    title={`${hh(h.hour)} น. · ${formatNumber(h.visits)} visit`}
                    className={`w-full rounded-t-sm ${
                      hasPeak && h.hour === peak.hour
                        ? "bg-emerald-600 dark:bg-emerald-400"
                        : "bg-emerald-500/80 dark:bg-emerald-500/70"
                    }`}
                    style={{ height: `${(h.visits / top) * 100}%` }}
                  />
                </div>
              ))}
            </div>
          </div>
          <div className="mt-1 flex gap-0.5 text-xs text-zinc-600 dark:text-zinc-400">
            {hourly.map((h) => (
              <span key={h.hour} className="flex-1 text-center tabular-nums">
                {String(h.hour).padStart(2, "0")}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );

  const table = (
    <table className={tableClass}>
      <caption className="sr-only">จำนวน visit รายชั่วโมง</caption>
      <thead className={theadClass}>
        <tr>
          <th scope="col" className={thClass}>ช่วงเวลา</th>
          <th scope="col" className={thRightClass}>visit</th>
        </tr>
      </thead>
      <tbody>
        {hourly.map((h) => (
          <tr key={h.hour} className={trClass}>
            <th scope="row" className={`${tdClass} text-left font-normal`}>{hh(h.hour)} น.</th>
            <td className={tdRightClass}>{formatNumber(h.visits)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  return <ChartCard title="ช่วงเวลาที่มารับบริการ" chart={chart} table={table} />;
}
