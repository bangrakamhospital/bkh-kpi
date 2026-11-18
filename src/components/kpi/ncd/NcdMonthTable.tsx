import type { NcdMonthRow } from "@/lib/kpi/ncd-clinic-types";
import type { ClinicColumn, ClinicExcelColumn } from "../clinic/ClinicTable";
import { MonthTable } from "../clinic/MonthTable";
import { subClass } from "../overview/table-styles";
import { formatBaht, formatDecimal, formatNumber } from "../format";

const overClass = "font-semibold text-amber-800 dark:text-amber-300";

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

const columns = (targetPerDay: number): ClinicColumn<NcdMonthTotal>[] => [
  { header: "คน", cell: (r) => formatNumber(r.persons) },
  { header: "visit", cell: (r) => formatNumber(r.visits) },
  {
    header: "เต็มจำนวน (visit)",
    cell: (r) => (
      <>
        {formatNumber(r.fullVisits)}
        <span className={subClass}>{formatBaht(r.fullBaht)} บาท</span>
      </>
    ),
  },
  {
    header: "เหมาจ่าย (visit)",
    cell: (r) => (
      <>
        {formatNumber(r.capitationVisits)}
        <span className={subClass}>{formatBaht(r.capitationBaht)} บาท</span>
      </>
    ),
  },
  { header: "วันคลินิก", cell: (r) => formatNumber(r.clinicDays) },
  {
    header: "visit/วัน เฉลี่ย",
    cell: (r) => formatDecimal(r.visitsPerDay),
    className: (r) => (r.visitsPerDay > targetPerDay ? overClass : ""),
  },
  {
    header: "visit/วัน สูงสุด",
    cell: (r) => formatNumber(r.maxVisitsPerDay),
    className: (r) => (r.maxVisitsPerDay > targetPerDay ? overClass : ""),
  },
];

const EXCEL: ClinicExcelColumn<NcdMonthTotal>[] = [
  { header: "คน", format: "int", value: (r) => r.persons },
  { header: "visit", format: "int", value: (r) => r.visits },
  { header: "เต็มจำนวน (visit)", format: "int", value: (r) => r.fullVisits },
  { header: "เต็มจำนวน (บาท)", format: "int", value: (r) => r.fullBaht },
  { header: "เหมาจ่าย (visit)", format: "int", value: (r) => r.capitationVisits },
  { header: "เหมาจ่าย (บาท)", format: "int", value: (r) => r.capitationBaht },
  { header: "วันคลินิก", format: "int", value: (r) => r.clinicDays },
  { header: "visit/วัน เฉลี่ย", value: (r) => Math.round(r.visitsPerDay * 10) / 10 },
  { header: "visit/วัน สูงสุด", format: "int", value: (r) => r.maxVisitsPerDay },
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
  return (
    <MonthTable<NcdMonthTotal>
      ariaLabel="NCD Clinic รายเดือน"
      note={`คนรายเดือนนับไม่ซ้ำภายในเดือน (ผลรวมเดือนมากกว่าคนทั้งปี) ค่า visit/วัน ที่เกิน ${formatNumber(targetPerDay)} แสดงเป็นสีส้ม บาท = ค่าใช้จ่ายที่ HOSxP คิด`}
      months={months}
      total={total}
      columns={columns(targetPerDay)}
      excelColumns={EXCEL}
      fileName={`ncd-month-fy${fiscalYear}`}
      excelTitle={`NCD Clinic รายเดือน ปีงบประมาณ ${fiscalYear}`}
      excelNotes={[
        "คนรายเดือนนับคนไม่ซ้ำภายในเดือน ผลรวมของเดือนจึงมากกว่าจำนวนคนทั้งปี บาท = ค่าใช้จ่ายที่ HOSxP คิด",
        `visit/วัน เกิน ${targetPerDay} เป็นสีส้มในหน้าเว็บ`,
      ]}
      minWidthClass="min-w-[48rem]"
    />
  );
}
