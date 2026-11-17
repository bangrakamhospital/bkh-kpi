import "server-only";

import type { RowDataPacket } from "mysql2";
import { cacheLife, cacheTag, io } from "next/cache";

import { fiscalYearRange, todayIsoDate } from "@/lib/kpi/fiscal-year";
import {
  NHSO_OTHER_ITEMS,
  NHSO_OTHER_RATE_YEAR,
  type NhsoOtherItemCode,
} from "@/lib/kpi/nhso-other-rates";
import { PPFS_CACHE_TAG } from "@/lib/kpi/ppfs";
import {
  buildItem,
  computeTotals,
  type Counts,
  failedItem,
  loadOneRow,
  logItemError,
  type Num,
  num,
  service,
} from "@/lib/kpi/ppfs-common";
import type { PpfsItem, PpfsSummary } from "@/lib/kpi/ppfs-types";
import {
  NHSO_PALLIATIVE_OPIOID_SQL,
  NHSO_TELEMED_SQL,
  nhsoPalliativeOpioidParams,
  nhsoTelemedParams,
} from "@/lib/kpi/sql/nhso-other-hosxp";
import type { ScreeningSqlContext } from "@/lib/kpi/sql/screening-common";

/**
 * "รายได้ สปสช. อื่นๆ" (/pp/other) — NHSO revenue outside the PP Fee
 * Schedule (telehealth, palliative strong opioid), HOSxP only, aggregates
 * only. Same PpfsSummary contract as getPpfsSummary, own items and totals.
 * Definitions: docs/kpi/ppfs-revenue-feasibility.md (10.7).
 */

export const NHSO_OTHER_CACHE_TAG = "kpi:nhso-other";

/**
 * Rendering contract identical to getPpfsSummary: `await io()` first,
 * render the caller inside <Suspense>; cached per fiscal year ("hours"
 * running year, "days" closed year, "minutes" when an item failed).
 * Tagged with both PPFS_CACHE_TAG (one revalidateTag refreshes every
 * NHSO revenue page) and NHSO_OTHER_CACHE_TAG.
 * Throws when every item query failed.
 */
export async function getNhsoOtherSummary(fiscalYear: number): Promise<PpfsSummary> {
  await io();
  const closed = todayIsoDate() > fiscalYearRange(fiscalYear).end;
  return loadNhsoOtherSummary(fiscalYear, closed);
}

interface TelemedRow extends RowDataPacket {
  target_visits: Num;
  done_visits: Num;
  billed_visits: Num;
}

interface OpioidRow extends RowDataPacket {
  done_person_months: Num;
  done_persons: Num;
}

/** One query per item, so a failed query fails only its own item. */
const LOADERS: Record<NhsoOtherItemCode, (ctx: ScreeningSqlContext) => Promise<Counts>> = {
  TELEMED: async (ctx) => {
    const r = await loadOneRow<TelemedRow>("TELEMED", NHSO_TELEMED_SQL, nhsoTelemedParams(ctx));
    return service(num(r.target_visits), num(r.done_visits), num(r.billed_visits));
  },
  PALLIATIVE_OPIOID: async (ctx) => {
    const r = await loadOneRow<OpioidRow>(
      "PALLIATIVE_OPIOID",
      NHSO_PALLIATIVE_OPIOID_SQL,
      nhsoPalliativeOpioidParams(ctx),
    );
    // ADP M00xx items are priced 0 in HOSxP: no billed figure
    return service(null, num(r.done_person_months), null);
  },
};

async function loadNhsoOtherSummary(
  fiscalYear: number,
  closed: boolean,
): Promise<PpfsSummary> {
  "use cache";
  cacheTag(PPFS_CACHE_TAG, NHSO_OTHER_CACHE_TAG);

  const range = fiscalYearRange(fiscalYear);
  const ctx: ScreeningSqlContext = {
    periodStart: range.start,
    countFrom: range.start,
    dataAsOf: range.end,
  };

  const settled = await Promise.allSettled(
    NHSO_OTHER_ITEMS.map((def) => LOADERS[def.code](ctx)),
  );
  const items: PpfsItem[] = NHSO_OTHER_ITEMS.map((def, i) => {
    const s = settled[i];
    if (s.status === "fulfilled") return buildItem(def, s.value);
    logItemError("kpi/nhso-other", def.code, s.reason);
    return failedItem(def);
  });

  const failed = items.filter((it) => it.error !== undefined).length;
  if (failed === items.length) {
    throw new Error("all NHSO other item queries failed");
  }

  // Exactly one cacheLife call per invocation (see cacheLife docs).
  if (failed > 0) {
    cacheLife("minutes");
  } else if (closed) {
    cacheLife("days");
  } else {
    cacheLife("hours");
  }

  return {
    fiscalYear,
    rateYear: NHSO_OTHER_RATE_YEAR,
    periodStart: range.start,
    periodEnd: range.end,
    closed,
    items,
    totals: computeTotals(items),
    updatedAt: new Date().toISOString(),
    source: "hosxp",
  };
}
