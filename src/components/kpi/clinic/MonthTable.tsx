import type { ReactNode } from "react";
import type { ExcelExport } from "../overview/ExcelDownloadButton";
import { formatThaiMonthShort } from "../format";
import { ClinicPanel } from "./ClinicPanel";
import {
  type ClinicColumn,
  type ClinicExcelColumn,
  ClinicTable,
  excelHeaders,
  excelValues,
} from "./ClinicTable";

/**
 * "รายเดือน" of the /clinic/* pages: twelve fiscal months (Oct–Sep) and a
 * whole-year total row (distinct people / days of the year, not sums).
 */
export function MonthTable<R>({
  ariaLabel,
  note,
  months,
  total,
  columns,
  excelColumns,
  fileName,
  excelTitle,
  excelNotes,
  minWidthClass,
}: {
  ariaLabel: string;
  note: ReactNode;
  months: readonly (R & { month: string })[];
  total: R;
  columns: readonly ClinicColumn<R>[];
  excelColumns: readonly ClinicExcelColumn<R>[];
  fileName: string;
  excelTitle: string;
  excelNotes: string[];
  /** Literal Tailwind min-width class of the table. */
  minWidthClass: string;
}) {
  const excel: ExcelExport = {
    fileName,
    title: excelTitle,
    sheetName: "รายเดือน",
    columns: excelHeaders(["เดือน"], excelColumns),
    rows: months.map((m) => [formatThaiMonthShort(m.month), ...excelValues(excelColumns, m)]),
    footer: [["รวม", ...excelValues(excelColumns, total)]],
    notes: excelNotes,
  };

  return (
    <ClinicPanel ariaLabel={ariaLabel} title="รายเดือน" excel={excel} note={note}>
      <div className="mt-3">
        <ClinicTable<R>
          rowHeader="เดือน"
          columns={columns}
          minWidthClass={minWidthClass}
          rows={months.map((m) => ({ key: m.month, label: formatThaiMonthShort(m.month), row: m }))}
          footer={[{ key: "total", label: "รวม", row: total }]}
        />
      </div>
    </ClinicPanel>
  );
}
