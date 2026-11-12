/**
 * Shared 16 indicator categories of both KPI tabs (/hospital = HOSxP,
 * /district = HDC). Client-safe (constants only).
 */

import type { ScreeningCode } from "./types";

export const CATEGORY_IDS = [
  "population",
  "mch",
  "early-childhood",
  "school-age",
  "working-age",
  "elderly",
  "dm",
  "ht",
  "ckd",
  "cvd",
  "mental-health",
  "communicable",
  "dental",
  "thai-medicine",
  "injury",
  "service-plan",
] as const;

export type CategoryId = (typeof CATEGORY_IDS)[number];

export interface KpiCategory {
  id: CategoryId;
  number: number;
  name: string;
}

export const KPI_CATEGORIES: readonly KpiCategory[] = [
  { id: "population", number: 1, name: "ประชากรและการเข้าถึงบริการ" },
  { id: "mch", number: 2, name: "แม่และเด็ก" },
  { id: "early-childhood", number: 3, name: "พัฒนาการเด็กปฐมวัย" },
  { id: "school-age", number: 4, name: "วัยเรียนและวัยรุ่น" },
  { id: "working-age", number: 5, name: "วัยทำงาน" },
  { id: "elderly", number: 6, name: "ผู้สูงอายุ" },
  { id: "dm", number: 7, name: "เบาหวาน (DM)" },
  { id: "ht", number: 8, name: "ความดันโลหิตสูง (HT)" },
  { id: "ckd", number: 9, name: "โรคไตเรื้อรัง (CKD)" },
  { id: "cvd", number: 10, name: "โรคหัวใจและหลอดเลือด" },
  { id: "mental-health", number: 11, name: "สุขภาพจิต" },
  { id: "communicable", number: 12, name: "โรคติดต่อ" },
  { id: "dental", number: 13, name: "ทันตสาธารณสุข" },
  { id: "thai-medicine", number: 14, name: "การแพทย์แผนไทย" },
  { id: "injury", number: 15, name: "อุบัติเหตุและการบาดเจ็บ" },
  { id: "service-plan", number: 16, name: "Service Plan และบริการสุขภาพ" },
];

/** Set to false to hide categories that have no indicators yet. */
export const SHOW_EMPTY_CATEGORIES = true;

export const EMPTY_CATEGORY_NOTE = "ยังไม่มีตัวชี้วัด";

/** Category of every existing indicator (same codes on both tabs). */
export const INDICATOR_CATEGORY: Record<ScreeningCode, CategoryId> = {
  DM: "dm",
  HT: "ht",
  CX: "working-age",
  BR: "working-age",
  DMC: "dm",
  HTC: "ht",
  RLU_HBA1C: "dm",
  RLU_LDL: "dm",
  RLU_CR: "dm",
  CKD5: "ckd",
  STEMI: "cvd",
};

export function categoryAnchorId(id: CategoryId): string {
  return `cat-${id}`;
}
