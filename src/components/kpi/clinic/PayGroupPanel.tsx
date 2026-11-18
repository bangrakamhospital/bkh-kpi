import type { ClinicPayGroupCode, ClinicSchemeCode } from "@/lib/kpi/clinic-scheme-types";
import type { ExcelExport } from "../overview/ExcelDownloadButton";
import { chipClass, mutedClass, subClass } from "../overview/table-styles";
import { ClinicPanel } from "./ClinicPanel";
import {
  type ClinicColumn,
  type ClinicExcelColumn,
  ClinicTable,
  excelHeaders,
  excelValues,
} from "./ClinicTable";

const GROUP_TONE: Record<ClinicPayGroupCode, string> = {
  FULL: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-300",
  CAPITATION: "bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-300",
};

export interface PayGroupLike<L> {
  code: ClinicPayGroupCode;
  name: string;
  rule: string;
  schemes: readonly (L & { code: ClinicSchemeCode; name: string; visits: number })[];
}

/**
 * "ค่าใช้จ่ายตามกลุ่มสิทธิ" of the /clinic/* pages: one table per payment
 * group (FULL, CAPITATION) with its scheme rows and the group total. The
 * columns (table and Excel) are set by each page.
 */
export function PayGroupPanel<L>({
  title,
  note,
  groups,
  columns,
  excelColumns,
  fileName,
  excelTitle,
  minWidthClass,
}: {
  title: string;
  note: string;
  groups: readonly (L & PayGroupLike<L>)[];
  columns: readonly ClinicColumn<L>[];
  excelColumns: readonly ClinicExcelColumn<L>[];
  fileName: string;
  excelTitle: string;
  /** Literal Tailwind min-width class of each table. */
  minWidthClass: string;
}) {
  const excel: ExcelExport = {
    fileName,
    title: excelTitle,
    sheetName: "ตามสิทธิ",
    columns: excelHeaders(["กลุ่ม", "สิทธิ"], excelColumns),
    rows: groups.flatMap((g) => [
      [g.name, "รวมกลุ่ม", ...excelValues(excelColumns, g)],
      ...g.schemes.map((s) => [g.name, s.name, ...excelValues(excelColumns, s)]),
    ]),
    notes: [note],
  };

  return (
    <ClinicPanel title={title} excel={excel} note={note}>
      <div className="mt-3 space-y-4">
        {groups.map((g) => (
          <div key={g.code} className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`${chipClass} ${GROUP_TONE[g.code]}`}>{g.name}</span>
              <p className={`text-xs ${mutedClass}`}>{g.rule}</p>
            </div>
            <div className="mt-2">
              <ClinicTable<L>
                rowHeader="สิทธิ"
                columns={columns}
                minWidthClass={minWidthClass}
                rows={g.schemes.map((s) => ({
                  key: s.code,
                  row: s,
                  label: (
                    <>
                      {s.name}
                      {s.visits === 0 && <span className={subClass}>ไม่มี visit</span>}
                    </>
                  ),
                }))}
                footer={[{ key: "total", label: "รวมกลุ่ม", row: g }]}
              />
            </div>
          </div>
        ))}
      </div>
    </ClinicPanel>
  );
}
