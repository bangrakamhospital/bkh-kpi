import "server-only";

import ExcelJS from "exceljs";

import type { DistrictPersonsData } from "@/lib/kpi/district-persons";
import {
  SCREENING_INDICATORS,
  targetOperatorSign,
} from "@/lib/kpi/screening-indicators";
import { toThaiDate } from "@/lib/kpi/screening-excel";

/**
 * Excel workbook of the district (HDC) person list of one village /
 * sub-district. Sheet "สรุปรายหมู่": aggregates of the area's villages
 * (same numbers as the dashboard). Sheet "รายชื่อ": name, sex, age, unit,
 * status, service date / unit — no CID / PID / HN / address / lab values.
 * Values are plain (never formulas).
 */

function displayWidth(text: string): number {
  return text.replace(/[ัิ-ฺ็-๎]/g, "").length;
}

function fitColumns(ws: ExcelJS.Worksheet, tableRowCount: number): void {
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: "frozen", ySplit: 1, xSplit: 0 }];
  ws.columns.forEach((col, i) => {
    let max = 0;
    for (let r = 1; r <= tableRowCount; r++) {
      const v = ws.getRow(r).getCell(i + 1).value;
      const text =
        v === null || v === undefined
          ? ""
          : typeof v === "number"
            ? v.toLocaleString("en-US")
            : String(v);
      max = Math.max(max, displayWidth(text));
    }
    col.width = Math.min(Math.max(max + 2, 6), 60);
  });
}

export async function buildDistrictPersonsWorkbook(
  data: DistrictPersonsData,
): Promise<Buffer> {
  const agg = data.aggregates;
  const wb = new ExcelJS.Workbook();
  wb.creator = "bkh-kpi";
  wb.created = new Date();
  const n = { numFmt: "#,##0" };
  const tambonCode =
    data.scope.kind === "village"
      ? data.scope.vid.slice(0, 6)
      : data.scope.tambonCode;
  const tambon = agg.tambons.find((t) => t.tambonCode === tambonCode);
  const villages = (tambon?.villages ?? []).filter(
    (v) => data.scope.kind === "tambon" || v.key === data.scope.vid,
  );
  const showEligible = villages.some((v) => v.eligible !== v.denominator);
  const withSuspect = data.persons.some((p) => p.suspectDate !== undefined);
  const labels = SCREENING_INDICATORS[data.code].statusLabels;

  /* ---- Sheet 1: summary ---- */
  const summary = wb.addWorksheet("สรุปรายหมู่");
  summary.columns = [
    { key: "tambon" },
    { key: "moo" },
    ...(showEligible ? [{ key: "eligible", style: n }] : []),
    { key: "b", style: n },
    { key: "a", style: n },
    { key: "pct", style: { numFmt: "0.00" } },
  ];
  summary.addRow([
    "ตำบล",
    "หมู่",
    ...(showEligible ? ["กลุ่มเป้าหมายทั้งหมด"] : []),
    "B",
    "A",
    "ร้อยละ",
  ]);
  for (const v of villages) {
    summary.addRow([
      tambon?.tambonName ?? tambonCode,
      v.moo,
      ...(showEligible ? [v.eligible] : []),
      v.denominator,
      v.numerator,
      v.percent,
    ]);
  }
  const tableRows = summary.rowCount;
  summary.addRow([]);
  summary.addRow([`ตัวชี้วัด: ${agg.name}`]);
  summary.addRow([
    `B = ${agg.population} เกณฑ์ ${targetOperatorSign(agg.targetOperator)} ร้อยละ ${agg.targetPercent}`,
  ]);
  summary.addRow([
    `ปีงบประมาณ ${agg.fiscalYear} ข้อมูล ณ วันที่ ${toThaiDate(agg.dataAsOf)} / ข้อมูลหน่วยบริการของตำบลถึง ${toThaiDate(data.dataAsOf)}`,
  ]);
  summary.addRow([`หมายเหตุ: ${agg.note}`]);
  if (data.truncated) {
    summary.addRow([
      `หมายเหตุ: ชีต "รายชื่อ" แสดงเพียง ${data.limit.toLocaleString("en-US")} รายการแรก`,
    ]);
  }
  fitColumns(summary, tableRows);

  /* ---- Sheet 2: persons ---- */
  const list = wb.addWorksheet("รายชื่อ");
  list.columns = [
    { key: "no", style: n },
    { key: "moo" },
    { key: "name" },
    { key: "sex" },
    { key: "age", style: n },
    { key: "unit" },
    ...(withSuspect ? [{ key: "suspect" }] : []),
    { key: "status" },
    { key: "date" },
    { key: "sunit" },
  ];
  list.addRow([
    "ลำดับ",
    "หมู่",
    "ชื่อ-สกุล",
    "เพศ",
    "อายุ (ณ 1 ต.ค.)",
    "หน่วยบริการที่รับผิดชอบ",
    ...(withSuspect ? ["วันที่คัดกรองพบสงสัยป่วย"] : []),
    "สถานะ",
    "วันที่รับบริการ",
    "หน่วยที่ให้บริการ",
  ]);
  data.persons.forEach((p, i) => {
    list.addRow([
      i + 1,
      p.moo,
      p.fullName,
      p.sex,
      p.age,
      p.unitName,
      ...(withSuspect ? [toThaiDate(p.suspectDate ?? null)] : []),
      p.screened ? labels.screened : labels.notScreened,
      toThaiDate(p.screenDate),
      p.screenUnitName ?? "",
    ]);
  });
  fitColumns(list, list.rowCount);

  const out = await wb.xlsx.writeBuffer();
  return Buffer.from(out);
}
