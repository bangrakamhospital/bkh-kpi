const numberFormat = new Intl.NumberFormat("th-TH");
const percentFormat = new Intl.NumberFormat("th-TH", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatNumber(value: number): string {
  return numberFormat.format(value);
}

export function formatPercent(value: number): string {
  return percentFormat.format(value);
}

/** "YYYY-MM-DD" -> วันที่ไทย พ.ศ. (เช่น 6 พฤศจิกายน 2569) */
export function formatThaiDate(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Intl.DateTimeFormat("th-TH", {
    timeZone: "UTC",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

const THAI_MONTHS_SHORT = [
  "ม.ค.",
  "ก.พ.",
  "มี.ค.",
  "เม.ย.",
  "พ.ค.",
  "มิ.ย.",
  "ก.ค.",
  "ส.ค.",
  "ก.ย.",
  "ต.ค.",
  "พ.ย.",
  "ธ.ค.",
];

/** "2026-10" -> "ต.ค. 69" */
export function formatThaiMonthShort(month: string): string {
  const year = Number(month.slice(0, 4)) + 543;
  const m = Number(month.slice(5, 7));
  return `${THAI_MONTHS_SHORT[m - 1]} ${String(year % 100).padStart(2, "0")}`;
}

const bahtFormat = new Intl.NumberFormat("th-TH", {
  maximumFractionDigits: 0,
});

/** 12345.6 -> "12,346" (number only; put "บาท" in the label/header) */
export function formatBaht(value: number): string {
  return bahtFormat.format(value);
}
