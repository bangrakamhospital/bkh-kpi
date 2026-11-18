import type { DentalPayGroupRow } from "@/lib/kpi/dental-clinic-types";
import type { ClinicColumn, ClinicExcelColumn } from "../clinic/ClinicTable";
import { PayGroupPanel } from "../clinic/PayGroupPanel";
import { formatBaht, formatNumber } from "../format";

const NOTE =
  "บาท = ค่าบริการที่ห้องฟันคิดใน HOSxP ไม่ใช่รายรับจริง กลุ่มเหมาจ่ายได้รับเงินรายหัว (และค่าบริการทันตกรรมบางรายการจ่ายแยกตามรายการ) ซึ่งไม่ตรงกับยอดนี้ สิทธิใช้กติกาเดียวกับคลินิกโรคเรื้อรัง คนหนึ่งอาจมีหลายสิทธิ จำนวนคนรวมกันจึงมากกว่าคนทั้งหมด";

interface Line {
  persons: number;
  visits: number;
  baht: number;
  bahtPerVisit: number;
  dentalFeeBaht: number;
  prosthesisBaht: number;
  procedureBaht: number;
  drugBaht: number;
  xrayBaht: number;
  otherBaht: number;
}

const COLUMNS: ClinicColumn<Line>[] = [
  { header: "คน", cell: (r) => formatNumber(r.persons) },
  { header: "visit", cell: (r) => formatNumber(r.visits) },
  { header: "ค่าบริการ (บาท)", cell: (r) => formatBaht(r.baht) },
  { header: "บาท/visit", cell: (r) => formatBaht(r.bahtPerVisit) },
  { header: "ทันตกรรม (บาท)", cell: (r) => formatBaht(r.dentalFeeBaht) },
  { header: "ฟันเทียม (บาท)", cell: (r) => formatBaht(r.prosthesisBaht) },
  { header: "หัตถการ (บาท)", cell: (r) => formatBaht(r.procedureBaht) },
  // drugs + x-ray + other (small amounts) in one column
  { header: "ยา/รังสี/อื่นๆ (บาท)", cell: (r) => formatBaht(r.drugBaht + r.xrayBaht + r.otherBaht) },
];

const EXCEL: ClinicExcelColumn<Line>[] = [
  { header: "คน", format: "int", value: (r) => r.persons },
  { header: "visit", format: "int", value: (r) => r.visits },
  { header: "ค่าบริการ (บาท)", format: "int", value: (r) => r.baht },
  { header: "บาท/visit", format: "int", value: (r) => r.bahtPerVisit },
  { header: "ค่าทันตกรรม (บาท)", format: "int", value: (r) => r.dentalFeeBaht },
  { header: "ฟันเทียม/อวัยวะเทียม (บาท)", format: "int", value: (r) => r.prosthesisBaht },
  { header: "หัตถการ (บาท)", format: "int", value: (r) => r.procedureBaht },
  { header: "ยา (บาท)", format: "int", value: (r) => r.drugBaht },
  { header: "รังสี (บาท)", format: "int", value: (r) => r.xrayBaht },
  { header: "อื่นๆ (บาท)", format: "int", value: (r) => r.otherBaht },
];

export function DentalPayGroupPanel({
  groups,
  fiscalYear,
}: {
  groups: DentalPayGroupRow[];
  fiscalYear: number;
}) {
  return (
    <PayGroupPanel<Line>
      title="ค่าบริการตามกลุ่มสิทธิ"
      note={NOTE}
      groups={groups}
      columns={COLUMNS}
      excelColumns={EXCEL}
      fileName={`dental-paygroup-fy${fiscalYear}`}
      excelTitle={`คลินิกทันตกรรม ค่าบริการตามกลุ่มสิทธิ ปีงบประมาณ ${fiscalYear}`}
      minWidthClass="min-w-[50rem]"
    />
  );
}
