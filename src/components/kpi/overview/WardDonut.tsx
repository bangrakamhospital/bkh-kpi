import type { WardOccupancy } from "@/lib/kpi/overview-types";
import { formatNumber } from "../format";
import {
  tableClass,
  tdClass,
  tdRightClass,
  theadClass,
  thClass,
  thRightClass,
  trClass,
} from "./table-styles";

const PALETTE = [
  "#2563eb", "#f59e0b", "#10b981", "#ef4444", "#8b5cf6",
  "#06b6d4", "#ec4899", "#84cc16", "#f97316", "#64748b",
];

const RADIUS = 15.915; // circumference ~= 100 so dash lengths are percentages
const pct1 = new Intl.NumberFormat("th-TH", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export function WardDonut({ wards }: { wards: WardOccupancy[] }) {
  const total = wards.reduce((s, w) => s + w.patients, 0);
  const shares = wards.map((w) => (total > 0 ? (w.patients / total) * 100 : 0));
  const segments = wards.map((w, i) => ({
    w,
    share: shares[i],
    offset: shares.slice(0, i).reduce((s, v) => s + v, 0),
    color: PALETTE[i % PALETTE.length],
  }));

  return (
    <section
      aria-label="ผู้ป่วยในตามหอผู้ป่วย"
      className="rounded-xl border border-zinc-200 bg-surface p-4 shadow-sm dark:border-zinc-800"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 className="text-base font-semibold">ผู้ป่วยในตามหอผู้ป่วย</h2>
        <span className="rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-semibold text-brand-800 dark:bg-brand-900 dark:text-brand-100">
          {formatNumber(wards.length)} หอ
        </span>
      </div>
      <div className="mt-3 grid items-center gap-6 md:grid-cols-[11rem_1fr]">
        <div
          role="img"
          aria-label={`แผนภูมิโดนัทผู้ป่วยในตามหอผู้ป่วย รวม ${formatNumber(total)} คน`}
          className="relative mx-auto h-44 w-44"
        >
          <svg viewBox="0 0 36 36" className="h-full w-full -rotate-90">
            <circle
              cx="18"
              cy="18"
              r={RADIUS}
              fill="none"
              strokeWidth="5"
              className="stroke-zinc-100 dark:stroke-zinc-800"
            />
            {segments
              .filter((s) => s.share > 0)
              .map((s) => (
                <circle
                  key={s.w.ward}
                  cx="18"
                  cy="18"
                  r={RADIUS}
                  fill="none"
                  strokeWidth="5"
                  stroke={s.color}
                  strokeDasharray={`${s.share} ${100 - s.share}`}
                  strokeDashoffset={-s.offset}
                >
                  <title>{`${s.w.name} ${formatNumber(s.w.patients)} คน`}</title>
                </circle>
              ))}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-base font-bold tabular-nums">{formatNumber(total)}</span>
            <span className="text-xs text-zinc-600 dark:text-zinc-400">คนนอนอยู่</span>
          </div>
        </div>
        <div className="min-w-0 overflow-x-auto">
          <table className={tableClass}>
            <caption className="sr-only">ผู้ป่วยในตามหอผู้ป่วย</caption>
            <thead className={theadClass}>
              <tr>
                <th scope="col" className={thClass}>หอผู้ป่วย</th>
                <th scope="col" className={thRightClass}>คน</th>
                <th scope="col" className={thRightClass}>เตียง</th>
                <th scope="col" className={thRightClass}>ครองเตียง%</th>
              </tr>
            </thead>
            <tbody>
              {segments.map((s) => (
                <tr key={s.w.ward} className={trClass}>
                  <th scope="row" className={`${tdClass} text-left font-normal`}>
                    <span className="inline-flex items-center gap-2">
                      <span
                        aria-hidden="true"
                        className="h-3 w-3 shrink-0 rounded-sm"
                        style={{ backgroundColor: s.color }}
                      />
                      {s.w.name}
                    </span>
                  </th>
                  <td className={tdRightClass}>{formatNumber(s.w.patients)}</td>
                  <td className={tdRightClass}>{s.w.beds > 0 ? formatNumber(s.w.beds) : "-"}</td>
                  <td className={tdRightClass}>
                    {s.w.beds > 0 ? `${pct1.format((s.w.patients / s.w.beds) * 100)}%` : "-"}
                  </td>
                </tr>
              ))}
              {wards.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-3 py-6 text-center text-zinc-600 dark:text-zinc-400">
                    ไม่มีผู้ป่วยในขณะนี้
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
