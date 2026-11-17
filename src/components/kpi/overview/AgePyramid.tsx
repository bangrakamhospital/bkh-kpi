import type { AgeSexBand, OverviewRange } from "@/lib/kpi/overview-types";
import { formatNumber } from "../format";
import { ChartCard } from "./ChartCard";
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

export function AgePyramid({ bands, range }: { bands: AgeSexBand[]; range: OverviewRange }) {
  const total = bands.reduce((s, b) => s + b.male + b.female, 0);
  const max = bands.reduce((m, b) => Math.max(m, b.male, b.female), 0);
  const rows = [...bands].reverse(); // oldest at top
  const width = (v: number) => `${max > 0 ? (v / max) * 100 : 0}%`;

  const chart = (
    <div role="img" aria-label={`พีระมิดประชากรผู้รับบริการตามเพศและอายุ รวม ${formatNumber(total)} คน`}>
      <div className="mb-1 grid grid-cols-[1fr_4rem_1fr] gap-2 text-xs font-semibold">
        <span className="text-right text-sky-700 dark:text-sky-300">ชาย</span>
        <span className="text-center text-zinc-600 dark:text-zinc-400">อายุ</span>
        <span className="text-left text-pink-700 dark:text-pink-300">หญิง</span>
      </div>
      <ul className="space-y-1">
        {rows.map((b) => (
          <li key={b.band} className="grid grid-cols-[1fr_4rem_1fr] items-center gap-2 text-xs">
            <div className="flex items-center justify-end gap-1.5">
              <span className="tabular-nums">{formatNumber(b.male)}</span>
              <span className="flex h-4 w-full max-w-[70%] justify-end">
                <span className="block h-full rounded-sm bg-sky-500 dark:bg-sky-400" style={{ width: width(b.male) }} />
              </span>
            </div>
            <span className="text-center tabular-nums text-zinc-600 dark:text-zinc-400">{b.band}</span>
            <div className="flex items-center gap-1.5">
              <span className="flex h-4 w-full max-w-[70%]">
                <span className="block h-full rounded-sm bg-pink-500 dark:bg-pink-400" style={{ width: width(b.female) }} />
              </span>
              <span className="tabular-nums">{formatNumber(b.female)}</span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );

  const table = (
    <table className={tableClass}>
      <caption className="sr-only">ผู้รับบริการตามเพศและอายุ</caption>
      <thead className={theadClass}>
        <tr>
          <th scope="col" className={thClass}>อายุ</th>
          <th scope="col" className={thRightClass}>ชาย</th>
          <th scope="col" className={thRightClass}>หญิง</th>
          <th scope="col" className={thRightClass}>รวม</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((b) => (
          <tr key={b.band} className={trClass}>
            <th scope="row" className={`${tdClass} text-left font-normal`}>{b.band}</th>
            <td className={tdRightClass}>{formatNumber(b.male)}</td>
            <td className={tdRightClass}>{formatNumber(b.female)}</td>
            <td className={tdRightClass}>{formatNumber(b.male + b.female)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  return (
    <ChartCard
      title="ผู้รับบริการตามเพศและอายุ"
      badge={`รวม ${formatNumber(total)} คน`}
      chart={chart}
      table={table}
      excel={{
        fileName: `ผู้รับบริการตามเพศและอายุ_${periodFileSuffix(range)}`,
        title: "ผู้รับบริการตามเพศและอายุ",
        sheetName: "เพศและอายุ",
        subtitle: periodSubtitle(range),
        columns: [
          { header: "กลุ่มอายุ (ปี)" },
          { header: "ชาย (คน)", format: "int" },
          { header: "หญิง (คน)", format: "int" },
          { header: "รวม (คน)", format: "int" },
        ],
        rows: rows.map((b) => [b.band, b.male, b.female, b.male + b.female]),
        footer: [
          [
            "รวม",
            bands.reduce((s, b) => s + b.male, 0),
            bands.reduce((s, b) => s + b.female, 0),
            total,
          ],
        ],
        notes: ["นับผู้รับบริการไม่ซ้ำคน (HN) ในช่วงวันที่ที่เลือก · ที่มา: HOSxP"],
      }}
    />
  );
}
