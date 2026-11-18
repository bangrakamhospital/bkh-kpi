import type { StandardClinicSummary, StdUnitFigures } from "@/lib/kpi/standard-clinic-types";
import type { ExcelExport } from "../overview/ExcelDownloadButton";
import { mutedClass } from "../overview/table-styles";
import { ClinicPanel } from "../clinic/ClinicPanel";
import {
  type ClinicColumn,
  type ClinicExcelColumn,
  type ClinicTableRow,
  ClinicTable,
  excelHeaders,
  excelValues,
} from "../clinic/ClinicTable";
import { formatBaht, formatNumber } from "../format";

const COLUMNS: ClinicColumn<StdUnitFigures>[] = [
  { header: "คน", cell: (r) => formatNumber(r.persons) },
  { header: "visit", cell: (r) => formatNumber(r.visits) },
  { header: "ค่าใช้จ่าย (บาท)", cell: (r) => formatBaht(r.baht) },
  { header: "บาท/visit", cell: (r) => formatBaht(r.bahtPerVisit) },
];

const EXCEL: ClinicExcelColumn<StdUnitFigures>[] = [
  { header: "คน", format: "int", value: (r) => r.persons },
  { header: "visit", format: "int", value: (r) => r.visits },
  { header: "ค่าใช้จ่าย (บาท)", format: "int", value: (r) => r.baht },
  { header: "บาท/visit", format: "int", value: (r) => r.bahtPerVisit },
];

const NOTE =
  "แยกตามแผนกที่ลงทะเบียน visit (ovst.main_dep) คนนับไม่ซ้ำภายในแต่ละแถว คนหนึ่งอาจมาหลายแผนก ผลรวมคนของแถวจึงมากกว่าคนทั้งหมด";

/** "แยกตามแผนก": sub-units, with their departments indented below. */
export function StandardUnitTable({ data }: { data: StandardClinicSummary }) {
  if (data.units.length === 0) return null;
  const total: StdUnitFigures = {
    persons: data.persons,
    visits: data.visits,
    baht: data.money.baht,
    bahtPerVisit: data.bahtPerVisit,
  };

  const rows: ClinicTableRow<StdUnitFigures>[] = data.units.flatMap((u) => [
    { key: u.name, label: u.name, row: u },
    ...u.departments.map((d) => ({
      key: `${u.name}-${d.depcode}`,
      label: (
        <span className={mutedClass}>
          {d.name} ({d.depcode})
        </span>
      ),
      labelClassName: "pl-6 font-normal",
      row: d,
    })),
  ]);

  const excel: ExcelExport = {
    fileName: `clinic-${data.slug}-units-fy${data.fiscalYear}`,
    title: `${data.label} แยกตามแผนก ปีงบประมาณ ${data.fiscalYear}`,
    sheetName: "แยกตามแผนก",
    columns: excelHeaders(["หน่วย", "แผนก"], EXCEL),
    rows: data.units.flatMap((u) => [
      [u.name, "รวม", ...excelValues(EXCEL, u)],
      ...u.departments.map((d) => [u.name, `${d.name} (${d.depcode})`, ...excelValues(EXCEL, d)]),
    ]),
    footer: [["รวมทั้งหมด", "", ...excelValues(EXCEL, total)]],
    notes: [NOTE],
  };

  return (
    <ClinicPanel title="แยกตามแผนก" excel={excel} note={NOTE}>
      <div className="mt-3">
        <ClinicTable<StdUnitFigures>
          rowHeader="หน่วย / แผนก"
          columns={COLUMNS}
          rows={rows}
          footer={[{ key: "total", label: "รวมทั้งหมด", row: total }]}
          minWidthClass="min-w-[36rem]"
        />
      </div>
    </ClinicPanel>
  );
}
