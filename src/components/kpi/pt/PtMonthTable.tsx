import type { PtClinicSummary, PtMonthRow } from "@/lib/kpi/pt-clinic-types";
import type { ClinicColumn, ClinicExcelColumn } from "../clinic/ClinicTable";
import { MonthTable } from "../clinic/MonthTable";
import { subClass } from "../overview/table-styles";
import { formatBaht, formatDecimal, formatNumber } from "../format";

type Line = Omit<PtMonthRow, "month">;

const COLUMNS: ClinicColumn<Line>[] = [
  { header: "คน", cell: (r) => formatNumber(r.persons) },
  {
    header: "visit",
    cell: (r) => (
      <>
        {formatNumber(r.visits)}
        <span className={subClass}>ห้องกายภาพ {formatNumber(r.depVisits)}</span>
      </>
    ),
  },
  { header: "ค่ากายภาพ (บาท)", cell: (r) => formatBaht(r.ptBaht), className: "font-semibold" },
  {
    header: "เต็มจำนวน (visit)",
    cell: (r) => (
      <>
        {formatNumber(r.fullVisits)}
        <span className={subClass}>{formatBaht(r.fullPtBaht)} บาท</span>
      </>
    ),
  },
  {
    header: "เหมาจ่าย (visit)",
    cell: (r) => (
      <>
        {formatNumber(r.capitationVisits)}
        <span className={subClass}>{formatBaht(r.capitationPtBaht)} บาท</span>
      </>
    ),
  },
  { header: "วันให้บริการ", cell: (r) => formatNumber(r.serviceDays) },
  { header: "visit/วัน", cell: (r) => formatDecimal(r.visitsPerDay) },
  {
    header: "มาตามนัด",
    cell: (r) => (
      <>
        {formatNumber(r.appointmentsKept)}
        <span className={subClass}>จาก {formatNumber(r.appointments)}</span>
      </>
    ),
  },
];

const EXCEL: ClinicExcelColumn<Line>[] = [
  { header: "คน", format: "int", value: (r) => r.persons },
  { header: "visit", format: "int", value: (r) => r.visits },
  { header: "visit ห้องกายภาพ", format: "int", value: (r) => r.depVisits },
  { header: "ค่ากายภาพ (บาท)", format: "int", value: (r) => r.ptBaht },
  { header: "เต็มจำนวน (visit)", format: "int", value: (r) => r.fullVisits },
  { header: "เต็มจำนวน (บาท)", format: "int", value: (r) => r.fullPtBaht },
  { header: "เหมาจ่าย (visit)", format: "int", value: (r) => r.capitationVisits },
  { header: "เหมาจ่าย (บาท)", format: "int", value: (r) => r.capitationPtBaht },
  { header: "วันให้บริการ", format: "int", value: (r) => r.serviceDays },
  { header: "visit/วัน", value: (r) => Math.round(r.visitsPerDay * 10) / 10 },
  { header: "นัด", format: "int", value: (r) => r.appointments },
  { header: "มาตามนัด", format: "int", value: (r) => r.appointmentsKept },
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

  return (
    <MonthTable<Line>
      ariaLabel="คลินิกกายภาพ รายเดือน"
      note="คนรายเดือนนับไม่ซ้ำภายในเดือน (ผลรวมเดือนมากกว่าคนทั้งปี) บาท = ค่ากายภาพที่ HOSxP คิด แยกตามกลุ่มสิทธิ เต็มจำนวน / เหมาจ่าย"
      months={months}
      total={total}
      columns={COLUMNS}
      excelColumns={EXCEL}
      fileName={`pt-month-fy${data.fiscalYear}`}
      excelTitle={`คลินิกกายภาพ รายเดือน ปีงบประมาณ ${data.fiscalYear}`}
      excelNotes={[
        "คนรายเดือนนับคนไม่ซ้ำภายในเดือน ผลรวมของเดือนจึงมากกว่าจำนวนคนทั้งปี บาท = ค่ากายภาพที่ HOSxP คิด (รายการ physic_items)",
      ]}
      minWidthClass="min-w-[52rem]"
    />
  );
}
