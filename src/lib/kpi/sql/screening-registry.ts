import "server-only";

import type { RatioCode } from "@/lib/kpi/types";
import { BR_SQL, CX_SQL } from "./screening-cancer-hosxp";
import type { ScreeningSqlSet } from "./screening-common";
import { DM_CONFIRM_SQL, HT_CONFIRM_SQL } from "./hdc-confirm-hosxp";
import { RLU_CR_SQL, RLU_HBA1C_SQL, RLU_LDL_SQL } from "./hdc-rlu-hosxp";
import { DM_SQL, HT_SQL } from "./screening-hosxp";

/**
 * All screening SQL sets by indicator code. To add an indicator (e.g. BSE,
 * Service Plan 2.1): add the code to RatioCode + SCREENING_INDICATORS,
 * write a ScreeningSqlSpec, register it here and add mock base numbers.
 */
export const SCREENING_SQL: Record<RatioCode, ScreeningSqlSet> = {
  DM: DM_SQL,
  HT: HT_SQL,
  CX: CX_SQL,
  BR: BR_SQL,
  DMC: DM_CONFIRM_SQL,
  HTC: HT_CONFIRM_SQL,
  RLU_HBA1C: RLU_HBA1C_SQL,
  RLU_LDL: RLU_LDL_SQL,
  RLU_CR: RLU_CR_SQL,
};
