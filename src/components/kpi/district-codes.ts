import type { DistrictKpiCode, DistrictOnlyCode } from "@/lib/kpi/types";
import {
  DISTRICT_ONLY_CATEGORY,
  KPI_CATEGORIES,
  type KpiCategory,
} from "@/lib/kpi/categories";
import {
  CAVITY_FREE_INDICATOR,
  DSPM_INDICATOR,
} from "@/lib/kpi/screening-indicators";
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
  STEMI: "stemi",
  DSPM: "dspm",
  CAVITY_FREE: "cavityFree",
};

/** District-only indicators (HDC reports without a hospital-page row). */
const DISTRICT_ONLY_LABEL: Record<DistrictOnlyCode, string> = {
  DSPM: DSPM_INDICATOR.shortName,
  CAVITY_FREE: CAVITY_FREE_INDICATOR.shortName,
};

function isDistrictOnly(code: DistrictKpiCode): code is DistrictOnlyCode {
  return code in DISTRICT_ONLY_CATEGORY;
}

/**
 * Button label = hospital-page number + title (INDICATOR_ROWS), e.g.
 * "1. คัดกรองเบาหวาน", so both tabs use the same names / numbering.
 * District-only indicators have no number.
 */
export function districtLabel(code: DistrictKpiCode): string {
  if (isDistrictOnly(code)) return DISTRICT_ONLY_LABEL[code];
  const row = INDICATOR_ROWS.find((r) => r.code === code);
  return row ? `${row.no}. ${row.title}` : code;
}

/**
 * District indicator buttons grouped by the shared 16 categories
 * (category-number order, indicator order = hospital-page order, then the
 * district-only indicators of the category).
 */
export const DISTRICT_CATEGORY_GROUPS: readonly {
  category: KpiCategory;
  codes: readonly DistrictKpiCode[];
}[] = KPI_CATEGORIES.map((category) => ({
  category,
  codes: [
    ...INDICATOR_ROWS.flatMap((r) =>
      r.code && r.categoryId === category.id ? [r.code] : [],
    ),
    ...(Object.keys(DISTRICT_ONLY_CATEGORY) as DistrictOnlyCode[]).filter(
      (c) => DISTRICT_ONLY_CATEGORY[c] === category.id,
    ),
  ],
}));

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
