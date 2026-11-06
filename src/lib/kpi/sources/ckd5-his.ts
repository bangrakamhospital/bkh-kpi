import "server-only";

import type { RowDataPacket } from "mysql2";

import { query } from "@/lib/db/his";
import { CKD5_SQL } from "@/lib/kpi/sql/ckd5-hosxp";
import type {
  Ckd5DetailSource,
  Ckd5Raw,
  Ckd5Source,
  Ckd5SourceQuery,
  Ckd5VillageRaw,
} from "./ckd5-contract";
import type { ScreeningPersonRaw } from "./screening-contract";

/**
 * HOSxP-backed CKD5 source. Errors propagate (no fallback to mock) so the
 * caller can report them for this indicator only.
 */

interface TotalsRow extends RowDataPacket {
  current_cases: number | string;
  previous_cases: number | string;
  previous_same_period: number | string;
}

interface MonthlyRow extends RowDataPacket {
  period: "current" | "previous";
  /** 'YYYY-MM' of the case date. */
  bucket: string;
  new_cases: number | string;
}

interface VillageRow extends RowDataPacket {
  village_id: number | string | null;
  village_moo: string | null;
  village_name: string | null;
  current_cases: number | string;
  previous_cases: number | string;
}

interface PersonRow extends RowDataPacket {
  person_id: number | string;
  village_id: number | string | null;
  hn: string | null;
  full_name: string | null;
  sort_name: string | null;
  sex: string | null;
  age: number | string | null;
  screen_date: string | null;
}

function sqlParams(q: Ckd5SourceQuery) {
  return CKD5_SQL.buildParams({
    periodStart: q.periodStart,
    dataAsOf: q.dataAsOf,
  });
}

/** "2025-11" -> "2026-11" (same fiscal month one year later). */
function nextYearMonth(bucket: string): string {
  return `${Number(bucket.slice(0, 4)) + 1}${bucket.slice(4)}`;
}

function emptyToNull(value: string | null | undefined): string | null {
  const v = value?.trim();
  return v ? v : null;
}

export const hisCkd5Source: Ckd5Source = async (q): Promise<Ckd5Raw> => {
  const params = sqlParams(q);
  const [totalRows, monthRows] = await Promise.all([
    query<TotalsRow>(CKD5_SQL.totals, params),
    query<MonthlyRow>(CKD5_SQL.monthly, params),
  ]);

  const current = new Map<string, number>();
  const previous = new Map<string, number>(); // keyed by the month one year later
  for (const r of monthRows) {
    if (r.period === "current") current.set(r.bucket, Number(r.new_cases));
    else previous.set(nextYearMonth(r.bucket), Number(r.new_cases));
  }

  const t = totalRows[0];
  return {
    currentCases: Number(t?.current_cases ?? 0),
    previousCases: Number(t?.previous_cases ?? 0),
    previousSamePeriod: Number(t?.previous_same_period ?? 0),
    monthly: q.months.map((month) => ({
      month,
      currentCases: current.get(month) ?? 0,
      previousCases: previous.get(month) ?? 0,
    })),
  };
};

export const hisCkd5DetailSource: Ckd5DetailSource = {
  async villages(q): Promise<Ckd5VillageRaw[]> {
    const rows = await query<VillageRow>(CKD5_SQL.village, sqlParams(q));
    return rows.map((r) => ({
      villageId: Number(r.village_id ?? 0),
      moo: emptyToNull(r.village_moo),
      villageName: emptyToNull(r.village_name),
      currentCases: Number(r.current_cases),
      previousCases: Number(r.previous_cases),
    }));
  },

  async persons(q, filter, limit): Promise<ScreeningPersonRaw[]> {
    // The SQL has its own constant LIMIT (limit + 1); enforced again by the caller.
    void limit;
    const params = sqlParams(q);
    const rows =
      filter.kind === "village"
        ? await query<PersonRow>(CKD5_SQL.personsByVillage, {
            ...params,
            villageId: filter.villageId,
          })
        : await query<PersonRow>(CKD5_SQL.personsAll, params);
    return rows.map((r) => ({
      personId: Number(r.person_id),
      villageId: Number(r.village_id ?? 0),
      hn: emptyToNull(r.hn),
      fullName: emptyToNull(r.full_name) ?? "",
      sortName: emptyToNull(r.sort_name) ?? "",
      sex: emptyToNull(r.sex),
      age: Number(r.age ?? 0),
      screenDate: emptyToNull(r.screen_date),
    }));
  },
};
