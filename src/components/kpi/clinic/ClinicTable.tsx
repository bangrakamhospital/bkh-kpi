import type { ReactNode } from "react";
import type { ExcelCell, ExcelColumn } from "../overview/ExcelDownloadButton";
import {
  footClass,
  tableClass,
  tdClass,
  tdRightClass,
  theadClass,
  thClass,
  thRightClass,
  trClass,
} from "../overview/table-styles";

/** A numeric column of a /clinic/* table (right-aligned). */
export interface ClinicColumn<R> {
  header: string;
  cell: (r: R) => ReactNode;
  /** Extra td classes, e.g. "font-semibold" or a highlight from the row. */
  className?: string | ((r: R) => string);
}

/** A column of the Excel export of a /clinic/* table. */
export interface ClinicExcelColumn<R> extends ExcelColumn {
  value: (r: R) => ExcelCell;
}

export interface ClinicTableRow<R> {
  key: string;
  /** Row header (first column). */
  label: ReactNode;
  row: R;
  /** Extra classes of the row header cell (e.g. indent). */
  labelClassName?: string;
}

/**
 * Table of the /clinic/* pages: a text row header, then the numeric columns,
 * optional total rows in tfoot. `minWidthClass` must be a literal Tailwind
 * class (e.g. "min-w-[44rem]").
 */
export function ClinicTable<R>({
  rowHeader,
  columns,
  rows,
  footer = [],
  minWidthClass,
}: {
  rowHeader: string;
  columns: readonly ClinicColumn<R>[];
  rows: readonly ClinicTableRow<R>[];
  footer?: readonly ClinicTableRow<R>[];
  minWidthClass: string;
}) {
  const cells = (r: R) =>
    columns.map((c) => {
      const extra = typeof c.className === "function" ? c.className(r) : (c.className ?? "");
      return (
        <td key={c.header} className={extra ? `${tdRightClass} ${extra}` : tdRightClass}>
          {c.cell(r)}
        </td>
      );
    });
  return (
    <div className="overflow-x-auto">
      <table className={`${tableClass} ${minWidthClass}`}>
        <thead className={theadClass}>
          <tr>
            <th scope="col" className={thClass}>{rowHeader}</th>
            {columns.map((c) => (
              <th key={c.header} scope="col" className={thRightClass}>{c.header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className={trClass}>
              <th scope="row" className={`${tdClass} text-left font-medium ${r.labelClassName ?? ""}`}>
                {r.label}
              </th>
              {cells(r.row)}
            </tr>
          ))}
        </tbody>
        {footer.length > 0 && (
          <tfoot>
            {footer.map((r) => (
              <tr key={r.key} className={footClass}>
                <th scope="row" className={`${tdClass} text-left`}>{r.label}</th>
                {cells(r.row)}
              </tr>
            ))}
          </tfoot>
        )}
      </table>
    </div>
  );
}

/** Excel column list: leading text columns, then the value columns. */
export function excelHeaders<R>(
  lead: readonly string[],
  columns: readonly ClinicExcelColumn<R>[],
): ExcelColumn[] {
  return [
    ...lead.map((header) => ({ header })),
    ...columns.map(({ header, format }) => (format ? { header, format } : { header })),
  ];
}

/** Excel values of one row, in column order. */
export const excelValues = <R,>(columns: readonly ClinicExcelColumn<R>[], r: R): ExcelCell[] =>
  columns.map((c) => c.value(r));
