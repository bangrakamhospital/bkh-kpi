import type { DentalMonthRow } from "@/lib/kpi/dental-clinic-types";
import type { ClinicColumn, ClinicExcelColumn } from "../clinic/ClinicTable";
import { MonthTable } from "../clinic/MonthTable";
import { subClass } from "../overview/table-styles";
import { formatBaht, formatNumber } from "../format";

type Line = Omit<DentalMonthRow, "month">;

const COLUMNS: ClinicColumn<Line>[] = [
  { header: "คน", cell: (r) => formatNumber(r.persons) },
  { header: "visit", cell: (r) => formatNumber(r.visits) },
  { header: "ในโรงพยาบาล", cell: (r) => formatNumber(r.hospitalVisits) },
  { header: "ออกหน่วย", cell: (r) => formatNumber(r.outreachVisits) },
  { header: "หัตถการ", cell: (r) => formatNumber(r.procedures) },
  { header: "ค่าบริการ (บาท)", cell: (r) => formatBaht(r.baht) },
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
];

const EXCEL: ClinicExcelColumn<Line>[] = [
  { header: "คน", format: "int", value: (r) => r.persons },
  { header: "visit", format: "int", value: (r) => r.visits },
  { header: "ในโรงพยาบาล (visit)", format: "int", value: (r) => r.hospitalVisits },
  { header: "ออกหน่วย (visit)", format: "int", value: (r) => r.outreachVisits },
  { header: "หัตถการ", format: "int", value: (r) => r.procedures },
  { header: "ค่าบริการ (บาท)", format: "int", value: (r) => r.baht },
  { header: "เต็มจำนวน (visit)", format: "int", value: (r) => r.fullVisits },
  { header: "เต็มจำนวน (บาท)", format: "int", value: (r) => r.fullBaht },
  { header: "เหมาจ่าย (visit)", format: "int", value: (r) => r.capitationVisits },
  { header: "เหมาจ่าย (บาท)", format: "int", value: (r) => r.capitationBaht },
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

  return (
    <MonthTable<Line>
      ariaLabel="คลินิกทันตกรรม รายเดือน"
      note="คนรายเดือนนับไม่ซ้ำภายในเดือน (ผลรวมเดือนมากกว่าคนทั้งปี) งานออกหน่วยกระจุกตามรอบโรงเรียน บาท = ค่าบริการที่ห้องฟันคิดใน HOSxP"
      months={months}
      total={total}
      columns={COLUMNS}
      excelColumns={EXCEL}
      fileName={`dental-month-fy${fiscalYear}`}
      excelTitle={`คลินิกทันตกรรม รายเดือน ปีงบประมาณ ${fiscalYear}`}
      excelNotes={[
        "คนรายเดือนนับไม่ซ้ำภายในเดือน ผลรวมของเดือนจึงมากกว่าคนทั้งปี บาท = ค่าบริการที่ห้องฟันคิดใน HOSxP",
      ]}
      minWidthClass="min-w-[52rem]"
    />
  );
}
