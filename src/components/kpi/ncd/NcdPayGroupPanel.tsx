import type { NcdPayGroupRow } from "@/lib/kpi/ncd-clinic-types";
import type { ClinicColumn, ClinicExcelColumn } from "../clinic/ClinicTable";
import { PayGroupPanel } from "../clinic/PayGroupPanel";
import { formatBaht, formatNumber } from "../format";

const NOTE =
  "บาท = ค่าใช้จ่ายที่ HOSxP คิดของ visit (ทุกรายการใน vn เดียวกัน) ไม่ใช่รายรับจริง กลุ่มเหมาจ่ายได้รับเงินรายหัวซึ่งไม่ตรงกับยอดนี้ คนหนึ่งอาจมีหลายสิทธิ จำนวนคนของแต่ละสิทธิจึงรวมกันได้มากกว่าจำนวนคนทั้งหมด";

interface Line {
  persons: number;
  visits: number;
  baht: number;
  bahtPerVisit: number;
  drugBaht: number;
  labBaht: number;
  otherBaht: number;
}

const COLUMNS: ClinicColumn<Line>[] = [
  { header: "คน", cell: (r) => formatNumber(r.persons) },
  { header: "visit", cell: (r) => formatNumber(r.visits) },
  { header: "ค่าใช้จ่าย (บาท)", cell: (r) => formatBaht(r.baht) },
  { header: "บาท/visit", cell: (r) => formatBaht(r.bahtPerVisit) },
  { header: "ยา (บาท)", cell: (r) => formatBaht(r.drugBaht) },
  { header: "lab (บาท)", cell: (r) => formatBaht(r.labBaht) },
  { header: "อื่นๆ (บาท)", cell: (r) => formatBaht(r.otherBaht) },
];

const EXCEL: ClinicExcelColumn<Line>[] = [
  { header: "คน", format: "int", value: (r) => r.persons },
  { header: "visit", format: "int", value: (r) => r.visits },
  { header: "ค่าใช้จ่าย (บาท)", format: "int", value: (r) => r.baht },
  { header: "บาท/visit", format: "int", value: (r) => r.bahtPerVisit },
  { header: "ยา (บาท)", format: "int", value: (r) => r.drugBaht },
  { header: "lab (บาท)", format: "int", value: (r) => r.labBaht },
  { header: "อื่นๆ (บาท)", format: "int", value: (r) => r.otherBaht },
];

export function NcdPayGroupPanel({
  groups,
  fiscalYear,
}: {
  groups: NcdPayGroupRow[];
  fiscalYear: number;
}) {
  return (
    <PayGroupPanel<Line>
      title="ค่าใช้จ่ายตามกลุ่มสิทธิ"
      note={NOTE}
      groups={groups}
      columns={COLUMNS}
      excelColumns={EXCEL}
      fileName={`ncd-paygroup-fy${fiscalYear}`}
      excelTitle={`NCD Clinic ค่าใช้จ่ายตามกลุ่มสิทธิ ปีงบประมาณ ${fiscalYear}`}
      minWidthClass="min-w-[44rem]"
    />
  );
}
