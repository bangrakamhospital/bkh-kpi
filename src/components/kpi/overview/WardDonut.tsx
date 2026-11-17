import type { OverviewRange, WardOccupancy } from "@/lib/kpi/overview-types";
import { formatNumber } from "../format";
import { ExcelDownloadButton } from "./ExcelDownloadButton";
import { periodFileSuffix, periodSubtitle } from "./export-utils";
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
const avg1 = new Intl.NumberFormat("th-TH", { maximumFractionDigits: 1 });
const round1 = (v: number) => Math.round(v * 10) / 10;

const FORMULA_NOTE =
  "อัตราครองเตียง = วันนอนรวม × 100 ÷ (จำนวนเตียง × จำนวนวัน) · วันนอนนับตามวันที่อยู่ในหอจริง (รวมการย้ายหอ) · รับและจำหน่ายวันเดียวกันนับ 1 วัน · ไม่รวม Home ward";
const NEWBORN_NOTE =
  "ตึกแม่และเด็ก: ทารกแรกเกิดที่อยู่กับแม่ไม่คิดเตียง (ใช้เตียงร่วมกับแม่) · คิดเตียงเฉพาะเด็กป่วยที่ admit";

/** Inclusive day count of an ISO date range. */
function dayCount(from: string, to: string): number {
  const ms = Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`);
  return Math.max(Math.round(ms / 86_400_000) + 1, 1);
}

export function WardDonut({ wards, range }: { wards: WardOccupancy[]; range: OverviewRange }) {
  const days = dayCount(range.from, range.to);
  const multiDay = days > 1;
  const occ = (w: { patientDays: number; beds: number }) =>
    w.beds > 0 ? (w.patientDays / (w.beds * days)) * 100 : null;

  const totalDays = wards.reduce((s, w) => s + w.patientDays, 0);
  const totalPatients = wards.reduce((s, w) => s + w.patients, 0);
  const totalBeds = wards.reduce((s, w) => s + w.beds, 0);
  const nbTotal = wards.reduce((s, w) => s + w.newbornsRoomingIn, 0);
  const nbDaysTotal = wards.reduce((s, w) => s + w.newbornDaysRoomingIn, 0);
  const avgCensus = totalDays / days;
  const hasNewbornRow = wards.some((w) => w.newbornsRoomingIn > 0);

  const shares = wards.map((w) => (totalDays > 0 ? (w.patientDays / totalDays) * 100 : 0));
  const segments = wards.map((w, i) => ({
    w,
    share: shares[i],
    offset: shares.slice(0, i).reduce((s, v) => s + v, 0),
    color: PALETTE[i % PALETTE.length],
  }));

  const centerLabel = multiDay ? "เฉลี่ยคน/วัน" : "คนนอนอยู่";
  const colCount = multiDay ? 6 : 4;

  return (
    <section
      aria-label="ผู้ป่วยในตามหอผู้ป่วย"
      className="rounded-xl border border-zinc-200 bg-surface p-4 shadow-sm dark:border-zinc-800"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 className="text-base font-semibold">ผู้ป่วยในตามหอผู้ป่วย</h2>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-semibold text-brand-800 dark:bg-brand-900 dark:text-brand-100">
            {formatNumber(wards.length)} หอ · {formatNumber(days)} วัน
          </span>
          <ExcelDownloadButton
            data={{
              fileName: `ผู้ป่วยในตามหอผู้ป่วย_${periodFileSuffix(range)}`,
              title: "ผู้ป่วยในตามหอผู้ป่วย",
              sheetName: "หอผู้ป่วย",
              subtitle: `${periodSubtitle(range)} (${formatNumber(days)} วัน)`,
              columns: [
                { header: "หอผู้ป่วย" },
                { header: "ผู้ป่วย (คน)", format: "int" },
                { header: "วันนอน", format: "int" },
                { header: "เฉลี่ยคน/วัน", format: "pct" },
                { header: "เตียง", format: "int" },
                { header: "ครองเตียง (%)", format: "pct" },
                { header: "ทารกแรกเกิดอยู่กับแม่ (คน, ไม่คิดเตียง)", format: "int" },
                { header: "ทารกแรกเกิดอยู่กับแม่ (วันนอน)", format: "int" },
              ],
              rows: wards.map((w) => {
                const o = occ(w);
                return [
                  w.name,
                  w.patients,
                  w.patientDays,
                  round1(w.patientDays / days),
                  w.beds > 0 ? w.beds : null,
                  o === null ? null : round1(o),
                  w.newbornsRoomingIn,
                  w.newbornDaysRoomingIn,
                ];
              }),
              footer: [
                [
                  "รวม",
                  totalPatients,
                  totalDays,
                  round1(avgCensus),
                  totalBeds > 0 ? totalBeds : null,
                  totalBeds > 0 ? round1((totalDays / (totalBeds * days)) * 100) : null,
                  nbTotal,
                  nbDaysTotal,
                ],
              ],
              notes: [
                FORMULA_NOTE,
                NEWBORN_NOTE,
                "ผู้ป่วยที่ย้ายหอนับในทุกหอที่อยู่ ยอดรวมคนจึงอาจมากกว่าจำนวนผู้ป่วยจริง",
              ],
            }}
          />
        </div>
      </div>
      <div className="mt-3 grid items-center gap-6 md:grid-cols-[11rem_1fr]">
        <div
          role="img"
          aria-label={`แผนภูมิโดนัทวันนอนผู้ป่วยในตามหอผู้ป่วย ${centerLabel} ${avg1.format(avgCensus)} คน`}
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
                  <title>{`${s.w.name} ${formatNumber(s.w.patientDays)} วันนอน`}</title>
                </circle>
              ))}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-base font-bold tabular-nums">{avg1.format(avgCensus)}</span>
            <span className="text-xs text-zinc-600 dark:text-zinc-400">{centerLabel}</span>
          </div>
        </div>
        <div className="min-w-0 overflow-x-auto">
          <table className={tableClass}>
            <caption className="sr-only">ผู้ป่วยในตามหอผู้ป่วย {periodSubtitle(range)}</caption>
            <thead className={theadClass}>
              <tr>
                <th scope="col" className={thClass}>หอผู้ป่วย</th>
                <th scope="col" className={thRightClass}>คน</th>
                {multiDay && <th scope="col" className={thRightClass}>วันนอน</th>}
                {multiDay && <th scope="col" className={thRightClass}>เฉลี่ย/วัน</th>}
                <th scope="col" className={thRightClass}>เตียง</th>
                <th scope="col" className={thRightClass}>ครองเตียง%</th>
              </tr>
            </thead>
            <tbody>
              {segments.map((s) => {
                const o = occ(s.w);
                return (
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
                      {s.w.newbornsRoomingIn > 0 && (
                        <span className="mt-0.5 block pl-5 text-zinc-600 dark:text-zinc-400">
                          + ทารกแรกเกิดอยู่กับแม่ {formatNumber(s.w.newbornsRoomingIn)} คน
                          {multiDay && ` · ${formatNumber(s.w.newbornDaysRoomingIn)} วันนอน`} (ไม่คิดเตียง)
                        </span>
                      )}
                    </th>
                    <td className={tdRightClass}>{formatNumber(s.w.patients)}</td>
                    {multiDay && <td className={tdRightClass}>{formatNumber(s.w.patientDays)}</td>}
                    {multiDay && <td className={tdRightClass}>{avg1.format(s.w.patientDays / days)}</td>}
                    <td className={tdRightClass}>{s.w.beds > 0 ? formatNumber(s.w.beds) : "-"}</td>
                    <td className={tdRightClass}>{o === null ? "-" : `${pct1.format(o)}%`}</td>
                  </tr>
                );
              })}
              {wards.length === 0 && (
                <tr>
                  <td colSpan={colCount} className="px-3 py-6 text-center text-zinc-600 dark:text-zinc-400">
                    ไม่มีผู้ป่วยในช่วงนี้
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-400">{FORMULA_NOTE}</p>
          {hasNewbornRow && <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">{NEWBORN_NOTE}</p>}
        </div>
      </div>
    </section>
  );
}
