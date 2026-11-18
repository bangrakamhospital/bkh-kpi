import type { PtClinicSummary, PtMonthRow } from "@/lib/kpi/pt-clinic-types";
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
const subClass = "block text-xs font-normal text-zinc-600 dark:text-zinc-400";

type Line = Omit<PtMonthRow, "month">;

function Cells({ r }: { r: Line }) {
  return (
    <>
      <td className={tdRightClass}>{formatNumber(r.persons)}</td>
      <td className={tdRightClass}>
        {formatNumber(r.visits)}
        <span className={subClass}>ห้องกายภาพ {formatNumber(r.depVisits)}</span>
      </td>
      <td className={`${tdRightClass} font-semibold`}>{formatBaht(r.ptBaht)}</td>
      <td className={tdRightClass}>
        {formatNumber(r.fullVisits)}
        <span className={subClass}>{formatBaht(r.fullPtBaht)} บาท</span>
      </td>
      <td className={tdRightClass}>
        {formatNumber(r.capitationVisits)}
        <span className={subClass}>{formatBaht(r.capitationPtBaht)} บาท</span>
      </td>
      <td className={tdRightClass}>{formatNumber(r.serviceDays)}</td>
      <td className={tdRightClass}>{formatDecimal(r.visitsPerDay)}</td>
      <td className={tdRightClass}>
        {formatNumber(r.appointmentsKept)}
        <span className={subClass}>จาก {formatNumber(r.appointments)}</span>
      </td>
    </>
  );
}

const excelValues = (r: Line) => [
  r.persons,
  r.visits,
  r.depVisits,
  r.ptBaht,
  r.fullVisits,
  r.fullPtBaht,
  r.capitationVisits,
  r.capitationPtBaht,
  r.serviceDays,
  Math.round(r.visitsPerDay * 10) / 10,
  r.appointments,
  r.appointmentsKept,
];

export function PtMonthTable({ data }: { data: PtClinicSummary }) {
  const { months } = data;
  const sum = (pick: (m: PtMonthRow) => number) => months.reduce((s, m) => s + pick(m), 0);
  const total: Line = {
    persons: data.persons,
    visits: data.visits,
    depVisits: data.depVisits,
    ptBaht: data.money.ptBaht,
    fullVisits: sum((m) => m.fullVisits),
    fullPtBaht: sum((m) => m.fullPtBaht),
    capitationVisits: sum((m) => m.capitationVisits),
    capitationPtBaht: sum((m) => m.capitationPtBaht),
    serviceDays: data.workload.serviceDays,
    visitsPerDay: data.workload.avgVisitsPerDay,
    appointments: data.workload.appointments,
    appointmentsKept: data.workload.appointmentsKept,
  };

  const excel: ExcelExport = {
    fileName: `pt-month-fy${data.fiscalYear}`,
    title: `คลินิกกายภาพ รายเดือน ปีงบประมาณ ${data.fiscalYear}`,
    sheetName: "รายเดือน",
    columns: [
      { header: "เดือน" },
      { header: "คน", format: "int" },
      { header: "visit", format: "int" },
      { header: "visit ห้องกายภาพ", format: "int" },
      { header: "ค่ากายภาพ (บาท)", format: "int" },
      { header: "เต็มจำนวน (visit)", format: "int" },
      { header: "เต็มจำนวน (บาท)", format: "int" },
      { header: "เหมาจ่าย (visit)", format: "int" },
      { header: "เหมาจ่าย (บาท)", format: "int" },
      { header: "วันให้บริการ", format: "int" },
      { header: "visit/วัน" },
      { header: "นัด", format: "int" },
      { header: "มาตามนัด", format: "int" },
    ],
    rows: months.map((m) => [formatThaiMonthShort(m.month), ...excelValues(m)]),
    footer: [["รวม", ...excelValues(total)]],
    notes: [
      "คนรายเดือนนับคนไม่ซ้ำภายในเดือน ผลรวมของเดือนจึงมากกว่าจำนวนคนทั้งปี บาท = ค่ากายภาพที่ HOSxP คิด (รายการ physic_items)",
    ],
  };

  return (
    <section
      aria-label="คลินิกกายภาพ รายเดือน"
      className="min-w-0 rounded-xl border border-zinc-200 bg-surface p-4 shadow-sm dark:border-zinc-800"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 className="text-base font-semibold">รายเดือน</h2>
        <ExcelDownloadButton data={excel} />
      </div>
      <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
        คนรายเดือนนับไม่ซ้ำภายในเดือน (ผลรวมเดือนมากกว่าคนทั้งปี) บาท = ค่ากายภาพที่ HOSxP คิด แยกตามกลุ่มสิทธิ เต็มจำนวน / เหมาจ่าย
      </p>
      <div className="mt-3 overflow-x-auto">
        <table className={`${tableClass} min-w-[52rem]`}>
          <thead className={theadClass}>
            <tr>
              <th scope="col" className={thClass}>เดือน</th>
              <th scope="col" className={thRightClass}>คน</th>
              <th scope="col" className={thRightClass}>visit</th>
              <th scope="col" className={thRightClass}>ค่ากายภาพ (บาท)</th>
              <th scope="col" className={thRightClass}>เต็มจำนวน (visit)</th>
              <th scope="col" className={thRightClass}>เหมาจ่าย (visit)</th>
              <th scope="col" className={thRightClass}>วันให้บริการ</th>
              <th scope="col" className={thRightClass}>visit/วัน</th>
              <th scope="col" className={thRightClass}>มาตามนัด</th>
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
