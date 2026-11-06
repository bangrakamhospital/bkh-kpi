import "server-only";

import type { RowDataPacket } from "mysql2";

import { query } from "@/lib/db/his";
import { SCREENING_SQL } from "@/lib/kpi/sql/screening-registry";
import type {
  ScreeningDetailSource,
  ScreeningPersonRaw,
  ScreeningRawIndicator,
  ScreeningSource,
  ScreeningSourceQuery,
  ScreeningVillageRaw,
} from "./screening-contract";

/**
 * HOSxP-backed screening source. Errors propagate (no fallback to mock)
 * so the caller can report them (per indicator for the headline).
 */

interface EligibleRow extends RowDataPacket {
  eligible: number | string;
}

interface MonthlyRow extends RowDataPacket {
  /** 'prior' (before periodStart) or 'YYYY-MM'. */
  bucket: string;
  screened: number | string;
}

interface VillageRow extends RowDataPacket {
  village_id: number | string | null;
  village_moo: string | null;
  village_name: string | null;
  eligible: number | string;
  numerator: number | string;
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
  /** Only the HDC 2.1 / 2.2 queries select this column. */
  suspect_date?: string | null;
}

function sqlContext(q: ScreeningSourceQuery) {
  return {
    periodStart: q.periodStart,
    countFrom: q.countFrom,
    dataAsOf: q.dataAsOf,
  };
}

export const hisScreeningSource: ScreeningSource = async (
  code,
  q,
): Promise<ScreeningRawIndicator> => {
  const sql = SCREENING_SQL[code];
  const params = sql.buildParams(sqlContext(q));

  const [eligibleRows, monthRows] = await Promise.all([
    query<EligibleRow>(sql.eligible, params),
    query<MonthlyRow>(sql.monthly, params),
  ]);

  let priorScreened = 0;
  const byMonth = new Map<string, number>();
  for (const r of monthRows) {
    if (r.bucket === "prior") priorScreened += Number(r.screened);
    else byMonth.set(r.bucket, Number(r.screened));
  }

  return {
    code,
    eligible: Number(eligibleRows[0]?.eligible ?? 0),
    priorScreened,
    monthlyScreened: q.months.map((month) => ({
      month,
      screened: byMonth.get(month) ?? 0,
    })),
  };
};

function emptyToNull(value: string | null | undefined): string | null {
  const v = value?.trim();
  return v ? v : null;
}

export const hisScreeningDetailSource: ScreeningDetailSource = {
  async villages(code, q): Promise<ScreeningVillageRaw[]> {
    const sql = SCREENING_SQL[code];
    const rows = await query<VillageRow>(
      sql.village,
      sql.buildParams(sqlContext(q)),
    );
    return rows.map((r) => ({
      villageId: Number(r.village_id ?? 0),
      moo: emptyToNull(r.village_moo),
      villageName: emptyToNull(r.village_name),
      eligible: Number(r.eligible),
      numerator: Number(r.numerator),
    }));
  },

  async persons(code, q, filter, limit): Promise<ScreeningPersonRaw[]> {
    // The SQL has its own constant LIMIT (limit + 1); `limit` is enforced
    // again by the caller.
    void limit;
    const sql = SCREENING_SQL[code];
    const params = sql.buildParams(sqlContext(q));
    const rows =
      filter.kind === "village"
        ? await query<PersonRow>(sql.personsByVillage, {
            ...params,
            villageId: filter.villageId,
          })
        : await query<PersonRow>(sql.personsAll, params);
    return rows.map((r) => ({
      personId: Number(r.person_id),
      villageId: Number(r.village_id ?? 0),
      hn: emptyToNull(r.hn),
      fullName: emptyToNull(r.full_name) ?? "",
      sortName: emptyToNull(r.sort_name) ?? "",
      sex: emptyToNull(r.sex),
      age: Number(r.age ?? 0),
      screenDate: emptyToNull(r.screen_date),
      ...(r.suspect_date !== undefined
        ? { suspectDate: emptyToNull(r.suspect_date) }
        : {}),
    }));
  },
};
