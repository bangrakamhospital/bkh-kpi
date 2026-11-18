import type { StandardClinicSummary, StdMonthRow } from "@/lib/kpi/standard-clinic-types";
import type { ClinicColumn, ClinicExcelColumn } from "../clinic/ClinicTable";
import { MonthTable } from "../clinic/MonthTable";
import { subClass } from "../overview/table-styles";
import { formatBaht, formatDecimal, formatNumber } from "../format";

type Line = Omit<StdMonthRow, "month">;

const COLUMNS: ClinicColumn<Line>[] = [
  { header: "คน", cell: (r) => formatNumber(r.persons) },
  { header: "visit", cell: (r) => formatNumber(r.visits) },
  { header: "ค่าใช้จ่าย (บาท)", cell: (r) => formatBaht(r.baht), className: "font-semibold" },
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
  { header: "วันเปิดบริการ", cell: (r) => formatNumber(r.clinicDays) },
  {
    header: "visit/วัน (เฉลี่ย / สูงสุด)",
    cell: (r) => `${formatDecimal(r.visitsPerDay)} / ${formatNumber(r.maxVisitsPerDay)}`,
  },
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
  { header: "ค่าใช้จ่าย (บาท)", format: "int", value: (r) => r.baht },
  { header: "เต็มจำนวน (visit)", format: "int", value: (r) => r.fullVisits },
  { header: "เต็มจำนวน (บาท)", format: "int", value: (r) => r.fullBaht },
  { header: "เหมาจ่าย (visit)", format: "int", value: (r) => r.capitationVisits },
  { header: "เหมาจ่าย (บาท)", format: "int", value: (r) => r.capitationBaht },
  { header: "วันเปิดบริการ", format: "int", value: (r) => r.clinicDays },
  { header: "visit/วัน เฉลี่ย", value: (r) => Math.round(r.visitsPerDay * 10) / 10 },
  { header: "visit/วัน สูงสุด", format: "int", value: (r) => r.maxVisitsPerDay },
  { header: "นัด", format: "int", value: (r) => r.appointments },
  { header: "มาตามนัด", format: "int", value: (r) => r.appointmentsKept },
];

export function StandardMonthTable({ data }: { data: StandardClinicSummary }) {
  const { months, workload: w } = data;
  const sum = (pick: (m: StdMonthRow) => number) => months.reduce((s, m) => s + pick(m), 0);
  const total: Line = {
    persons: data.persons,
    visits: data.visits,
    baht: data.money.baht,
    fullVisits: sum((m) => m.fullVisits),
    fullBaht: sum((m) => m.fullBaht),
    capitationVisits: sum((m) => m.capitationVisits),
    capitationBaht: sum((m) => m.capitationBaht),
    clinicDays: w.clinicDays,
    visitsPerDay: w.avgVisitsPerDay,
    maxVisitsPerDay: w.maxVisitsPerDay,
    appointments: w.appointments,
    appointmentsKept: w.appointmentsKept,
  };

  return (
    <MonthTable<Line>
      ariaLabel={`${data.label} รายเดือน`}
      note="คนรายเดือนนับไม่ซ้ำภายในเดือน (ผลรวมเดือนมากกว่าคนทั้งปี) บาท = ค่าใช้จ่ายของทั้ง visit ที่ HOSxP คิด แยกตามกลุ่มสิทธิ เต็มจำนวน / เหมาจ่าย"
      months={months}
      total={total}
      columns={COLUMNS}
      excelColumns={EXCEL}
      fileName={`clinic-${data.slug}-month-fy${data.fiscalYear}`}
      excelTitle={`${data.label} รายเดือน ปีงบประมาณ ${data.fiscalYear}`}
      excelNotes={[
        "คนรายเดือนนับคนไม่ซ้ำภายในเดือน ผลรวมของเดือนจึงมากกว่าจำนวนคนทั้งปี บาท = ค่าใช้จ่ายของทั้ง visit ที่ HOSxP คิด (รวมค่ากายภาพ/ทันตกรรมที่ทำใน visit นั้น)",
      ]}
      minWidthClass="min-w-[52rem]"
    />
  );
}
