import type { PpBasicItem } from "@/lib/kpi/ppbasic-types";
import { ProgressBar } from "../ProgressBar";
import { formatBaht, formatNumber, formatPercent } from "../format";

export function PpBasicCards({ items }: { items: PpBasicItem[] }) {
  return (
    <section
      aria-label="สรุปความครอบคลุมบริการพื้นฐาน"
      className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
    >
      {items.map((it) => (
        <div
          key={it.code}
          className="min-w-0 space-y-2 rounded-xl border border-zinc-200 bg-surface p-3 shadow-sm dark:border-zinc-800"
        >
          <div className="flex items-start gap-2">
            <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-700 text-xs font-semibold text-white dark:bg-brand-500 dark:text-brand-900">
              {it.order}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">{it.name}</p>
              <p className="text-xs text-zinc-600 dark:text-zinc-400">
                {it.group}
              </p>
            </div>
            {!it.error && (
              <span className="shrink-0 text-base font-semibold text-brand-700 dark:text-brand-300">
                {formatPercent(it.percent)}%
              </span>
            )}
          </div>
          {it.error ? (
            <p
              role="alert"
              className="text-xs font-semibold text-red-700 dark:text-red-300"
            >
              {it.error}
            </p>
          ) : (
            <>
              <ProgressBar
                percent={it.percent}
                targetPercent={100}
                barClass="bg-brand-600"
                label={`ความคืบหน้า ${it.name}`}
              />
              <p className="text-xs text-zinc-600 dark:text-zinc-400">
                ทำแล้ว {formatNumber(it.done)} / เป้าหมาย {formatNumber(it.target)} {it.unit}
              </p>
              <p className="break-words text-xs text-zinc-600 dark:text-zinc-400">
                {it.money && it.money.rate !== null
                  ? `ได้แล้ว ${formatBaht(it.money.earnedBaht ?? 0)} / เป้าหมาย ${formatBaht(it.money.targetBaht ?? 0)} บาท${
                      it.money.basis === "reference"
                        ? " (มูลค่าอ้างอิง)"
                        : " (เงิน สปสช.)"
                    }`
                  : "เหมาจ่ายรายหัว ไม่มีมูลค่าเป็นเงิน"}
              </p>
              {it.money &&
                it.money.rate !== null &&
                it.money.units !== it.unit && (
                  <p className="break-words text-xs text-zinc-600 dark:text-zinc-400">
                    เงิน: นับเป็น{it.money.units} ({formatNumber(it.money.doneUnits)}/
                    {formatNumber(it.money.targetUnits)} {it.money.units})
                    {it.money.outOfAreaUnits !== undefined
                      ? ` รวมนอกเขต ${formatNumber(it.money.outOfAreaUnits)} ${it.money.units}`
                      : ""}
                    {" "}ส่วนร้อยละนับเป็น{it.unit}ในเขต
                  </p>
                )}
            </>
          )}
        </div>
      ))}
    </section>
  );
}
