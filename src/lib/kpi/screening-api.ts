import "server-only";

import { HisConfigError, HisQueryError } from "@/lib/db/his";
import { currentFiscalYear, MIN_FISCAL_YEAR } from "@/lib/kpi/screening";
import {
  isScreeningCode,
  REDUCTION_CODES,
  SCREENING_CODES,
} from "@/lib/kpi/screening-indicators";
import type { ScreeningCode } from "@/lib/kpi/types";

/**
 * Shared helpers for the /api/kpi/screening/* route handlers:
 * strict query-param validation and uniform JSON errors.
 */

export interface ScreeningQuery {
  code: ScreeningCode;
  fiscalYear: number;
  /** null when not supplied (only allowed when village is optional). */
  villageId: number | null;
}

type VillageRule = "none" | "optional" | "required";

const MAX_INT32 = 2_147_483_647;

export type ParseResult =
  | { ok: true; value: ScreeningQuery }
  | { ok: false; error: string };

/**
 * Validates `code` (one of SCREENING_CODES), `fy` (BE year in [2560, current FY]) and,
 * depending on `village`, `village` (positive integer).
 * Unknown extra params are ignored.
 */
export function parseScreeningQuery(
  params: URLSearchParams,
  village: VillageRule,
  now: Date,
): ParseResult {
  const code = params.get("code");
  if (!isScreeningCode(code)) {
    return {
      ok: false,
      error: `code ต้องเป็น ${[...SCREENING_CODES, ...REDUCTION_CODES].join(", ")} อย่างใดอย่างหนึ่ง`,
    };
  }

  const currentFy = currentFiscalYear(now);
  const fyRaw = params.get("fy");
  const fy = fyRaw !== null && /^\d{4}$/.test(fyRaw) ? Number(fyRaw) : NaN;
  if (!Number.isInteger(fy) || fy < MIN_FISCAL_YEAR || fy > currentFy) {
    return {
      ok: false,
      error: `fy ต้องเป็นปีงบประมาณ พ.ศ. ระหว่าง ${MIN_FISCAL_YEAR} ถึง ${currentFy}`,
    };
  }

  let villageId: number | null = null;
  if (village !== "none") {
    const raw = params.get("village");
    if (raw === null || raw === "") {
      if (village === "required") {
        return { ok: false, error: "ต้องระบุ village" };
      }
    } else {
      const n = /^[1-9]\d{0,9}$/.test(raw) ? Number(raw) : NaN;
      if (!Number.isInteger(n) || n > MAX_INT32) {
        return { ok: false, error: "village ต้องเป็นจำนวนเต็มบวก" };
      }
      villageId = n;
    }
  }

  return { ok: true, value: { code, fiscalYear: fy, villageId } };
}

const NO_STORE = "private, no-store";

export function jsonError(status: number, error: string): Response {
  return Response.json(
    { error },
    { status, headers: { "Cache-Control": NO_STORE } },
  );
}

/**
 * Maps an exception to a JSON error response. Database / config details
 * are never sent to the client; only the error class and driver code are
 * logged (no SQL, parameters, credentials, or patient data).
 */
export function routeErrorResponse(route: string, err: unknown): Response {
  // Fiscal year became invalid between validation and use (FY boundary).
  if (err instanceof RangeError) {
    return jsonError(400, "fy ไม่อยู่ในช่วงที่รองรับ");
  }
  const name = err instanceof Error ? err.name : "UnknownError";
  const code = err instanceof HisQueryError ? (err.code ?? "") : "";
  const kind = err instanceof HisConfigError ? "config" : "runtime";
  console.error(`[${route}] ${kind} error: ${name}${code ? ` (${code})` : ""}`);
  return jsonError(500, "ไม่สามารถดึงข้อมูลได้");
}
