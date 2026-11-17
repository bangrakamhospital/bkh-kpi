import "server-only";

import type { RowDataPacket } from "mysql2";

import { HisQueryError, query, type QueryParams } from "@/lib/db/his";
import type { PpfsItemDef } from "@/lib/kpi/ppfs-rates";
import type {
  PpfsItem,
  PpfsPotential,
  PpfsTotals,
  PpfsVillageRow,
} from "@/lib/kpi/ppfs-types";

/**
 * Shared building blocks of the NHSO revenue loaders: PPFS (./ppfs.ts,
 * /pp) and other NHSO revenue (./nhso-other.ts, /pp/other). Both return a
 * PpfsSummary of PpfsItem rows: rates are applied here (TypeScript), never
 * in SQL.
 */

export type Num = number | string | null;

export const num = (v: Num | undefined): number => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

export interface Counts {
  /** null = no target population (grade C). */
  target: number | null;
  done: number;
  /** null = no billing code / not visible in HOSxP. */
  billed: number | null;
  villages: PpfsVillageRow[] | null;
  potential?: PpfsPotential | null;
}

/** Counts of a service-based item (no village breakdown). */
export const service = (
  target: number | null,
  done: number,
  billed: number | null,
): Counts => ({ target, done, billed, villages: null });

export function buildItem(def: PpfsItemDef<string>, c: Counts): PpfsItem {
  const targetBaht = c.target === null ? null : c.target * def.rate;
  const earnedBaht = c.done * def.rate;
  return {
    ...def,
    target: c.target,
    done: c.done,
    billed: c.billed,
    targetBaht,
    earnedBaht,
    gapBaht: targetBaht === null ? null : Math.max(0, targetBaht - earnedBaht),
    potential: c.potential ?? null,
    villages: c.villages,
  };
}

export function failedItem(def: PpfsItemDef<string>): PpfsItem {
  return {
    ...def,
    target: null,
    done: 0,
    billed: null,
    targetBaht: null,
    earnedBaht: 0,
    gapBaht: null,
    potential: null,
    villages: def.population === "catchment" ? [] : null,
    error: "ไม่สามารถดึงข้อมูลรายการนี้ได้",
  };
}

export function computeTotals(items: readonly PpfsItem[]): PpfsTotals {
  let targetBaht = 0;
  let gapBaht = 0;
  let earnedAgainstTarget = 0;
  let earnedBaht = 0;
  for (const it of items) {
    earnedBaht += it.earnedBaht;
    if (it.targetBaht !== null) {
      targetBaht += it.targetBaht;
      earnedAgainstTarget += it.earnedBaht;
      gapBaht += it.gapBaht ?? 0;
    }
  }
  const coveragePercent =
    targetBaht > 0 ? Math.min(100, (earnedAgainstTarget / targetBaht) * 100) : 0;
  return { targetBaht, earnedBaht, gapBaht, coveragePercent };
}

/** Runs a one-row aggregate query; throws when it returns no row. */
export async function loadOneRow<T extends RowDataPacket>(
  label: string,
  sql: string,
  params: QueryParams,
): Promise<T> {
  const rows = await query<T>(sql, params);
  const row = rows[0];
  if (!row) throw new Error(`${label} query returned no row`);
  return row;
}

/** The row of a settled query; rethrows its error when it failed. */
export function rowOf<T>(s: PromiseSettledResult<T>): T {
  if (s.status === "rejected") throw s.reason;
  return s.value;
}

/** Logs a failed item without the query text or parameters. */
export function logItemError(scope: string, code: string, err: unknown): void {
  const name = err instanceof Error ? err.name : "UnknownError";
  const driverCode = err instanceof HisQueryError ? (err.code ?? "") : "";
  console.error(
    `[${scope}] item ${code} failed: ${name}${driverCode ? ` (${driverCode})` : ""}`,
  );
}
