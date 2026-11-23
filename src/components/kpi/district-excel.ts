import type {
  CavityFreeCounts,
  DistrictCavityFreeResult,
  DistrictCkd5Result,
  DistrictDspmResult,
  DistrictScreeningResult,
  DistrictStemiResult,
  DspmCounts,
} from "@/lib/kpi/types";
import { targetOperatorSign } from "@/lib/kpi/screening-indicators";
import type {
  ExcelCell,
  ExcelColumn,
  ExcelExport,
} from "./overview/ExcelDownloadButton";
import { formatNumber, formatThaiDate } from "./format";

/** Excel exports of the /district tables (aggregates only, numbers stay numbers). */

const HIERARCHY: ExcelColumn[] = [
  { header: "ระดับ" },
  { header: "ตำบล" },
  { header: "หมู่" },
];

const FRESHNESS: ExcelColumn = { header: "ข้อมูลถึง" };

interface Meta {
  name: string;
  fiscalYear: number;
  dataAsOf: string;
  note?: string;
  targetPercent: number;
  targetOperator: DistrictScreeningResult["targetOperator"];
}

function subtitleOf(m: Meta): string {
  return `ปีงบประมาณ ${m.fiscalYear} · ข้อมูล ณ วันที่ ${formatThaiDate(m.dataAsOf)} · แหล่งข้อมูล HDC อำเภอบางระกำ`;
}

function criteriaOf(m: Meta): string {
  return `เกณฑ์ ${targetOperatorSign(m.targetOperator)} ${formatNumber(m.targetPercent)}%`;
}

const dateOrNull = (iso: string | null): string | null =>
  iso ? formatThaiDate(iso) : null;

/** อำเภอ -> ตำบล -> หมู่ ratio indicators (A/B). */
export function ratioExcel(result: DistrictScreeningResult): ExcelExport {
  const { district } = result;
  const rows: ExcelCell[][] = result.tambons.flatMap((t) => [
    t.error
      ? ["ตำบล", t.tambonName, null, null, null, null, dateOrNull(t.dataAsOf)]
      : ["ตำบล", t.tambonName, null, t.denominator, t.numerator, t.percent, dateOrNull(t.dataAsOf)],
    ...t.villages.map((v) => [
      "หมู่",
      t.tambonName,
      v.moo,
      v.denominator,
      v.numerator,
      v.percent,
      null,
    ]),
  ]);
  const notes = [
    `${criteriaOf(result)} · B = ${result.population}`,
    "ระดับ: ตำบลและหมู่รวมอยู่ในไฟล์เดียว (แถวหมู่อยู่ใต้ตำบลของตน) ยอดรวมอำเภออยู่ท้ายตาราง",
  ];
  if (result.note) notes.push(result.note);
  return {
    fileName: `district-${result.code}-fy${result.fiscalYear}`,
    title: `${result.name} รายตำบล / รายหมู่ อำเภอบางระกำ`,
    subtitle: subtitleOf(result),
    sheetName: result.shortName,
    columns: [
      ...HIERARCHY,
      { header: "B (กลุ่มเป้าหมาย)", format: "int" },
      { header: "A (ผลงาน)", format: "int" },
      { header: "ร้อยละ", format: "pct" },
      FRESHNESS,
    ],
    rows,
    footer: [
      ["อำเภอ", district.name, null, district.denominator, district.numerator, district.percent, formatThaiDate(result.dataAsOf)],
    ],
    notes,
  };
}

const DSPM_COLUMNS: ExcelColumn[] = [
  { header: "เป้าหมาย", format: "int" },
  { header: "คัดกรอง", format: "int" },
  { header: "% คัดกรอง", format: "pct" },
  { header: "สงสัยล่าช้า (รอกระตุ้น+ส่งต่อทันที)", format: "int" },
  { header: "% สงสัยล่าช้า", format: "pct" },
  { header: "ติดตามได้", format: "int" },
  { header: "รอกระตุ้น 30 วัน", format: "int" },
  { header: "% ติดตาม", format: "pct" },
  { header: "สมวัย", format: "int" },
  { header: "% สมวัย", format: "pct" },
  { header: "ล่าช้าส่งต่อหลังกระตุ้น", format: "int" },
  { header: "รอติดตาม", format: "int" },
  { header: "ติดตามไม่ได้ใน 30 วัน", format: "int" },
];

function dspmValues(c: DspmCounts): ExcelCell[] {
  return [
    c.target,
    c.screened,
    c.screenPercent,
    c.suspectWait + c.suspectRefer,
    c.suspectPercent,
    c.followed,
    c.suspectWait,
    c.followPercent,
    c.normalFirst + c.normalAfter,
    c.normalPercent,
    c.delayedAfter,
    c.waiting,
    c.lost,
  ];
}

function dspmNotes(result: DistrictDspmResult): string[] {
  return [
    `เกณฑ์ % สมวัย ${targetOperatorSign(result.targetOperator)} ${formatNumber(result.targetPercent)}% · % คัดกรอง ≥ ${formatNumber(result.screenTargetPercent)} · % สงสัยล่าช้า ≥ ${formatNumber(result.suspectTargetPercent)}`,
    "สงสัยล่าช้า = รอกระตุ้น 30 วัน (1B261) + ส่งต่อทันที (1B262) · สมวัย = สมวัยครั้งแรก + สมวัยหลังติดตาม",
    result.note,
  ];
}

export function dspmAgeExcel(result: DistrictDspmResult): ExcelExport {
  const d = result.district;
  return {
    fileName: `district-DSPM-age-fy${result.fiscalYear}`,
    title: `${result.name} แยกกลุ่มอายุ อำเภอบางระกำ`,
    subtitle: subtitleOf(result),
    sheetName: "แยกกลุ่มอายุ",
    columns: [{ header: "กลุ่มอายุ (เดือน)" }, ...DSPM_COLUMNS],
    rows: result.ageGroups.map((g) => [`${g.ageMonths} เดือน`, ...dspmValues(g)]),
    footer: [["รวม 5 กลุ่มอายุ", ...dspmValues(d)]],
    notes: dspmNotes(result),
  };
}

export function dspmTambonExcel(result: DistrictDspmResult): ExcelExport {
  const d = result.district;
  return {
    fileName: `district-DSPM-tambon-fy${result.fiscalYear}`,
    title: `${result.name} รายตำบล / รายหมู่ อำเภอบางระกำ`,
    subtitle: subtitleOf(result),
    sheetName: "รายตำบล-หมู่",
    columns: [...HIERARCHY, ...DSPM_COLUMNS, FRESHNESS],
    rows: result.tambons.flatMap((t) => [
      ["ตำบล", t.tambonName, null, ...dspmValues(t), dateOrNull(t.dataAsOf)],
      ...t.villages.map((v) => ["หมู่", t.tambonName, v.moo, ...dspmValues(v), null]),
    ]),
    footer: [["อำเภอ", d.name, null, ...dspmValues(d), formatThaiDate(result.dataAsOf)]],
    notes: [
      ...dspmNotes(result),
      "แถวหมู่แสดงเฉพาะหมู่ที่มีเด็กกลุ่มเป้าหมายอย่างน้อย 1 คน",
    ],
  };
}

const CAVITY_COLUMNS: ExcelColumn[] = [
  { header: "เด็กทั้งหมด (C)", format: "int" },
  { header: "ตรวจช่องปาก (B)", format: "int" },
  { header: "% ตรวจ (B/C)", format: "pct" },
  { header: "ฟันดีไม่มีผุ (A)", format: "int" },
  { header: "% ฟันดีไม่มีผุ (A/B)", format: "pct" },
];

function cavityValues(c: CavityFreeCounts): ExcelCell[] {
  return [c.target, c.examined, c.examPercent, c.cavityFree, c.percent];
}

function cavityNotes(result: DistrictCavityFreeResult): string[] {
  return [
    `เกณฑ์ % ฟันดีไม่มีผุ (A/B) ${targetOperatorSign(result.targetOperator)} ${formatNumber(result.targetPercent)}%`,
    result.note,
  ];
}

export function cavityAgeExcel(result: DistrictCavityFreeResult): ExcelExport {
  return {
    fileName: `district-CavityFree-age-fy${result.fiscalYear}`,
    title: `${result.name} แยกอายุ อำเภอบางระกำ`,
    subtitle: subtitleOf(result),
    sheetName: "แยกอายุ",
    columns: [{ header: "อายุ (ปีเต็ม ณ 1 ม.ค.)" }, ...CAVITY_COLUMNS],
    rows: result.ageGroups.map((g) => [`${g.ageYears} ปี`, ...cavityValues(g)]),
    footer: [["รวม 0–5 ปี", ...cavityValues(result.district)]],
    notes: cavityNotes(result),
  };
}

export function cavityTambonExcel(result: DistrictCavityFreeResult): ExcelExport {
  const d = result.district;
  return {
    fileName: `district-CavityFree-tambon-fy${result.fiscalYear}`,
    title: `${result.name} รายตำบล / รายหมู่ อำเภอบางระกำ`,
    subtitle: subtitleOf(result),
    sheetName: "รายตำบล-หมู่",
    columns: [...HIERARCHY, ...CAVITY_COLUMNS, FRESHNESS],
    rows: result.tambons.flatMap((t) => [
      ["ตำบล", t.tambonName, null, ...cavityValues(t), dateOrNull(t.dataAsOf)],
      ...t.villages.map((v) => ["หมู่", t.tambonName, v.moo, ...cavityValues(v), null]),
    ]),
    footer: [["อำเภอ", d.name, null, ...cavityValues(d), formatThaiDate(result.dataAsOf)]],
    notes: cavityNotes(result),
  };
}

export function ckd5Excel(result: DistrictCkd5Result): ExcelExport {
  const { district: d, previousYearComparable: comparable } = result;
  const prevFy = result.fiscalYear - 1;
  const prev = (n: number): number | null => (comparable ? n : null);
  const notes = [
    `เกณฑ์ ร้อยละที่ลดลง ${targetOperatorSign(result.targetOperator)} ${formatNumber(result.targetPercent)}% (ยิ่งต่ำยิ่งดี)`,
    "แถวหมู่แสดงเฉพาะหมู่ที่มีผู้ป่วยรายใหม่อย่างน้อย 1 ราย และไม่มีค่า 'ช่วงเดียวกัน' รายหมู่",
    result.note,
  ];
  if (!comparable) notes.push("ข้อมูลปีก่อนไม่พอ จึงเว้นค่าปีก่อนและร้อยละที่ลดลง");
  return {
    fileName: `district-CKD5-fy${result.fiscalYear}`,
    title: `${result.name} รายตำบล / รายหมู่ อำเภอบางระกำ`,
    subtitle: subtitleOf(result),
    sheetName: "CKD5",
    columns: [
      ...HIERARCHY,
      { header: `รายใหม่ ปีงบ ${result.fiscalYear}`, format: "int" },
      { header: `รายใหม่ ปีงบ ${prevFy}`, format: "int" },
      { header: `ปีงบ ${prevFy} ช่วงเดียวกัน`, format: "int" },
      { header: "ร้อยละที่ลดลง", format: "pct" },
      FRESHNESS,
    ],
    rows: result.tambons.flatMap((t) => [
      [
        "ตำบล",
        t.tambonName,
        null,
        t.currentCases,
        prev(t.previousCases),
        prev(t.previousSamePeriod),
        null,
        dateOrNull(t.dataAsOf),
      ],
      ...t.villages.map((v) => [
        "หมู่",
        t.tambonName,
        v.moo,
        v.currentCases,
        prev(v.previousCases),
        null,
        null,
        null,
      ]),
    ]),
    footer: [
      [
        "อำเภอ",
        d.name,
        null,
        d.currentCases,
        prev(d.previousCases),
        prev(d.previousSamePeriod),
        d.reductionPercent,
        formatThaiDate(result.dataAsOf),
      ],
    ],
    notes,
  };
}

export function stemiExcel(data: DistrictStemiResult): ExcelExport {
  const d = data.district;
  return {
    fileName: `district-STEMI-fy${data.fiscalYear}`,
    title: `${data.name} ระดับอำเภอ${d.name}`,
    subtitle: subtitleOf(data),
    sheetName: "STEMI",
    columns: [
      { header: "พื้นที่" },
      { header: "B (ครั้งการเจ็บป่วย)", format: "int" },
      { header: "A (เสียชีวิต)", format: "int" },
      { header: "อัตราตาย (ร้อยละ)", format: "pct" },
    ],
    rows: [[`อำเภอ${d.name}`, d.episodes, d.deaths, d.percent]],
    notes: [
      `เกณฑ์ อัตราตาย ${targetOperatorSign(data.targetOperator)} ${formatNumber(data.targetPercent)}% (ยิ่งต่ำยิ่งดี)`,
      data.note,
    ],
  };
}
