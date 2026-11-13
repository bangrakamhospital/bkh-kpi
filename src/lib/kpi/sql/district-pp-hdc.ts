import "server-only";

import type { QueryParams } from "@/lib/db/read-only-pool";
import { DISTRICT_TAMBONS } from "@/lib/kpi/district-areas";
import {
  hdcDateParam,
  HDC_UNIT_CODE,
  HDC_UNIT_LIST,
  type HdcScreeningSqlContext,
} from "./hdc-common";
import { sqlCodeList } from "./screening-common";

/**
 * Page-level helper queries of /district/pp (HDC 43 files ONLY, `sub_hdc`).
 * The item queries are in ./district-ppfs-hdc.ts and ./district-ppbasic-hdc.ts.
 * Verified with db-cli --conn 2 (2026-11-13). Index: docs/kpi/district-pp.md.
 */

const TAMBON_LIST = sqlCodeList(DISTRICT_TAMBONS.map((t) => t.code));

/**
 * Village units of the district: one row per (vid, 5-digit unit) of the
 * VILLAGE file in 650401–650411 ("GA0007535" rows collapse onto 07535).
 * 152 rows / 142 vids: 650404 หมู่ 01, 06, 09, 10, 11 are listed by both
 * 07529 and 11803. HDC has no village names (VILLAGE has no name column).
 * -> rows { vid, hospcode }. No parameters. ~10 ms.
 */
export const DISTRICT_PP_VILLAGES_SQL = `
SELECT DISTINCT v.vid AS vid,
       ${HDC_UNIT_CODE("v.hospcode")} AS hospcode
FROM village v
WHERE LEFT(v.vid, 6) IN (${TAMBON_LIST})
  AND LENGTH(v.vid) = 8
ORDER BY 1, 2
`;

/**
 * Data completeness: last SERVICE date of each district unit in
 * [:countFrom, :dataAsOf] (5-digit unit, "GA00…" merged). A unit with no
 * row has sent no visit for the period yet. FY2569: 11252 / 07527 / 07531
 * end 2026-07-31, 07539 2026-06-30. -> rows { hospcode, last_date
 * ('YYYYMMDD') }. ~1.2 s (index date_serv).
 */
export const DISTRICT_PP_UNIT_LAST_SERVICE_SQL = {
  sql: `
SELECT ${HDC_UNIT_CODE("s.hospcode")} AS hospcode,
       MAX(s.date_serv) AS last_date
FROM service s
WHERE s.date_serv >= :countFrom
  AND s.date_serv <= :dataAsOf
GROUP BY 1
HAVING hospcode IN (${HDC_UNIT_LIST})
`,
  buildParams: (ctx: HdcScreeningSqlContext): QueryParams => ({
    countFrom: hdcDateParam(ctx.countFrom),
    dataAsOf: hdcDateParam(ctx.dataAsOf),
  }),
};
