import type { DentalMonthRow } from "@/lib/kpi/dental-clinic-types";
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
import { formatBaht, formatNumber, formatThaiMonthShort } from "../format";

const footClass =
  "border-t-2 border-zinc-300 bg-zinc-50 font-semibold dark:border-zinc-700 dark:bg-zinc-900";
const subClass = "block text-xs font-normal text-zinc-600 dark:text-zinc-400";

type Line = Omit<DentalMonthRow, "month">;

function Cells({ r }: { r: Line }) {
  return (
    <>
      <td className={tdRightClass}>{formatNumber(r.persons)}</td>
      <td className={tdRightClass}>{formatNumber(r.visits)}</td>
      <td className={tdRightClass}>{formatNumber(r.hospitalVisits)}</td>
      <td className={tdRightClass}>{formatNumber(r.outreachVisits)}</td>
      <td className={tdRightClass}>{formatNumber(r.procedures)}</td>
      <td className={tdRightClass}>{formatBaht(r.baht)}</td>
      <td className={tdRightClass}>
        {formatNumber(r.fullVisits)}
        <span className={subClass}>{formatBaht(r.fullBaht)} บาท</span>
      </td>
      <td className={tdRightClass}>
        {formatNumber(r.capitationVisits)}
        <span className={subClass}>{formatBaht(r.capitationBaht)} บาท</span>
      </td>
    </>
  );
}

const excelValues = (r: Line) => [
  r.persons,
  r.visits,
  r.hospitalVisits,
  r.outreachVisits,
  r.procedures,
  r.baht,
  r.fullVisits,
  r.fullBaht,
  r.capitationVisits,
  r.capitationBaht,
];

export function DentalMonthTable({
  months,
  persons,
  fiscalYear,
}: {
  months: DentalMonthRow[];
  /** Distinct people of the year (not the sum of the months). */
  persons: number;
  fiscalYear: number;
}) {
  const sum = (pick: (m: DentalMonthRow) => number) => months.reduce((s, m) => s + pick(m), 0);
  const total: Line = {
    persons,
    visits: sum((m) => m.visits),
    hospitalVisits: sum((m) => m.hospitalVisits),
    outreachVisits: sum((m) => m.outreachVisits),
    procedures: sum((m) => m.procedures),
    baht: sum((m) => m.baht),
    fullVisits: sum((m) => m.fullVisits),
    fullBaht: sum((m) => m.fullBaht),
    capitationVisits: sum((m) => m.capitationVisits),
    capitationBaht: sum((m) => m.capitationBaht),
  };

  const excel: ExcelExport = {
    fileName: `dental-month-fy${fiscalYear}`,
    title: `คลินิกทันตกรรม รายเดือน ปีงบประมาณ ${fiscalYear}`,
    sheetName: "รายเดือน",
    columns: [
      { header: "เดือน" },
      { header: "คน", format: "int" },
      { header: "visit", format: "int" },
      { header: "ในโรงพยาบาล (visit)", format: "int" },
      { header: "ออกหน่วย (visit)", format: "int" },
      { header: "หัตถการ", format: "int" },
      { header: "ค่าบริการ (บาท)", format: "int" },
      { header: "เต็มจำนวน (visit)", format: "int" },
      { header: "เต็มจำนวน (บาท)", format: "int" },
      { header: "เหมาจ่าย (visit)", format: "int" },
      { header: "เหมาจ่าย (บาท)", format: "int" },
    ],
    rows: months.map((m) => [formatThaiMonthShort(m.month), ...excelValues(m)]),
    footer: [["รวม", ...excelValues(total)]],
    notes: [
      "คนรายเดือนนับไม่ซ้ำภายในเดือน ผลรวมของเดือนจึงมากกว่าคนทั้งปี บาท = ค่าบริการที่ห้องฟันคิดใน HOSxP",
    ],
  };

  return (
    <section
      aria-label="คลินิกทันตกรรม รายเดือน"
      className="min-w-0 rounded-xl border border-zinc-200 bg-surface p-4 shadow-sm dark:border-zinc-800"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 className="text-base font-semibold">รายเดือน</h2>
        <ExcelDownloadButton data={excel} />
      </div>
      <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
        คนรายเดือนนับไม่ซ้ำภายในเดือน (ผลรวมเดือนมากกว่าคนทั้งปี) งานออกหน่วยกระจุกตามรอบโรงเรียน บาท = ค่าบริการที่ห้องฟันคิดใน HOSxP
      </p>
      <div className="mt-3 overflow-x-auto">
        <table className={`${tableClass} min-w-[52rem]`}>
          <thead className={theadClass}>
            <tr>
              <th scope="col" className={thClass}>เดือน</th>
              <th scope="col" className={thRightClass}>คน</th>
              <th scope="col" className={thRightClass}>visit</th>
              <th scope="col" className={thRightClass}>ในโรงพยาบาล</th>
              <th scope="col" className={thRightClass}>ออกหน่วย</th>
              <th scope="col" className={thRightClass}>หัตถการ</th>
              <th scope="col" className={thRightClass}>ค่าบริการ (บาท)</th>
              <th scope="col" className={thRightClass}>เต็มจำนวน (visit)</th>
              <th scope="col" className={thRightClass}>เหมาจ่าย (visit)</th>
            </tr>
          </thead>
          <tbody>
            {months.map((m) => (
              <tr key={m.month} className={trClass}>
                <th scope="row" className={`${tdClass} text-left font-medium`}>
                  {formatThaiMonthShort(m.month)}
                </th>
                <Cells r={m} />
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className={footClass}>
              <th scope="row" className={`${tdClass} text-left`}>รวม</th>
              <Cells r={total} />
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}
