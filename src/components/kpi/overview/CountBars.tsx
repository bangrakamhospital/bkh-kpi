import type { NamedCount } from "@/lib/kpi/overview-types";
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

const TOP_N = 15;
const pct1 = new Intl.NumberFormat("th-TH", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

interface Row {
  key: string;
  name: string;
  visits: number;
}

function group(items: NamedCount[], otherLabel: (n: number) => string): Row[] {
  const rows: Row[] = items.slice(0, TOP_N).map((i) => ({ key: i.code, name: i.name, visits: i.visits }));
  const rest = items.slice(TOP_N);
  if (rest.length > 0) {
    rows.push({
      key: "__other",
      name: otherLabel(rest.length),
      visits: rest.reduce((s, i) => s + i.visits, 0),
    });
  }
  return rows;
}

function CountBars({
  title,
  unit,
  items,
  otherLabel,
  colHeader,
}: {
  title: string;
  unit: string;
  items: NamedCount[];
  otherLabel: (n: number) => string;
  colHeader: string;
}) {
  const rows = group(items, otherLabel);
  const total = items.reduce((s, i) => s + i.visits, 0);
  const max = rows.reduce((m, r) => Math.max(m, r.visits), 0);
  const pct = (v: number) => (total > 0 ? (v / total) * 100 : 0);

  const chart =
    rows.length === 0 ? (
      <p className="py-6 text-center text-xs text-zinc-600 dark:text-zinc-400">ไม่มีข้อมูล</p>
    ) : (
      <ul role="img" aria-label={`แผนภูมิแท่งแนวนอน ${title}`} className="space-y-1.5">
        {rows.map((r) => (
          <li key={r.key} className="flex items-center gap-2 text-xs">
            <span className="w-32 shrink-0 truncate sm:w-40" title={r.name}>
              {r.name}
            </span>
            <span className="h-4 min-w-0 flex-1 rounded-sm bg-zinc-100 dark:bg-zinc-800">
              <span
                className={`block h-full rounded-sm ${
                  r.key === "__other" ? "bg-zinc-400 dark:bg-zinc-600" : "bg-emerald-500 dark:bg-emerald-500/80"
                }`}
                style={{ width: `${max > 0 ? (r.visits / max) * 100 : 0}%` }}
              />
            </span>
            <span className="w-24 shrink-0 text-right tabular-nums">
              {formatNumber(r.visits)} · {pct1.format(pct(r.visits))}%
            </span>
          </li>
        ))}
      </ul>
    );

  const table = (
    <table className={tableClass}>
      <caption className="sr-only">{title}</caption>
      <thead className={theadClass}>
        <tr>
          <th scope="col" className={thClass}>{colHeader}</th>
          <th scope="col" className={thRightClass}>visit</th>
          <th scope="col" className={thRightClass}>ร้อยละ</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.key} className={trClass}>
            <th scope="row" className={`${tdClass} text-left font-normal`}>{r.name}</th>
            <td className={tdRightClass}>{formatNumber(r.visits)}</td>
            <td className={tdRightClass}>{pct1.format(pct(r.visits))}%</td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  return (
    <ChartCard
      title={title}
      badge={`${formatNumber(items.length)} ${unit}`}
      chart={chart}
      table={table}
    />
  );
}

export function DepartmentBars({ items }: { items: NamedCount[] }) {
  return (
    <CountBars
      title="visit ตามแผนก"
      unit="แผนก"
      items={items}
      otherLabel={(n) => `อื่นๆ (${formatNumber(n)} แผนก)`}
      colHeader="แผนก"
    />
  );
}

export function PttypeBars({ items }: { items: NamedCount[] }) {
  return (
    <CountBars
      title="visit ตามกองทุน"
      unit="กองทุน"
      items={items}
      otherLabel={(n) => `อื่นๆ (${formatNumber(n)} กองทุน)`}
      colHeader="กองทุน"
    />
  );
}
