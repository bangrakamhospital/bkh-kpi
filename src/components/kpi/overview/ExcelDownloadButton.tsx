"use client";

import { useState } from "react";
import { Download, Loader2 } from "lucide-react";

export type ExcelCell = string | number | null;

export interface ExcelColumn {
  header: string;
  /** "int" → #,##0 · "pct" → 0.0 (value already in percent) · default text */
  format?: "int" | "pct";
}

/** One aggregated table to export (no patient-identifying data). */
export interface ExcelExport {
  /** File name without extension; date/time suffix is added automatically. */
  fileName: string;
  title: string;
  /** e.g. "ช่วงวันที่ 01/11/2569 - 17/11/2569" */
  subtitle?: string;
  sheetName?: string;
  columns: ExcelColumn[];
  rows: ExcelCell[][];
  /** Footer rows (e.g. totals), written bold under the table. */
  footer?: ExcelCell[][];
  notes?: string[];
}

/** Visible width of a string: Thai combining marks take no column. */
function displayWidth(text: string): number {
  return text.replace(/[ัิ-ฺ็-๎]/g, "").length;
}

/** Excel sheet names: max 31 chars, no []:*?/\ */
function safeSheetName(name: string): string {
  return name.replace(/[[\]:*?/\\]/g, " ").slice(0, 31) || "Sheet1";
}

function stamp(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

async function buildAndDownload(data: ExcelExport): Promise<void> {
  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  wb.creator = "bkh-kpi";
  wb.created = new Date();
  const ws = wb.addWorksheet(safeSheetName(data.sheetName ?? data.title));
  const nCols = data.columns.length;

  // Title block. All values are plain (never formulas).
  ws.addRow([data.title]).font = { bold: true, size: 14 };
  if (data.subtitle) ws.addRow([data.subtitle]);
  ws.addRow([`ออกรายงานเมื่อ ${new Date().toLocaleString("th-TH")}`]).font = { italic: true, color: { argb: "FF666666" } };
  ws.addRow([]);

  const headerRow = ws.addRow(data.columns.map((c) => c.header));
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF115E59" } };
    cell.alignment = { vertical: "middle" };
  });
  const headerIdx = headerRow.number;

  const border = { style: "thin" as const, color: { argb: "FFD4D4D8" } };
  const addDataRow = (values: ExcelCell[], bold = false) => {
    const row = ws.addRow(values);
    for (let i = 1; i <= nCols; i++) {
      const cell = row.getCell(i);
      const fmt = data.columns[i - 1]?.format;
      if (fmt === "int") cell.numFmt = "#,##0";
      if (fmt === "pct") cell.numFmt = "0.0";
      cell.border = { top: border, bottom: border, left: border, right: border };
      if (bold) cell.font = { bold: true };
    }
  };
  data.rows.forEach((r) => addDataRow(r));
  data.footer?.forEach((r) => addDataRow(r, true));

  if (data.notes?.length) {
    ws.addRow([]);
    data.notes.forEach((n) => (ws.addRow([n]).font = { color: { argb: "FF666666" } }));
  }

  ws.views = [{ state: "frozen", ySplit: headerIdx, xSplit: 0 }];
  const tableRows = [data.columns.map((c) => c.header), ...data.rows, ...(data.footer ?? [])];
  for (let c = 0; c < nCols; c++) {
    const max = tableRows.reduce((m, r) => {
      const v = r[c];
      const text = v === null || v === undefined ? "" : typeof v === "number" ? v.toLocaleString("en-US") : v;
      return Math.max(m, displayWidth(text));
    }, 0);
    ws.getColumn(c + 1).width = Math.min(Math.max(max + 2, 8), 60);
  }

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${data.fileName}-${stamp(new Date())}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Small header button that downloads an aggregated table as .xlsx (client-side). */
export function ExcelDownloadButton({ data }: { data: ExcelExport }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  const onClick = async () => {
    setBusy(true);
    setError(false);
    try {
      await buildAndDownload(data);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="inline-flex items-center gap-1.5">
      {error && (
        <span role="alert" className="text-xs text-red-800 dark:text-red-300">
          ดาวน์โหลดไม่สำเร็จ
        </span>
      )}
      <button
        type="button"
        onClick={() => void onClick()}
        disabled={busy}
        title={`ดาวน์โหลด Excel: ${data.title}`}
        aria-label={`ดาวน์โหลด Excel: ${data.title}`}
        className="inline-flex items-center gap-1 rounded-lg border border-zinc-300 px-2 py-0.5 text-xs font-medium text-emerald-800 hover:bg-brand-50 focus-visible:outline-2 focus-visible:outline-brand-600 disabled:opacity-60 dark:border-zinc-700 dark:text-emerald-300 dark:hover:bg-brand-900/40"
      >
        {busy ? (
          <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Download aria-hidden="true" className="h-3.5 w-3.5" />
        )}
        Excel
      </button>
    </span>
  );
}
