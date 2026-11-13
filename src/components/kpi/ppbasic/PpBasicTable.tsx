import type { PpBasicItem } from "@/lib/kpi/ppbasic-types";
import { ProgressBar } from "../ProgressBar";
import { formatNumber, formatPercent } from "../format";
import {
  tableClass,
  tdClass,
  tdRightClass,
  theadClass,
  thClass,
  thRightClass,
  trClass,
} from "../overview/table-styles";
import { PpBasicVillageButton } from "./PpBasicVillageButton";

const NONE = "—";

export function PpBasicTable({
  items,
  fiscalYear,
}: {
  items: PpBasicItem[];
  fiscalYear: number;
}) {
  return (
    <section
      aria-label="รายการบริการพื้นฐาน P&P"
      className="min-w-0 rounded-xl border border-zinc-200 bg-surface p-4 shadow-sm dark:border-zinc-800"
    >
      <h2 className="text-base font-semibold">รายการบริการพื้นฐาน P&amp;P</h2>
      <div className="mt-3 overflow-x-auto">
        <table className={`${tableClass} min-w-[52rem]`}>
          <thead className={theadClass}>
            <tr>
              <th scope="col" className={thClass}>รายการ</th>
              <th scope="col" className={thClass}>กลุ่มเป้าหมาย</th>
              <th scope="col" className={thRightClass}>เป้าหมาย</th>
              <th scope="col" className={thRightClass}>ทำแล้ว</th>
              <th scope="col" className={thRightClass}>ร้อยละ</th>
              <th scope="col" className={thClass}>ความคืบหน้า</th>
              <th scope="col" className={thClass}>รายหมู่บ้าน</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => (
              <tr key={it.code} className={trClass}>
                <td className={tdClass}>
                  <div className="min-w-0 space-y-0.5">
                    <p className="font-medium">
                      {it.order}. {it.name}
                    </p>
                    <p className="text-xs text-zinc-600 dark:text-zinc-400">
                      {it.condition}
                    </p>
                    {it.caveat && (
                      <p className="text-xs text-zinc-600 dark:text-zinc-400">
                        {it.caveat}
                      </p>
                    )}
                    {it.error && (
                      <p
                        role="alert"
                        className="text-xs font-semibold text-red-700 dark:text-red-300"
                      >
                        {it.error}
                      </p>
                    )}
                  </div>
                </td>
                <td className={tdClass}>{it.group}</td>
                <td className={tdRightClass}>
                  {it.error ? NONE : `${formatNumber(it.target)} ${it.unit}`}
                </td>
                <td className={tdRightClass}>
                  {it.error ? NONE : `${formatNumber(it.done)} ${it.unit}`}
                </td>
                <td className={tdRightClass}>
                  {it.error ? NONE : `${formatPercent(it.percent)}%`}
                </td>
                <td className={tdClass}>
                  {it.error ? (
                    NONE
                  ) : (
                    <ProgressBar
                      percent={it.percent}
                      targetPercent={100}
                      barClass="bg-brand-600"
                      label={`ความคืบหน้า ${it.name}`}
                    />
                  )}
                </td>
                <td className={tdClass}>
                  {!it.error && it.villages.length > 0 ? (
                    <PpBasicVillageButton
                      code={it.code}
                      name={it.name}
                      unit={it.unit}
                      fiscalYear={fiscalYear}
                      villages={it.villages}
                    />
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
