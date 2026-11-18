import type { PtPayGroupRow } from "@/lib/kpi/pt-clinic-types";
import type { ClinicColumn, ClinicExcelColumn } from "../clinic/ClinicTable";
import { PayGroupPanel } from "../clinic/PayGroupPanel";
import { mutedClass } from "../overview/table-styles";
import { formatBaht, formatNumber } from "../format";

const NOTE =
  "ค่ากายภาพ = รายการในทะเบียนกายภาพ (physic_items: หัตถการกายภาพและกายอุปกรณ์) ที่ HOSxP คิดใน visit กายภาพ ไม่ใช่รายรับจริง กลุ่มเหมาจ่ายได้รับเงินรายหัว ไม่ตรงกับยอดนี้ \"ค่าอื่นของ visit\" (ยา, lab, คลินิกอื่นใน vn เดียวกัน) เป็นข้อมูลประกอบเท่านั้น ซ้อนกับคลินิกอื่น (เช่น NCD) ห้ามนำไปรวมกัน คนหนึ่งอาจมีหลายสิทธิ";

interface Line {
  persons: number;
  visits: number;
  ptBaht: number;
  ptBahtPerVisit: number;
  otherBaht: number;
}

const COLUMNS: ClinicColumn<Line>[] = [
  { header: "คน", cell: (r) => formatNumber(r.persons) },
  { header: "visit", cell: (r) => formatNumber(r.visits) },
  { header: "ค่ากายภาพ (บาท)", cell: (r) => formatBaht(r.ptBaht), className: "font-semibold" },
  { header: "บาท/visit", cell: (r) => formatBaht(r.ptBahtPerVisit) },
  { header: "ค่าอื่นของ visit (บาท)", cell: (r) => formatBaht(r.otherBaht), className: mutedClass },
];

const EXCEL: ClinicExcelColumn<Line>[] = [
  { header: "คน", format: "int", value: (r) => r.persons },
  { header: "visit", format: "int", value: (r) => r.visits },
  { header: "ค่ากายภาพ (บาท)", format: "int", value: (r) => r.ptBaht },
  { header: "ค่ากายภาพ/visit (บาท)", format: "int", value: (r) => r.ptBahtPerVisit },
  { header: "ค่าอื่นของ visit (บาท, ข้อมูลประกอบ)", format: "int", value: (r) => r.otherBaht },
];

export function PtPayGroupPanel({
  groups,
  fiscalYear,
}: {
  groups: PtPayGroupRow[];
  fiscalYear: number;
}) {
  return (
    <PayGroupPanel<Line>
      title="ค่าบริการกายภาพตามกลุ่มสิทธิ"
      note={NOTE}
      groups={groups}
      columns={COLUMNS}
      excelColumns={EXCEL}
      fileName={`pt-paygroup-fy${fiscalYear}`}
      excelTitle={`คลินิกกายภาพ ค่าบริการตามกลุ่มสิทธิ ปีงบประมาณ ${fiscalYear}`}
      minWidthClass="min-w-[40rem]"
    />
  );
}
