import "server-only";

import ExcelJS from "exceljs";

import { BE_OFFSET } from "@/lib/kpi/fiscal-year";
import type { ScreeningExportData } from "@/lib/kpi/screening-detail";
import {
  CKD5_INDICATOR,
  isLowerBetter,
  isReductionCode,
  SCREENING_INDICATORS,
  type ScreeningIndicatorMeta,
  screeningTargetPercent,
  targetOperatorSign,
} from "@/lib/kpi/screening-indicators";

/**
 * Builds the screening KPI Excel workbook (server-side only, all SCREENING_CODES).
 * Sheet "สรุปรายหมู่": aggregates. Sheet "รายชื่อ": HN, name, sex, age,
 * status, screening date — no CID / phone / address / lab values.
 * All values are written as plain values (never formulas), so text from
 * the database cannot become an Excel formula.
 */

/** "YYYY-MM-DD" -> "DD/MM/YYYY" in Buddhist Era. */
export function toThaiDate(iso: string | null): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return "";
  const y = Number(iso.slice(0, 4)) + BE_OFFSET;
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${y}`;
}

/** Visible width of a string: Thai combining marks take no column. */
function displayWidth(text: string): number {
  return text.replace(/[ัิ-ฺ็-๎]/g, "").length;
}

function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return value.toLocaleString("en-US");
  return String(value);
}

/** Bold header, freeze first row, column widths fitted to content. */
function finishSheet(ws: ExcelJS.Worksheet, tableRowCount: number): void {
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: "frozen", ySplit: 1, xSplit: 0 }];
  ws.columns.forEach((col, i) => {
    let max = 0;
    for (let r = 1; r <= tableRowCount; r++) {
      const text = cellText(ws.getRow(r).getCell(i + 1).value);
      max = Math.max(max, displayWidth(text));
    }
    col.width = Math.min(Math.max(max + 2, 6), 60);
  });
}

/**
 * CKD5 (KPI 10) workbook. Summary: new cases per village, selected fiscal
 * year vs the previous one (no percentage per village). List: new cases of
 * the selected fiscal year with the date they became a new stage 5 case.
 */
async function buildCkd5Workbook(data: ScreeningExportData): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "bkh-kpi";
  wb.created = new Date(data.generatedAt);
  const n = { numFmt: "#,##0" };
  const prevFy = data.fiscalYear - 1;

  const summary = wb.addWorksheet("สรุปรายหมู่");
  summary.columns = [
    { key: "moo" },
    { key: "villageName" },
    { key: "current", style: n },
    { key: "previous", style: n },
  ];
  summary.addRow([
    "หมู่",
    "ชื่อหมู่บ้าน",
    `รายใหม่ ปีงบ ${data.fiscalYear}`,
    `รายใหม่ ปีงบ ${prevFy}`,
  ]);
  for (const v of data.villages) {
    summary.addRow([v.moo, v.villageName, v.numerator, v.previousCases ?? 0]);
  }
  const totalRow = summary.addRow([
    "รวม",
    "",
    data.villages.reduce((s, v) => s + v.numerator, 0),
    data.villages.reduce((s, v) => s + (v.previousCases ?? 0), 0),
  ]);
  totalRow.font = { bold: true };
  const tableRows = summary.rowCount;

  summary.addRow([]);
  summary.addRow([`ตัวชี้วัด: ${CKD5_INDICATOR.name}`]);
  summary.addRow([
    `เกณฑ์: ร้อยละที่ลดลงจากปีงบประมาณก่อนหน้า ${targetOperatorSign(CKD5_INDICATOR.targetOperator)} ${CKD5_INDICATOR.targetPercent}`,
  ]);
  summary.addRow([
    `ช่วงข้อมูล: ${data.periodLabel} (${toThaiDate(data.countFrom)} – ${toThaiDate(data.dataAsOf)}) ข้อมูล ณ วันที่ ${toThaiDate(data.dataAsOf)}`,
  ]);
  if (data.note) summary.addRow([`หมายเหตุ: ${data.note}`]);
  summary.addRow([
    "ไม่แสดงร้อยละรายหมู่ เพราะจำนวนรายใหม่ต่อหมู่น้อย (ร้อยละใช้ที่ระดับโรงพยาบาลเท่านั้น)",
  ]);
  if (data.truncated) {
    summary.addRow([
      `หมายเหตุ: ชีต "รายชื่อ" แสดงเพียง ${data.personLimit.toLocaleString("en-US")} รายการแรก`,
    ]);
  }
  finishSheet(summary, tableRows);

  const list = wb.addWorksheet("รายชื่อ");
  list.columns = [
    { key: "moo" },
    { key: "hn" },
    { key: "fullName" },
    { key: "sex" },
    { key: "age" },
    { key: "caseDate" },
  ];
  list.addRow(["หมู่", "HN", "ชื่อ-สกุล", "เพศ", "อายุ", "วันที่เป็นรายใหม่"]);
  for (const p of data.persons) {
    list.addRow([
      p.moo,
      p.hn ?? "",
      p.fullName,
      p.sex,
      p.age,
      toThaiDate(p.screenDate),
    ]);
  }
  finishSheet(list, list.rowCount);

  const out = await wb.xlsx.writeBuffer();
  return Buffer.from(out);
}

/**
 * STEMI (KPI 11, lower is better) workbook. Summary: B / A counts per village
 * (no percentage per village, numbers too small; the hospital-level rate is
 * in the notes). List: one row per EPISODE (the same HN may repeat).
 */
async function buildMortalityWorkbook(
  data: ScreeningExportData,
  meta: ScreeningIndicatorMeta,
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "bkh-kpi";
  wb.created = new Date(data.generatedAt);
  const n = { numFmt: "#,##0" };
  const labels = meta.statusLabels;
  const bLabel = labels.targetHeader ?? "กลุ่มเป้าหมาย";
  const aLabel = labels.summary?.done ?? "เสียชีวิต";
  const target = screeningTargetPercent(meta.code, data.fiscalYear);
  const sign = targetOperatorSign(meta.targetOperator ?? "<");

  const summary = wb.addWorksheet("สรุปรายหมู่");
  summary.columns = [
    { key: "moo" },
    { key: "villageName" },
    { key: "denominator", style: n },
    { key: "numerator", style: n },
  ];
  summary.addRow(["หมู่", "ชื่อหมู่บ้าน", `B (${bLabel})`, `A (${aLabel})`]);
  for (const v of data.villages) {
    summary.addRow([v.moo, v.villageName, v.denominator, v.numerator]);
  }
  const totalB = data.villages.reduce((s, v) => s + v.denominator, 0);
  const totalA = data.villages.reduce((s, v) => s + v.numerator, 0);
  const totalRow = summary.addRow(["รวม", "", totalB, totalA]);
  totalRow.font = { bold: true };
  const tableRows = summary.rowCount;

  summary.addRow([]);
  summary.addRow([`ตัวชี้วัด: ${meta.name}`]);
  summary.addRow([
    `เกณฑ์: อัตราตาย ${sign} ร้อยละ ${target} (ยิ่งต่ำยิ่งดี) / อัตราตายรวม = ${totalA.toLocaleString("en-US")} / ${totalB.toLocaleString("en-US")} = ${
      totalB > 0 ? (Math.round((totalA / totalB) * 10000) / 100).toFixed(2) : "-"
    }%`,
  ]);
  summary.addRow([
    `ช่วงข้อมูล: ${data.periodLabel} (${toThaiDate(data.countFrom)} – ${toThaiDate(data.dataAsOf)}) ข้อมูล ณ วันที่ ${toThaiDate(data.dataAsOf)}`,
  ]);
  if (data.note) summary.addRow([`หมายเหตุ: ${data.note}`]);
  summary.addRow([
    "ไม่แสดงร้อยละรายหมู่ เพราะจำนวนผู้ป่วยต่อหมู่น้อย (ร้อยละใช้ที่ระดับโรงพยาบาลเท่านั้น)",
  ]);
  if (data.truncated) {
    summary.addRow([
      `หมายเหตุ: ชีต "รายชื่อ" แสดงเพียง ${data.personLimit.toLocaleString("en-US")} รายการแรก`,
    ]);
  }
  finishSheet(summary, tableRows);

  const list = wb.addWorksheet("รายชื่อ");
  list.columns = [
    { key: "moo" },
    { key: "hn" },
    { key: "fullName" },
    { key: "sex" },
    { key: "age" },
    { key: "status" },
    { key: "eventDate" },
    { key: "deathDate" },
  ];
  list.addRow([
    "หมู่",
    "HN",
    "ชื่อ-สกุล",
    "เพศ",
    "อายุ",
    "สถานะ",
    "วันที่เริ่มป่วย (episode)",
    labels.dateHeader ?? "วันที่เสียชีวิต",
  ]);
  // One row per episode: the same HN can appear more than once.
  for (const p of data.persons) {
    list.addRow([
      p.moo,
      p.hn ?? "",
      p.fullName,
      p.sex,
      p.age,
      p.screened ? labels.screened : labels.notScreened,
      toThaiDate(p.eventDate ?? null),
      toThaiDate(p.screenDate),
    ]);
  }
  finishSheet(list, list.rowCount);

  const out = await wb.xlsx.writeBuffer();
  return Buffer.from(out);
}

export async function buildScreeningWorkbook(
  data: ScreeningExportData,
): Promise<Buffer> {
  if (isReductionCode(data.code)) return buildCkd5Workbook(data);
  if (isLowerBetter(SCREENING_INDICATORS[data.code].targetOperator ?? ">=")) {
    return buildMortalityWorkbook(data, SCREENING_INDICATORS[data.code]);
  }

  const wb = new ExcelJS.Workbook();
  wb.creator = "bkh-kpi";
  wb.created = new Date(data.generatedAt);

  const meta = SCREENING_INDICATORS[data.code];
  // Show the eligible population separately only when B is a share of it (CX).
  const showEligible = meta.denominatorFactor !== 1;
  const sharePct = Math.round(meta.denominatorFactor * 100);
  const n = { numFmt: "#,##0" };
  const labels = meta.statusLabels;
  const doneLabel = labels.summary?.done ?? "คัดกรองแล้ว";
  const dateHeader = labels.dateHeader ?? "วันที่คัดกรอง";
  const hasSuspectDate = data.persons.some((p) => p.suspectDate !== undefined);
  const noAgeLimit = meta.minAge === 0 && meta.maxAge === null;
  const targetGroup = meta.population.includes(meta.ageRange)
    ? meta.population
    : noAgeLimit
      ? `${meta.population} (${meta.ageRange})`
      : `${meta.population} อายุ ${meta.ageRange}`;
  const target = screeningTargetPercent(data.code, data.fiscalYear);
  const sign = targetOperatorSign(meta.targetOperator ?? ">=");

  /* ---- Sheet 1: summary by village ---- */
  const summary = wb.addWorksheet("สรุปรายหมู่");
  summary.columns = [
    { key: "moo" },
    { key: "villageName" },
    ...(showEligible ? [{ key: "eligible", style: n }] : []),
    { key: "denominator", style: n },
    { key: "numerator", style: n },
    { key: "percent", style: { numFmt: "0.00" } },
  ];
  summary.addRow([
    "หมู่",
    "ชื่อหมู่บ้าน",
    ...(showEligible ? [`${meta.population} ${meta.ageRange}`] : []),
    showEligible
      ? `B (เป้าหมาย ${sharePct}%)`
      : `B (${labels.targetHeader ?? "กลุ่มเป้าหมาย"})`,
    `A (${doneLabel})`,
    "ร้อยละ",
  ]);
  for (const v of data.villages) {
    summary.addRow([
      v.moo,
      v.villageName,
      ...(showEligible ? [v.eligible] : []),
      v.denominator,
      v.numerator,
      v.percent,
    ]);
  }
  const totalE = data.villages.reduce((s, v) => s + v.eligible, 0);
  const totalB = data.villages.reduce((s, v) => s + v.denominator, 0);
  const totalA = data.villages.reduce((s, v) => s + v.numerator, 0);
  const totalPercent =
    totalB > 0 ? Math.round((totalA / totalB) * 10000) / 100 : 0;
  const totalRow = summary.addRow([
    "รวม",
    "",
    ...(showEligible ? [totalE] : []),
    totalB,
    totalA,
    totalPercent,
  ]);
  totalRow.font = { bold: true };
  const tableRows = summary.rowCount;

  // Notes below the table (not counted for column width).
  summary.addRow([]);
  summary.addRow([`ตัวชี้วัด: ${meta.name}`]);
  summary.addRow([
    `กลุ่มเป้าหมาย: ${targetGroup}${noAgeLimit ? "" : " (อายุ ณ 1 ต.ค. ของปีงบประมาณ)"} เกณฑ์ ${sign} ร้อยละ ${target}`,
  ]);
  summary.addRow([
    `ช่วงข้อมูล: ${data.periodLabel} (${toThaiDate(data.countFrom)} – ${toThaiDate(data.dataAsOf)}) ปีงบประมาณ ${data.fiscalYear} ข้อมูล ณ วันที่ ${toThaiDate(data.dataAsOf)}`,
  ]);
  if (data.note) summary.addRow([`หมายเหตุ: ${data.note}`]);
  if (showEligible) {
    summary.addRow([
      `B รายหมู่ได้จากการแบ่ง B รวม (= ปัดเศษ ${sharePct}% ของ${meta.population} ${meta.ageRange} ทั้งหมด) ตามสัดส่วนแบบเศษเหลือมากสุด ผลรวมจึงเท่ากับ B รวมพอดี`,
    ]);
  }
  if (data.truncated) {
    summary.addRow([
      `หมายเหตุ: ชีต "รายชื่อ" แสดงเพียง ${data.personLimit.toLocaleString("en-US")} รายการแรก`,
    ]);
  }
  finishSheet(summary, tableRows);

  /* ---- Sheet 2: person list ---- */
  const list = wb.addWorksheet("รายชื่อ");
  list.columns = [
    { key: "moo" },
    { key: "hn" },
    { key: "fullName" },
    { key: "sex" },
    { key: "age" },
    { key: "status" },
    ...(hasSuspectDate ? [{ key: "suspectDate" }] : []),
    { key: "screenDate" },
  ];
  list.addRow([
    "หมู่",
    "HN",
    "ชื่อ-สกุล",
    "เพศ",
    "อายุ",
    "สถานะ",
    ...(hasSuspectDate ? ["วันที่คัดกรอง (สงสัย)"] : []),
    dateHeader,
  ]);
  for (const p of data.persons) {
    list.addRow([
      p.moo,
      p.hn ?? "", // keep as text: preserves leading zeros
      p.fullName,
      p.sex,
      p.age,
      p.screened ? labels.screened : labels.notScreened,
      ...(hasSuspectDate ? [toThaiDate(p.suspectDate ?? null)] : []),
      toThaiDate(p.screenDate),
    ]);
  }
  finishSheet(list, list.rowCount);

  const out = await wb.xlsx.writeBuffer();
  return Buffer.from(out);
}
