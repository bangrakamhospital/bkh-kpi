import "server-only";

import { connection } from "next/server";

import { getDistrictScreening, hdcCountFrom } from "@/lib/kpi/district";
import {
  DISTRICT_CODES,
  DISTRICT_TAMBONS,
  HDC_MIN_FISCAL_YEAR,
  isDistrictCode,
} from "@/lib/kpi/district-areas";
import {
  currentFiscalYear,
  resolveDataSourceKind,
  resolveScreeningPeriod,
} from "@/lib/kpi/screening";
import {
  HDC_PERSONS_PER_TAMBON_LIMIT,
  HDC_PERSONS_PER_VILLAGE_LIMIT,
} from "@/lib/kpi/sql/hdc-common";
import type {
  DistrictCode,
  DistrictPerson,
  DistrictPersonsResponse,
  DistrictScreeningResult,
} from "@/lib/kpi/types";
import {
  hisHdcPersonsSource,
  mockHdcPersonsSource,
  type HdcPersonRaw,
  type HdcPersonScope,
} from "./sources/district-hdc";

/**
 * District (HDC) person lists behind the village / sub-district counts.
 * Same CTEs as the aggregates (./sql/hdc-common personsSql), so the list
 * is exactly B and `screened` is exactly A of that area.
 *
 * !!! Patient-identifiable (names). NEVER cached ("use cache" / shared
 * caches), never logged; `connection()` forces request time. Only for
 * logged-in staff (the route calls requireSession first).
 * No CID / PID / HN / birth date leaves the server.
 */

export type DistrictPersonScope = HdcPersonScope;

const thaiCollator = new Intl.Collator("th", {
  sensitivity: "base",
  numeric: true,
});

/** Thrown for a syntactically valid area that is not in อ.บางระกำ (-> 404). */
export class DistrictAreaNotFoundError extends Error {
  override name = "DistrictAreaNotFoundError";
}

/**
 * Parses `vid` (8 digits) / `tambon` (6 digits). Exactly one is required.
 * Returns an error text (Thai) for invalid syntax; area membership is
 * checked by assertDistrictArea.
 */
export function parseDistrictScope(
  params: URLSearchParams,
): { ok: true; scope: DistrictPersonScope } | { ok: false; error: string } {
  const vid = params.get("vid");
  const tambon = params.get("tambon");
  if ((vid ? 1 : 0) + (tambon ? 1 : 0) !== 1) {
    return { ok: false, error: "ต้องระบุ vid (รหัสหมู่บ้าน 8 หลัก) หรือ tambon (รหัสตำบล 6 หลัก) อย่างใดอย่างหนึ่ง" };
  }
  if (vid) {
    if (!/^\d{8}$/.test(vid)) return { ok: false, error: "vid ต้องเป็นตัวเลข 8 หลัก" };
    return { ok: true, scope: { kind: "village", vid } };
  }
  if (!/^\d{6}$/.test(tambon ?? "")) {
    return { ok: false, error: "tambon ต้องเป็นตัวเลข 6 หลัก" };
  }
  return { ok: true, scope: { kind: "tambon", tambonCode: tambon as string } };
}

function tambonOf(scope: DistrictPersonScope): string {
  return scope.kind === "village" ? scope.vid.slice(0, 6) : scope.tambonCode;
}

/** @throws DistrictAreaNotFoundError when the area is outside 650401–650411. */
export function assertDistrictArea(scope: DistrictPersonScope): void {
  const code = tambonOf(scope);
  if (!DISTRICT_TAMBONS.some((t) => t.code === code)) {
    throw new DistrictAreaNotFoundError("area not in district");
  }
  if (scope.kind === "village" && scope.vid.slice(6) === "00") {
    throw new DistrictAreaNotFoundError("village 00");
  }
}

function mapSex(sex: string | null): DistrictPerson["sex"] {
  if (sex === "1") return "ชาย";
  if (sex === "2") return "หญิง";
  return "ไม่ระบุ";
}

/** Full years between 'YYYYMMDD' birth and ISO reference date. */
function ageOn(birth: string | null, isoDate: string): number {
  if (!birth || !/^\d{8}$/.test(birth)) return 0;
  const by = Number(birth.slice(0, 4));
  const bmd = birth.slice(4);
  const ry = Number(isoDate.slice(0, 4));
  const rmd = isoDate.slice(5, 7) + isoDate.slice(8, 10);
  return Math.max(0, ry - by - (rmd < bmd ? 1 : 0));
}

function compare(a: HdcPersonRaw, b: HdcPersonRaw): number {
  return (
    a.vid.localeCompare(b.vid) ||
    (a.screenDate ? 1 : 0) - (b.screenDate ? 1 : 0) ||
    thaiCollator.compare(a.sortName, b.sortName)
  );
}

export interface DistrictPersonsData extends DistrictPersonsResponse {
  /** Aggregates of the same indicator / year (cached, aggregates only). */
  aggregates: DistrictScreeningResult;
  /** Row limit that applied. */
  limit: number;
}

/**
 * B of one village / sub-district with A status, sorted (village, not yet
 * done first, Thai name order). Call at request time only.
 * @throws RangeError (fiscal year), DistrictAreaNotFoundError,
 *         HisConfigError / HisQueryError.
 */
export async function getDistrictPersons(
  code: DistrictCode,
  fiscalYear: number,
  scope: DistrictPersonScope,
): Promise<DistrictPersonsData> {
  await connection();
  assertDistrictArea(scope);
  const period = resolveScreeningPeriod(fiscalYear, new Date());
  const ctx = {
    periodStart: period.range.start,
    countFrom: hdcCountFrom(code, period.fy),
    dataAsOf: period.dataAsOf,
  };
  const source =
    resolveDataSourceKind() === "mock"
      ? mockHdcPersonsSource
      : hisHdcPersonsSource;
  const limit =
    scope.kind === "village"
      ? HDC_PERSONS_PER_VILLAGE_LIMIT
      : HDC_PERSONS_PER_TAMBON_LIMIT;

  // Aggregates first (cached): a village without any target person is
  // reported as "not found" instead of running the person query.
  const aggregates = await getDistrictScreening(code, period.fy);
  const tambon = aggregates.tambons.find((t) => t.tambonCode === tambonOf(scope));
  if (
    scope.kind === "village" &&
    !tambon?.villages.some((v) => v.key === scope.vid)
  ) {
    throw new DistrictAreaNotFoundError("village has no target group");
  }
  const rows = await source(code, ctx, scope);
  const truncated = rows.length > limit;
  const kept = (truncated ? rows.slice(0, limit) : rows).sort(compare);

  const persons = kept.map(
    (r, i): DistrictPerson => ({
      key: String(i + 1),
      fullName: r.fullName,
      sex: mapSex(r.sex),
      age: ageOn(r.birth, period.range.start),
      vid: r.vid,
      moo: String(Number(r.vid.slice(6, 8))),
      unitName: r.unitName ?? r.unitCode ?? "",
      screened: r.screenDate !== null,
      screenDate: r.screenDate,
      screenUnitName: r.screenDate
        ? (r.screenUnitName ?? r.screenUnitCode)
        : null,
      ...(r.suspectDate !== undefined ? { suspectDate: r.suspectDate } : {}),
    }),
  );

  return {
    code,
    fiscalYear: period.fy,
    scope,
    dataAsOf: tambon?.dataAsOf ?? null,
    persons,
    truncated,
    aggregates,
    limit,
  };
}

/** Validated query of the persons / export routes. */
export interface DistrictPersonsQuery {
  code: DistrictCode;
  fiscalYear: number;
  scope: DistrictPersonScope;
}

/**
 * Validates `code` (ratio DistrictCode), `fy` (BE, 2569 .. current FY,
 * default current) and vid / tambon. Error texts are Thai, safe to show.
 */
export function parseDistrictPersonsQuery(
  params: URLSearchParams,
  now: Date,
): { ok: true; value: DistrictPersonsQuery } | { ok: false; error: string } {
  const code = params.get("code");
  if (!isDistrictCode(code)) {
    return {
      ok: false,
      error: `code ต้องเป็น ${DISTRICT_CODES.join(", ")} อย่างใดอย่างหนึ่ง`,
    };
  }
  const currentFy = currentFiscalYear(now);
  const fyRaw = params.get("fy");
  const fy =
    fyRaw === null || fyRaw === ""
      ? currentFy
      : /^\d{4}$/.test(fyRaw)
        ? Number(fyRaw)
        : NaN;
  if (!Number.isInteger(fy) || fy < HDC_MIN_FISCAL_YEAR || fy > currentFy) {
    return {
      ok: false,
      error: `fy ต้องเป็นปีงบประมาณ พ.ศ. ระหว่าง ${HDC_MIN_FISCAL_YEAR} ถึง ${currentFy}`,
    };
  }
  const scope = parseDistrictScope(params);
  if (!scope.ok) return scope;
  return { ok: true, value: { code, fiscalYear: fy, scope: scope.scope } };
}

/** Audit "village" field: vid / tambon code (aggregate identifiers only). */
export function scopeLabel(scope: DistrictPersonScope): string {
  return scope.kind === "village" ? scope.vid : scope.tambonCode;
}
