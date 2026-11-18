import type { StdPayGroupRow } from "@/lib/kpi/standard-clinic-types";
import type { ClinicColumn, ClinicExcelColumn } from "../clinic/ClinicTable";
import { PayGroupPanel } from "../clinic/PayGroupPanel";
import { formatBaht, formatNumber } from "../format";

/** Note of every money figure of the standard page. */
export const STANDARD_MONEY_NOTE =
  "บาท = ค่าใช้จ่ายที่ HOSxP คิดของทั้ง visit (vn_stat ทุกรายการใน vn เดียวกัน) ไม่ใช่รายรับจริง รวมค่ากายภาพ/ทันตกรรมที่ทำใน visit นั้นด้วย (หน้าคลินิกกายภาพ/ทันตกรรมนับแยกตามรายการ) ห้ามนำยอดข้ามแท็บมารวมกัน";

const NOTE = `${STANDARD_MONEY_NOTE} กลุ่มเหมาจ่ายได้รับเงินรายหัวซึ่งไม่ตรงกับยอดนี้ คนหนึ่งอาจมีหลายสิทธิ จำนวนคนของแต่ละสิทธิจึงรวมกันได้มากกว่าจำนวนคนทั้งหมด`;

interface Line {
  persons: number;
  visits: number;
  baht: number;
  bahtPerVisit: number;
  drugBaht: number;
  labBaht: number;
  otherBaht: number;
  xrayBaht: number;
  procedureBaht: number;
  dentalBaht: number;
  rehabBaht: number;
}

/** Everything except drugs and lab, in one column. */
const restOf = (r: Line) =>
  r.xrayBaht + r.procedureBaht + r.dentalBaht + r.rehabBaht + r.otherBaht;

const COLUMNS: ClinicColumn<Line>[] = [
  { header: "คน", cell: (r) => formatNumber(r.persons) },
  { header: "visit", cell: (r) => formatNumber(r.visits) },
  { header: "ค่าใช้จ่าย (บาท)", cell: (r) => formatBaht(r.baht), className: "font-semibold" },
  { header: "บาท/visit", cell: (r) => formatBaht(r.bahtPerVisit) },
  { header: "ยา (บาท)", cell: (r) => formatBaht(r.drugBaht) },
  { header: "lab (บาท)", cell: (r) => formatBaht(r.labBaht) },
  { header: "อื่นๆ (บาท)", cell: (r) => formatBaht(restOf(r)) },
];

const EXCEL: ClinicExcelColumn<Line>[] = [
  { header: "คน", format: "int", value: (r) => r.persons },
  { header: "visit", format: "int", value: (r) => r.visits },
  { header: "ค่าใช้จ่าย (บาท)", format: "int", value: (r) => r.baht },
  { header: "บาท/visit", format: "int", value: (r) => r.bahtPerVisit },
  { header: "ยา (บาท)", format: "int", value: (r) => r.drugBaht },
  { header: "lab (บาท)", format: "int", value: (r) => r.labBaht },
  { header: "รังสี (บาท)", format: "int", value: (r) => r.xrayBaht },
  { header: "หัตถการ (บาท)", format: "int", value: (r) => r.procedureBaht },
  { header: "ทันตกรรม (บาท)", format: "int", value: (r) => r.dentalBaht },
  { header: "กายภาพ (บาท)", format: "int", value: (r) => r.rehabBaht },
  { header: "อื่นๆ (บาท)", format: "int", value: (r) => r.otherBaht },
];

export function StandardPayGroupPanel({
  slug,
  label,
  groups,
  fiscalYear,
}: {
  slug: string;
  label: string;
  groups: StdPayGroupRow[];
  fiscalYear: number;
}) {
  return (
    <PayGroupPanel<Line>
      title="ค่าใช้จ่ายตามกลุ่มสิทธิ"
      note={NOTE}
      groups={groups}
      columns={COLUMNS}
      excelColumns={EXCEL}
      fileName={`clinic-${slug}-paygroup-fy${fiscalYear}`}
      excelTitle={`${label} ค่าใช้จ่ายตามกลุ่มสิทธิ ปีงบประมาณ ${fiscalYear}`}
      minWidthClass="min-w-[44rem]"
    />
  );
}
