import type { DistrictKpiCode } from "@/lib/kpi/types";
import { INDICATOR_ROWS } from "./indicator-rows";
import type { AccentKey } from "./indicator-theme";

/** Accent colour of each district indicator (same as the hospital table). */
export const DISTRICT_ACCENT: Record<DistrictKpiCode, AccentKey> = {
  DM: "dm",
  HT: "ht",
  CX: "cervix",
  BR: "breast",
  DMC: "confirmDm",
  HTC: "confirmHt",
  RLU_HBA1C: "hba1c",
  RLU_LDL: "ldl",
  RLU_CR: "creatinine",
  CKD5: "ckd5",
};

/**
 * Button label = hospital-page number + title (INDICATOR_ROWS), e.g.
 * "1. คัดกรองเบาหวาน", so both tabs use the same names / numbering.
 */
export function districtLabel(code: DistrictKpiCode): string {
  const row = INDICATOR_ROWS.find((r) => r.code === code);
  return row ? `${row.no}. ${row.title}` : code;
}

/** Button groups of the district page (reading aid on small screens). */
export const DISTRICT_CODE_GROUPS: readonly {
  label: string;
  codes: readonly DistrictKpiCode[];
}[] = [
  { label: "คัดกรอง / ยืนยัน NCD", codes: ["DM", "HT", "DMC", "HTC"] },
  { label: "คัดกรองมะเร็ง", codes: ["CX", "BR"] },
  { label: "ผลตรวจผู้ป่วยเบาหวาน", codes: ["RLU_HBA1C", "RLU_LDL", "RLU_CR"] },
  { label: "อื่น ๆ", codes: ["CKD5"] },
];

/** RLU = lab test indicators (A = "ได้รับการตรวจ"). */
export function isLabIndicator(code: DistrictKpiCode): boolean {
  return code.startsWith("RLU_");
}

/** Wording of A for ratio indicators. */
export function numeratorLabel(code: DistrictKpiCode): string {
  if (isLabIndicator(code)) return "จำนวนที่ได้รับการตรวจ";
  if (code === "DMC" || code === "HTC") return "จำนวนที่ได้รับการยืนยันวินิจฉัย";
  return "จำนวนที่ได้รับการคัดกรอง";
}
