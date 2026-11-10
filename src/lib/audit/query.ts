import "server-only";

import { createReadStream } from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline";

import {
  auditDir,
  auditFileName,
  BANGKOK_OFFSET_MS,
  bangkokMonthKey,
  bangkokMonthStart,
  listAuditMonths,
} from "./store";
import {
  AUDIT_ACTION_GROUPS,
  isAuditAction,
  type AuditAction,
  type AuditRecord,
} from "./types";

/**
 * Read side of the audit log (admin page / export). Streams only the
 * monthly files overlapping the date range, line by line, and keeps at
 * most MAX_MATCHES matching records (the newest ones) in memory.
 */

const DAY_MS = 86_400_000;
export const AUDIT_PAGE_SIZE = 100;
/** Records kept per query (list pages / export rows). */
export const AUDIT_MAX_MATCHES = 20_000;
/** Longest date range of one query (inclusive days). */
export const AUDIT_MAX_RANGE_DAYS = 366;
const MAX_LINE_BYTES = 8 * 1024;
const MAX_USER_FILTER = 64;

export interface AuditFilter {
  /** Bangkok dates YYYY-MM-DD, inclusive. */
  from: string;
  to: string;
  /** Case-insensitive substring of actor / actorName. */
  user: string;
  /** Specific action, a group ("group:auth"), or "" = all. */
  action: AuditAction | `group:${string}` | "";
  page: number;
}

export type ParsedFilter =
  | { ok: true; value: AuditFilter }
  | { ok: false; error: string };

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Bangkok date YYYY-MM-DD of an instant. */
export function bangkokDate(ms: number): string {
  return new Date(ms + BANGKOK_OFFSET_MS).toISOString().slice(0, 10);
}

/** UTC instant where Bangkok date `d` starts (null = invalid). */
function bangkokDayStart(d: string): number | null {
  const m = DATE_RE.exec(d);
  if (!m) return null;
  const [y, mo, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const utc = Date.UTC(y, mo - 1, day);
  const back = new Date(utc);
  if (
    back.getUTCFullYear() !== y ||
    back.getUTCMonth() !== mo - 1 ||
    back.getUTCDate() !== day
  ) {
    return null;
  }
  return utc - BANGKOK_OFFSET_MS;
}

export function parseAuditFilter(
  params: URLSearchParams,
  now = Date.now(),
): ParsedFilter {
  const today = bangkokDate(now);
  const to = params.get("to")?.trim() || today;
  const from = params.get("from")?.trim() || bangkokDate(now - 6 * DAY_MS);
  const fromMs = bangkokDayStart(from);
  const toMs = bangkokDayStart(to);
  if (fromMs === null || toMs === null) {
    return { ok: false, error: "รูปแบบวันที่ไม่ถูกต้อง" };
  }
  if (fromMs > toMs) {
    return { ok: false, error: "วันที่เริ่มต้องไม่หลังวันที่สิ้นสุด" };
  }
  if ((toMs - fromMs) / DAY_MS + 1 > AUDIT_MAX_RANGE_DAYS) {
    return {
      ok: false,
      error: `เลือกช่วงวันที่ได้ไม่เกิน ${AUDIT_MAX_RANGE_DAYS} วัน`,
    };
  }

  const user = (params.get("user") ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .slice(0, MAX_USER_FILTER);

  const rawAction = params.get("action")?.trim() ?? "";
  let action: AuditFilter["action"] = "";
  if (rawAction) {
    if (isAuditAction(rawAction)) action = rawAction;
    else if (
      rawAction.startsWith("group:") &&
      AUDIT_ACTION_GROUPS.some((g) => `group:${g.key}` === rawAction)
    ) {
      action = rawAction as `group:${string}`;
    } else {
      return { ok: false, error: "ประเภทการกระทำไม่ถูกต้อง" };
    }
  }

  const rawPage = params.get("page")?.trim() ?? "1";
  const page = /^\d{1,4}$/.test(rawPage) ? Math.max(1, Number(rawPage)) : 1;

  return { ok: true, value: { from, to, user, action, page } };
}

/** Compact, non-identifying text of the filter (for the audit_view record). */
export function filterSummary(f: AuditFilter): string {
  const q = new URLSearchParams({ from: f.from, to: f.to });
  if (f.action) q.set("action", f.action);
  if (f.user) q.set("user", f.user);
  if (f.page > 1) q.set("page", String(f.page));
  return q.toString();
}

function actionPredicate(action: AuditFilter["action"]) {
  if (!action) return () => true;
  if (action.startsWith("group:")) {
    const group = AUDIT_ACTION_GROUPS.find((g) => `group:${g.key}` === action);
    const set = new Set<string>(group?.actions ?? []);
    return (a: string) => set.has(a);
  }
  return (a: string) => a === action;
}

function isRecord(v: unknown): v is AuditRecord {
  if (!v || typeof v !== "object") return false;
  const r = v as Partial<AuditRecord>;
  return (
    typeof r.ts === "string" &&
    isAuditAction(r.action) &&
    (r.actor === null || typeof r.actor === "string")
  );
}

export interface AuditQueryResult {
  /** Newest first, at most AUDIT_MAX_MATCHES. */
  records: AuditRecord[];
  total: number;
  truncated: boolean;
}

/**
 * All records in the filter's date range matching action / user, newest
 * first. `names` resolves display names of records without actorName
 * (sub -> name from the user store) before the user filter is applied.
 */
export async function queryAudit(
  filter: AuditFilter,
  names: ReadonlyMap<string, string> = new Map(),
): Promise<AuditQueryResult> {
  const startMs = bangkokDayStart(filter.from)!;
  const endMs = bangkokDayStart(filter.to)! + DAY_MS;
  const firstKey = bangkokMonthKey(startMs);
  const lastKey = bangkokMonthKey(endMs - 1);
  const months = (await listAuditMonths()).filter(
    (k) => k >= firstKey && k <= lastKey,
  );

  const matchAction = actionPredicate(filter.action);
  const needle = filter.user.toLowerCase();
  // Newest MAX matches: buffer up to 2x, then drop the oldest half.
  let kept: AuditRecord[] = [];
  let total = 0;

  for (const key of months) {
    // Files are chronological (oldest month first): append order = time order.
    if (bangkokMonthStart(key, 1) <= startMs || bangkokMonthStart(key) >= endMs) {
      continue;
    }
    const stream = createReadStream(path.join(auditDir(), auditFileName(key)), {
      encoding: "utf8",
    });
    const lines = createInterface({ input: stream, crlfDelay: Infinity });
    try {
      for await (const line of lines) {
        if (!line || line.length > MAX_LINE_BYTES) continue;
        let parsed: unknown;
        try {
          parsed = JSON.parse(line);
        } catch {
          continue;
        }
        if (!isRecord(parsed)) continue;
        const t = Date.parse(parsed.ts);
        if (!(t >= startMs && t < endMs)) continue;
        if (!matchAction(parsed.action)) continue;
        const rec: AuditRecord =
          !parsed.actorName && parsed.actor && names.has(parsed.actor)
            ? { ...parsed, actorName: names.get(parsed.actor) }
            : parsed;
        if (
          needle &&
          !(rec.actor ?? "").toLowerCase().includes(needle) &&
          !(rec.actorName ?? "").toLowerCase().includes(needle)
        ) {
          continue;
        }
        total += 1;
        kept.push(rec);
        if (kept.length >= AUDIT_MAX_MATCHES * 2) {
          kept = kept.slice(kept.length - AUDIT_MAX_MATCHES);
        }
      }
    } catch (err) {
      const code =
        err && typeof err === "object" && "code" in err
          ? String((err as { code: unknown }).code)
          : "";
      // A file removed by retention between readdir and open: skip it.
      if (code !== "ENOENT") throw err;
    } finally {
      lines.close();
      stream.destroy();
    }
  }

  if (kept.length > AUDIT_MAX_MATCHES) {
    kept = kept.slice(kept.length - AUDIT_MAX_MATCHES);
  }
  // Stable newest-first (same-millisecond records keep reverse file order).
  kept.reverse();
  kept.sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts));
  return { records: kept, total, truncated: total > kept.length };
}
