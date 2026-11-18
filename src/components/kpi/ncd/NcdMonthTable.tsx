import type { NcdMonthRow } from "@/lib/kpi/ncd-clinic-types";
import { ExcelDownloadButton, type ExcelExport } from "../overview/ExcelDownloadButton";
import {
  tableClass,
  tdClass,
  tdRightClass,
  theadClass,
  thClass,
  thRightClass,
  trClass,
} from "../overview/table-styles";
import { formatBaht, formatDecimal, formatNumber, formatThaiMonthShort } from "../format";

const footClass =
  "border-t-2 border-zinc-300 bg-zinc-50 font-semibold dark:border-zinc-700 dark:bg-zinc-900";
const overClass = "font-semibold text-amber-800 dark:text-amber-300";
const subClass = "block text-xs font-normal text-zinc-600 dark:text-zinc-400";

/** Whole-year figures for the footer row (distinct people / days are not sums). */
export interface NcdMonthTotal {
  persons: number;
  visits: number;
  fullVisits: number;
  fullBaht: number;
  capitationVisits: number;
  capitationBaht: number;
  clinicDays: number;
  visitsPerDay: number;
  maxVisitsPerDay: number;
}

function Cells({
  r,
  targetPerDay,
}: {
  r: NcdMonthTotal;
  targetPerDay: number;
}) {
  return (
    <>
      <td className={tdRightClass}>{formatNumber(r.persons)}</td>
      <td className={tdRightClass}>{formatNumber(r.visits)}</td>
      <td className={tdRightClass}>
        {formatNumber(r.fullVisits)}
        <span className={subClass}>{formatBaht(r.fullBaht)} บาท</span>
      </td>
      <td className={tdRightClass}>
        {formatNumber(r.capitationVisits)}
        <span className={subClass}>{formatBaht(r.capitationBaht)} บาท</span>
      </td>
      <td className={tdRightClass}>{formatNumber(r.clinicDays)}</td>
      <td className={`${tdRightClass} ${r.visitsPerDay > targetPerDay ? overClass : ""}`}>
        {formatDecimal(r.visitsPerDay)}
      </td>
      <td className={`${tdRightClass} ${r.maxVisitsPerDay > targetPerDay ? overClass : ""}`}>
        {formatNumber(r.maxVisitsPerDay)}
      </td>
    </>
  );
}

const excelValues = (r: NcdMonthTotal) => [
  r.persons,
  r.visits,
  r.fullVisits,
  r.fullBaht,
  r.capitationVisits,
  r.capitationBaht,
  r.clinicDays,
  r.visitsPerDay,
  r.maxVisitsPerDay,
];

export function NcdMonthTable({
  months,
  total,
  fiscalYear,
  targetPerDay,
}: {
  months: NcdMonthRow[];
  total: NcdMonthTotal;
  fiscalYear: number;
  targetPerDay: number;
}) {
  const excel: ExcelExport = {
    fileName: `ncd-month-fy${fiscalYear}`,
    title: `NCD Clinic รายเดือน ปีงบประมาณ ${fiscalYear}`,
    sheetName: "รายเดือน",
    columns: [
      { header: "เดือน" },
      { header: "คน", format: "int" },
      { header: "visit", format: "int" },
      { header: "เต็มจำนวน (visit)", format: "int" },
      { header: "เต็มจำนวน (บาท)", format: "int" },
      { header: "เหมาจ่าย (visit)", format: "int" },
      { header: "เหมาจ่าย (บาท)", format: "int" },
      { header: "วันคลินิก", format: "int" },
      { header: "visit/วัน เฉลี่ย" },
      { header: "visit/วัน สูงสุด", format: "int" },
    ],
    rows: months.map((m) => [
      formatThaiMonthShort(m.month),
      ...excelValues(m).map((v, i) => (i === 7 ? Math.round(v * 10) / 10 : v)),
    ]),
    footer: [
      ["รวม", ...excelValues(total).map((v, i) => (i === 7 ? Math.round(v * 10) / 10 : v))],
    ],
    notes: [
      "คนรายเดือนนับคนไม่ซ้ำภายในเดือน ผลรวมของเดือนจึงมากกว่าจำนวนคนทั้งปี บาท = ค่าใช้จ่ายที่ HOSxP คิด",
      `visit/วัน เกิน ${targetPerDay} เป็นสีส้มในหน้าเว็บ`,
    ],
  };

  return (
    <section
      aria-label="NCD Clinic รายเดือน"
      className="min-w-0 rounded-xl border border-zinc-200 bg-surface p-4 shadow-sm dark:border-zinc-800"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 className="text-base font-semibold">รายเดือน</h2>
        <ExcelDownloadButton data={excel} />
      </div>
      <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
        คนรายเดือนนับไม่ซ้ำภายในเดือน (ผลรวมเดือนมากกว่าคนทั้งปี) ค่า visit/วัน ที่เกิน {formatNumber(targetPerDay)} แสดงเป็นสีส้ม บาท = ค่าใช้จ่ายที่ HOSxP คิด
      </p>
      <div className="mt-3 overflow-x-auto">
        <table className={`${tableClass} min-w-[48rem]`}>
          <thead className={theadClass}>
            <tr>
              <th scope="col" className={thClass}>เดือน</th>
              <th scope="col" className={thRightClass}>คน</th>
              <th scope="col" className={thRightClass}>visit</th>
              <th scope="col" className={thRightClass}>เต็มจำนวน (visit)</th>
              <th scope="col" className={thRightClass}>เหมาจ่าย (visit)</th>
              <th scope="col" className={thRightClass}>วันคลินิก</th>
              <th scope="col" className={thRightClass}>visit/วัน เฉลี่ย</th>
              <th scope="col" className={thRightClass}>visit/วัน สูงสุด</th>
            </tr>
          </thead>
          <tbody>
            {months.map((m) => (
              <tr key={m.month} className={trClass}>
                <th scope="row" className={`${tdClass} text-left font-medium`}>
                  {formatThaiMonthShort(m.month)}
                </th>
                <Cells r={m} targetPerDay={targetPerDay} />
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className={footClass}>
              <th scope="row" className={`${tdClass} text-left`}>รวม</th>
              <Cells r={total} targetPerDay={targetPerDay} />
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}
