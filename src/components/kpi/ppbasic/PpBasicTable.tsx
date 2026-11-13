import type { PpBasicItem, PpBasicRateBasis } from "@/lib/kpi/ppbasic-types";
import { ProgressBar } from "../ProgressBar";
import { formatBaht, formatNumber, formatPercent } from "../format";
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

const chipClass =
  "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold";

const BASIS_INFO: Record<PpBasicRateBasis, { label: string; cls: string }> = {
  nhso: {
    label: "อัตรา สปสช.",
    cls: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-300",
  },
  reference: {
    label: "มูลค่าอ้างอิง",
    cls: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300",
  },
  unset: {
    label: "เหมาจ่ายรายหัว",
    cls: "bg-zinc-200 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-300",
  },
};

const subClass = "block text-xs text-zinc-600 dark:text-zinc-400";

function BahtCell({
  value,
  error,
}: {
  value: number | null | undefined;
  error: boolean;
}) {
  return <>{error || value === null || value === undefined ? NONE : formatBaht(value)}</>;
}

export function PpBasicTable({
  items,
  fiscalYear,
}: {
  items: PpBasicItem[];
  fiscalYear: number;
}) {
  const withMoney = items.filter((it) => !it.error && it.money);
  const nhsoRates = withMoney
    .filter((it) => it.money?.basis === "nhso" && it.money.rate !== null)
    .map((it) => `${it.name} ${formatBaht(it.money?.rate ?? 0)} บาท ${it.money?.rateUnit}`);
  const hasDoseMoney = withMoney.some(
    (it) => it.money?.outOfAreaUnits !== undefined,
  );
  const noteParts = [
    nhsoRates.length > 0 ? `อัตรา สปสช.: ${nhsoRates.join(", ")}` : null,
    hasDoseMoney
      ? "เงินวัคซีนนับเป็นเข็ม รวมเด็กนอกเขต ส่วนร้อยละนับเป็นคนในเขต"
      : null,
  ].filter((p): p is string => p !== null);
  const noteText = noteParts.join(" | ");

  return (
    <section
      aria-label="รายการบริการพื้นฐาน P&P"
      className="min-w-0 rounded-xl border border-zinc-200 bg-surface p-4 shadow-sm dark:border-zinc-800"
    >
      <h2 className="text-base font-semibold">รายการบริการพื้นฐาน P&amp;P</h2>
      {noteText && (
        <p className="mt-1 break-words text-xs text-zinc-600 dark:text-zinc-400">
          {noteText}
        </p>
      )}
      <div className="mt-3 overflow-x-auto">
        <table className={`${tableClass} min-w-[76rem]`}>
          <thead className={theadClass}>
            <tr>
              <th scope="col" className={thClass}>รายการ</th>
              <th scope="col" className={thClass}>กลุ่มเป้าหมาย</th>
              <th scope="col" className={thRightClass}>เป้าหมาย</th>
              <th scope="col" className={thRightClass}>ทำแล้ว</th>
              <th scope="col" className={thRightClass}>ร้อยละ</th>
              <th scope="col" className={thRightClass}>อัตรา (บาท)</th>
              <th scope="col" className={thRightClass}>เป้าหมาย (บาท)</th>
              <th scope="col" className={thRightClass}>ได้แล้ว (บาท)</th>
              <th scope="col" className={thRightClass}>ยังไม่ได้ (บาท)</th>
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
                    <p className="break-words text-xs text-zinc-600 dark:text-zinc-400">
                      {it.condition}
                    </p>
                    {it.caveat && (
                      <p className="break-words text-xs text-zinc-600 dark:text-zinc-400">
                        {it.caveat}
                      </p>
                    )}
                    {!it.error && it.money && (
                      <>
                        <span
                          title={it.money.rateNote}
                          className={`${chipClass} ${BASIS_INFO[it.money.basis].cls}`}
                        >
                          {BASIS_INFO[it.money.basis].label}
                        </span>
                        <p className="break-words text-xs text-zinc-600 dark:text-zinc-400">
                          {it.money.rateNote}
                        </p>
                      </>
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
                <td className={tdRightClass}>
                  {it.error || !it.money || it.money.rate === null ? (
                    NONE
                  ) : (
                    <>
                      {formatBaht(it.money.rate)}
                      <span className={subClass}>{it.money.rateUnit}</span>
                    </>
                  )}
                </td>
                <td className={tdRightClass}>
                  <BahtCell value={it.money?.targetBaht} error={!!it.error} />
                </td>
                <td className={tdRightClass}>
                  <BahtCell value={it.money?.earnedBaht} error={!!it.error} />
                  {!it.error && it.money && it.money.units !== it.unit && (
                    <span className={subClass}>
                      ได้ {formatNumber(it.money.doneUnits)} /{" "}
                      {formatNumber(it.money.targetUnits)} {it.money.units}
                    </span>
                  )}
                  {!it.error && it.money?.outOfAreaUnits !== undefined && (
                    <span className={subClass}>
                      นอกเขต {formatNumber(it.money.outOfAreaUnits)} {it.money.units}
                    </span>
                  )}
                </td>
                <td className={tdRightClass}>
                  <BahtCell value={it.money?.gapBaht} error={!!it.error} />
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
