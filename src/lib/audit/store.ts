import "server-only";

import { promises as fs } from "node:fs";
import path from "node:path";

import { dataDir } from "../data/json-store";
import type { AuditRecord } from "./types";

/**
 * Persistent audit log: append-only JSON Lines, one file per month
 * (Asia/Bangkok) at ${KPI_DATA_DIR}/audit/YYYY-MM.jsonl (dir 0700,
 * files 0600). The HIS / HDC databases are read-only: logs live on disk.
 *
 *  - appendAudit() never throws and never blocks the caller: the write is
 *    queued (one in-process promise chain keeps lines whole and ordered,
 *    single pm2 fork process) and errors only go to console.error.
 *  - retention: AUDIT_RETENTION_DAYS (default 365, minimum 90 — Thai
 *    Computer Crime Act). Whole monthly files whose last possible event is
 *    older than that are deleted, at most once per day, after a write.
 */

const DAY_MS = 86_400_000;
/** Asia/Bangkok is UTC+7 all year (no DST). */
export const BANGKOK_OFFSET_MS = 7 * 3_600_000;
const FILE_RE = /^(\d{4})-(\d{2})\.jsonl$/;

export const AUDIT_RETENTION_DEFAULT_DAYS = 365;
export const AUDIT_RETENTION_MIN_DAYS = 90;
const AUDIT_RETENTION_MAX_DAYS = 3650;

export function auditRetentionDays(): number {
  const raw = process.env.AUDIT_RETENTION_DAYS?.trim();
  const n = raw ? Number(raw) : AUDIT_RETENTION_DEFAULT_DAYS;
  if (!Number.isFinite(n)) return AUDIT_RETENTION_DEFAULT_DAYS;
  return Math.min(
    Math.max(Math.floor(n), AUDIT_RETENTION_MIN_DAYS),
    AUDIT_RETENTION_MAX_DAYS,
  );
}

export function auditDir(): string {
  return path.join(dataDir(), "audit");
}

/** "YYYY-MM" of an instant in Asia/Bangkok. */
export function bangkokMonthKey(ms: number): string {
  return new Date(ms + BANGKOK_OFFSET_MS).toISOString().slice(0, 7);
}

/** UTC instant where Bangkok month `key` + `add` months starts. */
export function bangkokMonthStart(key: string, add = 0): number {
  const [y, m] = key.split("-").map(Number);
  return Date.UTC(y, m - 1 + add, 1) - BANGKOK_OFFSET_MS;
}

export function auditFileName(key: string): string {
  return `${key}.jsonl`;
}

/** Month keys of the files present (sorted ascending). */
export async function listAuditMonths(): Promise<string[]> {
  let names: string[];
  try {
    names = await fs.readdir(auditDir());
  } catch (err) {
    if (errCode(err) === "ENOENT") return [];
    throw err;
  }
  return names
    .map((n) => FILE_RE.exec(n))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => `${m[1]}-${m[2]}`)
    .sort();
}

function errCode(err: unknown): string {
  return err && typeof err === "object" && "code" in err
    ? String((err as { code: unknown }).code)
    : "";
}

// --- writer -----------------------------------------------------------------

interface WriterState {
  queue: Promise<void>;
  dirReady: string | null;
  lastPruneDay: string | null;
  /** console.error throttle (a broken disk must not flood the log). */
  lastErrorAt: number;
  failedSinceError: number;
}

const globalAudit = globalThis as unknown as { __kpiAuditWriter?: WriterState };
const writer: WriterState = (globalAudit.__kpiAuditWriter ??= {
  queue: Promise.resolve(),
  dirReady: null,
  lastPruneDay: null,
  lastErrorAt: 0,
  failedSinceError: 0,
});

async function ensureDir(dir: string) {
  if (writer.dirReady === dir) return;
  await fs.mkdir(dir, { recursive: true, mode: 0o700 });
  // mkdir's mode is ignored when the directory already exists.
  await fs.chmod(dir, 0o700).catch(() => undefined);
  writer.dirReady = dir;
}

async function writeLine(record: AuditRecord) {
  const dir = auditDir();
  await ensureDir(dir);
  const file = path.join(dir, auditFileName(bangkokMonthKey(Date.parse(record.ts))));
  // JSON.stringify escapes control characters: one record = one line.
  await fs.appendFile(file, `${JSON.stringify(record)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
}

/**
 * Queue one record for appending. Never throws, never awaited by callers.
 * Returns the queue promise (resolved, also on failure) for tests.
 */
export function appendAudit(record: AuditRecord): Promise<void> {
  writer.queue = writer.queue
    .then(() => writeLine(record))
    .catch((err) => {
      writer.dirReady = null;
      writer.failedSinceError += 1;
      const now = Date.now();
      if (now - writer.lastErrorAt < 60_000) return;
      console.error(
        `[audit] cannot write audit log (${errCode(err) || (err instanceof Error ? err.name : "error")}), ${writer.failedSinceError} record(s) lost since last report`,
      );
      writer.lastErrorAt = now;
      writer.failedSinceError = 0;
    })
    .then(() => maybePrune());
  return writer.queue;
}

async function maybePrune(now = Date.now()) {
  const day = new Date(now + BANGKOK_OFFSET_MS).toISOString().slice(0, 10);
  if (writer.lastPruneDay === day) return;
  writer.lastPruneDay = day;
  try {
    const removed = await pruneAuditFiles(now);
    if (removed.length > 0) {
      console.info(`[audit] retention: removed ${removed.join(",")}`);
    }
  } catch (err) {
    console.error(`[audit] retention failed (${errCode(err) || "error"})`);
  }
}

/** Delete monthly files entirely older than the retention period. */
export async function pruneAuditFiles(now = Date.now()): Promise<string[]> {
  const cutoff = now - auditRetentionDays() * DAY_MS;
  const removed: string[] = [];
  for (const key of await listAuditMonths()) {
    // The file's newest possible event is just before the next month starts.
    if (bangkokMonthStart(key, 1) > cutoff) continue;
    await fs.rm(path.join(auditDir(), auditFileName(key)), { force: true });
    removed.push(key);
  }
  return removed;
}
