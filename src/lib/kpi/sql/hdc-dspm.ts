import "server-only";

import type { QueryParams } from "@/lib/db/read-only-pool";
import { hdcDateParam, RESIDENTS_CTE } from "./hdc-common";
import { sqlCodeList } from "./screening-common";

/**
 * HDC standard report "ร้อยละของเด็กอายุ 0-5 ปี มีพัฒนาการสมวัย (DSPM)"
 * (HDC source table s_childdev_specialpp, กรมอนามัย template v.07112023)
 * re-computed from the 43 files of the district HDC database (`sub_hdc`
 * has no s_ / t_childdev tables), per village of residence.
 *
 * Target (B): district residents (`residents`, TYPEAREA 1/3, alive, Thai
 * nation '099') whose age reaches 9, 18, 30, 42 or 60 months
 * (d_start = birth + m months) inside the fiscal year — the WHOLE fiscal
 * year like HDC (targets later in the year are included from 1 Oct).
 * One row per child × age group.
 *
 * Screening window: d_start .. d_start + 30 days (HDC: "ภายใน 30 วัน
 * หลังจากเด็กอายุแตะ 9, 18, 30, 42, 60 เดือน"). First screening = earliest
 * SPECIALPP date in the window with a DSPM screening code (any unit, by
 * CID); its result:
 *   3 = 1B262 (สงสัยล่าช้า ส่งต่อทันที)
 *   2 = 1B261 or a per-domain 1B2x1 (สงสัยล่าช้า กระตุ้น 30 วัน)
 *   1 = 1B260 or per-domain 1B2x0 (สมวัยครั้งแรก)
 * Follow-up of result 2 = 1B260 (สมวัยหลังกระตุ้น) or 1B2x2 (ล่าช้า ส่งต่อ)
 * after the first date, within 30 days. Without follow-up: waiting while
 * :evalDate <= first + 30 days, otherwise lost (ติดตามไม่ได้).
 * สมวัย = first result 1 + follow-up 1B260.
 *
 * Parameters ('YYYYMMDD'): :periodStart :periodEnd :birthFrom :birthTo
 * :evalDate (also the last SPECIALPP date read).
 * -> rows { vid, age_months, target, screened, normal_first, suspect_wait,
 *           suspect_refer, followed, normal_after, delayed_after, waiting,
 *           lost } (one per village × age group with targets)
 */

/** Age groups (months) of the DSPM screening schedule. */
export const DSPM_AGE_MONTHS = [9, 18, 30, 42, 60] as const;

/** Screening / follow-up window (days after the start). */
export const DSPM_WINDOW_DAYS = 30;

const NORMAL = ["1B260", "1B200", "1B210", "1B220", "1B230", "1B240"];
const SUSPECT = ["1B261", "1B201", "1B211", "1B221", "1B231", "1B241"];
const REFER = ["1B262"];
const DELAYED = ["1B202", "1B212", "1B222", "1B232", "1B242"];

const SCREEN_LIST = sqlCodeList([...NORMAL, ...SUSPECT, ...REFER]);
const SUSPECT_LIST = sqlCodeList(SUSPECT);
const REFER_LIST = sqlCodeList(REFER);
const DELAYED_LIST = sqlCodeList(DELAYED);
const FOLLOW_LIST = sqlCodeList(["1B260", ...DELAYED]);
const ALL_LIST = sqlCodeList([...NORMAL, ...SUSPECT, ...REFER, ...DELAYED]);
const AGES_SQL = DSPM_AGE_MONTHS.map((m, i) =>
  i === 0 ? `SELECT ${m} AS m` : `SELECT ${m}`,
).join(" UNION ALL ");
const W = DSPM_WINDOW_DAYS;

/** 'YYYYMMDD' string -> DATE. */
const D = (col: string) => `STR_TO_DATE(${col}, '%Y%m%d')`;

export const HDC_DSPM_VILLAGE_SQL = `${RESIDENTS_CTE},
ages AS (${AGES_SQL}),
tg AS (
  SELECT r.cid, r.vid, a.m,
         DATE_ADD(${D("r.birth")}, INTERVAL a.m MONTH) AS d_start
  FROM residents r
  CROSS JOIN ages a
  WHERE r.nation = '099'
    AND r.birth >= :birthFrom
    AND r.birth <= :birthTo
    AND DATE_ADD(${D("r.birth")}, INTERVAL a.m MONTH)
        BETWEEN ${D(":periodStart")} AND ${D(":periodEnd")}
),
sp AS (
  SELECT s.cid, ${D("s.date_serv")} AS d, s.ppspecial AS code
  FROM specialpp s
  WHERE s.ppspecial IN (${ALL_LIST})
    AND s.date_serv >= :periodStart
    AND s.date_serv <= :evalDate
    AND LENGTH(s.cid) = 32
),
fs AS (
  SELECT t.cid, t.m, MIN(sp.d) AS d1
  FROM tg t
  JOIN sp
    ON sp.cid = t.cid
   AND sp.d BETWEEN t.d_start AND DATE_ADD(t.d_start, INTERVAL ${W} DAY)
  WHERE sp.code IN (${SCREEN_LIST})
  GROUP BY t.cid, t.m
),
fr AS (
  SELECT fs.cid, fs.m, fs.d1,
         CASE WHEN MAX(sp.code IN (${REFER_LIST})) = 1 THEN 3
              WHEN MAX(sp.code IN (${SUSPECT_LIST})) = 1 THEN 2
              ELSE 1 END AS status1
  FROM fs
  JOIN sp ON sp.cid = fs.cid AND sp.d = fs.d1 AND sp.code IN (${SCREEN_LIST})
  GROUP BY fs.cid, fs.m, fs.d1
),
fu AS (
  SELECT fr.cid, fr.m,
         MAX(sp.code = '1B260') AS ok2,
         MAX(sp.code IN (${DELAYED_LIST})) AS late2
  FROM fr
  JOIN sp
    ON sp.cid = fr.cid
   AND sp.d > fr.d1
   AND sp.d <= DATE_ADD(fr.d1, INTERVAL ${W} DAY)
   AND sp.code IN (${FOLLOW_LIST})
  WHERE fr.status1 = 2
  GROUP BY fr.cid, fr.m
)
SELECT t.vid AS vid,
       t.m AS age_months,
       COUNT(*) AS target,
       COUNT(fr.cid) AS screened,
       SUM(fr.status1 = 1) AS normal_first,
       SUM(fr.status1 = 2) AS suspect_wait,
       SUM(fr.status1 = 3) AS suspect_refer,
       COUNT(fu.cid) AS followed,
       SUM(fu.ok2 = 1) AS normal_after,
       SUM(fu.late2 = 1) AS delayed_after,
       SUM(fr.status1 = 2 AND fu.cid IS NULL
           AND ${D(":evalDate")} <= DATE_ADD(fr.d1, INTERVAL ${W} DAY)) AS waiting,
       SUM(fr.status1 = 2 AND fu.cid IS NULL
           AND ${D(":evalDate")} > DATE_ADD(fr.d1, INTERVAL ${W} DAY)) AS lost
FROM tg t
LEFT JOIN fr ON fr.cid = t.cid AND fr.m = t.m
LEFT JOIN fu ON fu.cid = t.cid AND fu.m = t.m
GROUP BY t.vid, t.m
`;

/** ISO date plus / minus whole months (day clamped like MySQL DATE_ADD). */
function addMonths(isoDate: string, months: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(
    Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0),
  ).getUTCDate();
  first.setUTCDate(Math.min(d, last));
  return first.toISOString().slice(0, 10);
}

function addDays(isoDate: string, days: number): string {
  const t = Date.parse(`${isoDate}T00:00:00Z`) + days * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

export interface HdcDspmContext {
  /** ISO 1 Oct of the fiscal year. */
  periodStart: string;
  /** ISO 30 Sep of the fiscal year. */
  periodEnd: string;
  /** ISO today. */
  today: string;
}

/**
 * Birth range covers every child reaching 9..60 months in the FY;
 * evalDate = today, capped at periodEnd + 60 days (screening window of the
 * last targets + follow-up) so a closed fiscal year stays stable.
 */
export function hdcDspmParams(ctx: HdcDspmContext): QueryParams {
  const maxAge = DSPM_AGE_MONTHS[DSPM_AGE_MONTHS.length - 1];
  const minAge = DSPM_AGE_MONTHS[0];
  const cap = addDays(ctx.periodEnd, 2 * DSPM_WINDOW_DAYS);
  return {
    periodStart: hdcDateParam(ctx.periodStart),
    periodEnd: hdcDateParam(ctx.periodEnd),
    birthFrom: hdcDateParam(addMonths(ctx.periodStart, -maxAge - 1)),
    birthTo: hdcDateParam(addMonths(ctx.periodEnd, -minAge)),
    evalDate: hdcDateParam(ctx.today < cap ? ctx.today : cap),
  };
}
