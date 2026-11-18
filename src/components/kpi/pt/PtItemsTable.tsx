import type { PtItemRow } from "@/lib/kpi/pt-clinic-types";
import { ExcelDownloadButton, type ExcelExport } from "../overview/ExcelDownloadButton";
import {
  chipClass,
  footClass,
  mutedClass,
  tableClass,
  tdClass,
  tdRightClass,
  thClass,
  theadClass,
  thRightClass,
  trClass,
} from "../overview/table-styles";
import { formatBaht, formatNumber, formatPercent } from "../format";

/** Rows shown on the page (all rows go to the Excel file). */
const TOP = 15;

const GROUP: Record<PtItemRow["group"], { label: string; tone: string }> = {
  PT: {
    label: "กายภาพบำบัด",
    tone: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-300",
  },
  ORTHOTIC: {
    label: "กายอุปกรณ์",
    tone: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300",
  },
};

export function PtItemsTable({ items, fiscalYear }: { items: PtItemRow[]; fiscalYear: number }) {
  const totalBaht = items.reduce((s, r) => s + r.baht, 0);
  const totalQty = items.reduce((s, r) => s + r.qty, 0);
  const byGroup = (g: PtItemRow["group"]) =>
    items.filter((r) => r.group === g).reduce((s, r) => s + r.baht, 0);
  const top = items.slice(0, TOP);
  const share = (b: number) => (totalBaht > 0 ? (b / totalBaht) * 100 : 0);

  const excel: ExcelExport = {
    fileName: `pt-items-fy${fiscalYear}`,
    title: `คลินิกกายภาพ รายการบริการ ปีงบประมาณ ${fiscalYear}`,
    sheetName: "รายการ",
    columns: [
      { header: "รหัส" },
      { header: "รายการ" },
      { header: "หมวด" },
      { header: "หน่วย", format: "int" },
      { header: "visit", format: "int" },
      { header: "คน", format: "int" },
      { header: "บาท", format: "int" },
      { header: "ร้อยละของค่ากายภาพ", format: "pct" },
    ],
    rows: items.map((r) => [
      r.icode,
      r.name,
      GROUP[r.group].label,
      r.qty,
      r.visits,
      r.persons,
      r.baht,
      Math.round(share(r.baht) * 10) / 10,
    ]),
    footer: [["", "รวม", "", totalQty, null, null, totalBaht, 100]],
    notes: [
      "รายการ = icode ที่อยู่ในทะเบียนกายภาพ (physic_items) คิดใน opitemrece ของ visit กายภาพ หน่วย = opitemrece.qty บาท = ค่าที่ HOSxP คิด",
    ],
  };

  return (
    <section
      aria-label="รายการบริการกายภาพ"
      className="min-w-0 rounded-xl border border-zinc-200 bg-surface p-4 shadow-sm dark:border-zinc-800"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 className="text-base font-semibold">รายการบริการ / หัตถการ</h2>
        <ExcelDownloadButton data={excel} />
      </div>
      <p className={`mt-1 text-xs ${mutedClass}`}>
        {formatNumber(items.length)} รายการ · กายภาพบำบัด {formatBaht(byGroup("PT"))} บาท · กายอุปกรณ์{" "}
        {formatBaht(byGroup("ORTHOTIC"))} บาท · แสดง {formatNumber(Math.min(TOP, items.length))} รายการแรกตามยอดบาท (ทั้งหมดใน Excel)
      </p>
      <div className="mt-3 overflow-x-auto">
        <table className={`${tableClass} min-w-[44rem]`}>
          <thead className={theadClass}>
            <tr>
              <th scope="col" className={thClass}>รายการ</th>
              <th scope="col" className={thClass}>หมวด</th>
              <th scope="col" className={thRightClass}>หน่วย</th>
              <th scope="col" className={thRightClass}>visit</th>
              <th scope="col" className={thRightClass}>คน</th>
              <th scope="col" className={thRightClass}>บาท</th>
              <th scope="col" className={thRightClass}>สัดส่วน</th>
            </tr>
          </thead>
          <tbody>
            {top.map((r) => (
              <tr key={r.icode} className={trClass}>
                <th scope="row" className={`${tdClass} text-left font-medium`}>
                  {r.name}
                  <span className={`block text-xs font-normal ${mutedClass}`}>{r.icode}</span>
                </th>
                <td className={tdClass}>
                  <span className={`${chipClass} ${GROUP[r.group].tone}`}>{GROUP[r.group].label}</span>
                </td>
                <td className={tdRightClass}>{formatNumber(r.qty)}</td>
                <td className={tdRightClass}>{formatNumber(r.visits)}</td>
                <td className={tdRightClass}>{formatNumber(r.persons)}</td>
                <td className={`${tdRightClass} font-semibold`}>{formatBaht(r.baht)}</td>
                <td className={tdRightClass}>{formatPercent(share(r.baht))}%</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className={footClass}>
              <th scope="row" colSpan={2} className={`${tdClass} text-left`}>
                รวมทุกรายการ
              </th>
              <td className={tdRightClass}>{formatNumber(totalQty)}</td>
              <td className={tdRightClass} />
              <td className={tdRightClass} />
              <td className={tdRightClass}>{formatBaht(totalBaht)}</td>
              <td className={tdRightClass}>100%</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}
