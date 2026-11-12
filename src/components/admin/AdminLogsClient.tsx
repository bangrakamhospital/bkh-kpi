"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Loader2,
  LogIn,
  RotateCcw,
  Search,
  ShieldOff,
} from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import {
  AUDIT_ACTION_GROUPS,
  AUDIT_ACTION_LABELS,
  AUDIT_FAILURE_ACTIONS,
  describeAudit,
  type AuditListItem,
  type AuditListResponse,
} from "@/lib/audit/types";

interface Filter {
  /** "" = server default (last 7 days, Asia/Bangkok). */
  from: string;
  to: string;
  user: string;
  action: string;
}

const EMPTY_FILTER: Filter = { from: "", to: "", user: "", action: "" };

type LoadState =
  | { kind: "idle" }
  | { kind: "unauthorized"; key: string }
  | { kind: "forbidden"; key: string }
  | { kind: "error"; key: string; message: string }
  | { kind: "ready"; key: string; data: AuditListResponse };

const numberFmt = new Intl.NumberFormat("th-TH");
const dateTimeFmt = new Intl.DateTimeFormat("th-TH-u-ca-buddhist", {
  timeZone: "Asia/Bangkok",
  dateStyle: "medium",
  timeStyle: "medium",
});

function formatTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : dateTimeFmt.format(d);
}

function queryString(f: Filter, page?: number): string {
  const q = new URLSearchParams();
  if (f.from) q.set("from", f.from);
  if (f.to) q.set("to", f.to);
  if (f.user.trim()) q.set("user", f.user.trim());
  if (f.action) q.set("action", f.action);
  if (page && page > 1) q.set("page", String(page));
  return q.toString();
}

function filenameFrom(header: string | null): string {
  const m = header?.match(/filename="([A-Za-z0-9._-]{1,100})"/);
  return m ? m[1] : "kpi-audit.xlsx";
}

function saveBlob(blob: Blob, filename: string) {
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 10_000);
}

const iconCls = "h-4 w-4 shrink-0";
const btnBase =
  "inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 disabled:cursor-not-allowed disabled:opacity-50";
const inputCls =
  "w-full rounded-md border border-zinc-300 bg-transparent px-2.5 py-1.5 text-xs dark:border-zinc-700 dark:[color-scheme:dark]";
const cardCls =
  "rounded-xl border border-zinc-200 bg-surface p-4 shadow-sm dark:border-zinc-800";

function ActionBadge({ item }: { item: AuditListItem }) {
  const failed = AUDIT_FAILURE_ACTIONS.has(item.action);
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
        failed
          ? "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200"
          : item.action === "export" || item.action === "persons"
            ? "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200"
            : "bg-brand-50 text-brand-800 dark:bg-brand-900/30 dark:text-brand-100"
      }`}
    >
      {AUDIT_ACTION_LABELS[item.action] ?? item.action}
    </span>
  );
}

function UserCell({ item }: { item: AuditListItem }) {
  if (!item.actor && !item.actorName) {
    return <span className="text-zinc-500 dark:text-zinc-400">ไม่ทราบผู้ใช้</span>;
  }
  return (
    <>
      <span className="font-medium">{item.actorName ?? item.actor}</span>
      {item.actorName && item.actor && (
        <span className="block break-all text-zinc-500 dark:text-zinc-400">
          {item.actor}
        </span>
      )}
    </>
  );
}

export function AdminLogsClient() {
  const { status: authStatus, markLoggedOut } = useAuth();
  const [draft, setDraft] = useState<Filter>(EMPTY_FILTER);
  const [applied, setApplied] = useState<Filter>(EMPTY_FILTER);
  const [page, setPage] = useState(1);
  const [reloadKey, setReloadKey] = useState(0);
  const [state, setState] = useState<LoadState>({ kind: "idle" });
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const requestKey = `${queryString(applied, page)}#${reloadKey}`;

  useEffect(() => {
    if (authStatus !== "in") return;
    let cancelled = false;
    const key = requestKey;
    const qs = queryString(applied, page);
    fetch(`/api/admin/logs${qs ? `?${qs}` : ""}`, { cache: "no-store" })
      .then(async (res): Promise<LoadState> => {
        if (res.status === 401) return { kind: "unauthorized", key };
        if (res.status === 403) return { kind: "forbidden", key };
        const json = (await res.json().catch(() => null)) as
          | (AuditListResponse & { error?: string })
          | null;
        if (!res.ok || !json || !Array.isArray(json.items)) {
          return {
            kind: "error",
            key,
            message: json?.error ?? "โหลดบันทึกการใช้งานไม่สำเร็จ",
          };
        }
        return { kind: "ready", key, data: json };
      })
      .catch(
        (): LoadState => ({
          kind: "error",
          key,
          message: "โหลดบันทึกการใช้งานไม่สำเร็จ",
        }),
      )
      .then((next) => {
        if (cancelled) return;
        setState(next);
        if (next.kind === "ready") {
          // Show the server's default range in the empty date inputs.
          setDraft((d) =>
            d.from || d.to ? d : { ...d, from: next.data.from, to: next.data.to },
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [authStatus, applied, page, requestKey]);

  async function downloadExport() {
    setExporting(true);
    setExportError(null);
    try {
      const qs = queryString(applied);
      const res = await fetch(`/api/admin/logs/export${qs ? `?${qs}` : ""}`, {
        cache: "no-store",
      });
      if (res.status === 401) {
        markLoggedOut();
        return;
      }
      if (!res.ok) {
        const json = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        setExportError(json?.error ?? "ไม่สามารถดาวน์โหลดไฟล์ได้");
        return;
      }
      const blob = await res.blob();
      saveBlob(blob, filenameFrom(res.headers.get("Content-Disposition")));
    } catch {
      setExportError("ไม่สามารถดาวน์โหลดไฟล์ได้");
    } finally {
      setExporting(false);
    }
  }

  if (authStatus === "out" || state.kind === "unauthorized") {
    return (
      <div className={`${cardCls} space-y-3 text-xs`}>
        <p className="text-sm font-semibold">กรุณาเข้าสู่ระบบ</p>
        <p>ต้องเข้าสู่ระบบด้วยบัญชีผู้ดูแลระบบเพื่อดูบันทึกการใช้งาน</p>
        <Link
          href="/login?callbackUrl=/admin/logs"
          className={`${btnBase} bg-brand-700 text-white hover:bg-brand-800`}
        >
          <LogIn aria-hidden="true" className={iconCls} />
          เข้าสู่ระบบ
        </Link>
      </div>
    );
  }

  if (state.kind === "forbidden") {
    return (
      <div className={`${cardCls} space-y-2 text-xs`}>
        <p className="flex items-center gap-1.5 text-sm font-semibold text-red-700 dark:text-red-300">
          <ShieldOff aria-hidden="true" className={iconCls} />
          เฉพาะผู้ดูแลระบบ
        </p>
        <p>บัญชีของคุณไม่มีสิทธิ์เข้าหน้านี้</p>
        <Link href="/" className="text-brand-700 underline dark:text-brand-300">
          กลับแดชบอร์ด
        </Link>
      </div>
    );
  }

  const loading = authStatus === "loading" || state.kind === "idle" || state.key !== requestKey;
  const data = state.kind === "ready" ? state.data : null;
  const keptPages = data?.pages ?? 1;
  const items = data?.items ?? [];

  function apply(next: Filter) {
    setApplied(next);
    setPage(1);
    setReloadKey((k) => k + 1);
  }

  return (
    <div className="space-y-4">
      <form
        className={`${cardCls} space-y-3`}
        aria-label="ค้นหาบันทึกการใช้งาน"
        onSubmit={(e) => {
          e.preventDefault();
          apply({ ...draft, user: draft.user.trim() });
        }}
      >
        <h2 className="text-sm font-semibold">ค้นหาบันทึกการใช้งาน</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block space-y-1 text-xs">
            <span className="font-medium">ตั้งแต่วันที่</span>
            <input
              type="date"
              value={draft.from}
              max={draft.to || undefined}
              onChange={(e) => setDraft((d) => ({ ...d, from: e.target.value }))}
              className={inputCls}
            />
          </label>
          <label className="block space-y-1 text-xs">
            <span className="font-medium">ถึงวันที่</span>
            <input
              type="date"
              value={draft.to}
              min={draft.from || undefined}
              onChange={(e) => setDraft((d) => ({ ...d, to: e.target.value }))}
              className={inputCls}
            />
          </label>
          <label className="block space-y-1 text-xs">
            <span className="font-medium">ผู้ใช้</span>
            <input
              type="search"
              value={draft.user}
              maxLength={64}
              placeholder="ชื่อ / loginname / sub"
              onChange={(e) => setDraft((d) => ({ ...d, user: e.target.value }))}
              className={inputCls}
            />
          </label>
          <label className="block space-y-1 text-xs">
            <span className="font-medium">ประเภทการกระทำ</span>
            <select
              value={draft.action}
              onChange={(e) => setDraft((d) => ({ ...d, action: e.target.value }))}
              className={`${inputCls} bg-surface`}
            >
              <option value="">ทั้งหมด</option>
              {AUDIT_ACTION_GROUPS.map((g) => (
                <optgroup key={g.key} label={g.label}>
                  <option value={`group:${g.key}`}>{g.label} (ทุกประเภท)</option>
                  {g.actions.map((a) => (
                    <option key={a} value={a}>
                      {AUDIT_ACTION_LABELS[a]}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="submit"
            className={`${btnBase} bg-brand-700 text-white hover:bg-brand-800`}
          >
            <Search aria-hidden="true" className={iconCls} />
            ค้นหา
          </button>
          <button
            type="button"
            className={`${btnBase} border border-zinc-300 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800`}
            onClick={() => {
              setDraft(EMPTY_FILTER);
              apply(EMPTY_FILTER);
            }}
          >
            <RotateCcw aria-hidden="true" className={iconCls} />
            ล้างตัวกรอง
          </button>
          <button
            type="button"
            disabled={exporting || !data || data.total === 0}
            className={`${btnBase} border border-emerald-300 text-emerald-800 hover:bg-emerald-50 dark:border-emerald-700 dark:text-emerald-200 dark:hover:bg-emerald-900/30`}
            onClick={() => void downloadExport()}
          >
            {exporting ? (
              <Loader2 aria-hidden="true" className={`${iconCls} animate-spin`} />
            ) : (
              <Download aria-hidden="true" className={iconCls} />
            )}
            ส่งออก Excel
          </button>
          {exportError && (
            <span role="alert" className="text-xs text-red-700 dark:text-red-300">
              {exportError}
            </span>
          )}
        </div>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          เวลาแสดงตามเวลาประเทศไทย ค้นหาได้ครั้งละไม่เกิน 366 วัน
          การดูและส่งออกบันทึกนี้จะถูกบันทึกไว้ด้วย
        </p>
      </form>

      <section className={`${cardCls} space-y-3`} aria-labelledby="audit-results" aria-busy={loading}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="audit-results" className="text-sm font-semibold">
            ผลการค้นหา
            {data && (
              <span className="ml-2 text-xs font-normal text-zinc-500 dark:text-zinc-400">
                {numberFmt.format(data.total)} รายการ ({data.from} ถึง {data.to})
              </span>
            )}
          </h2>
          {loading && (
            <span className="inline-flex items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400">
              <Loader2 aria-hidden="true" className={`${iconCls} animate-spin`} />
              กำลังโหลด...
            </span>
          )}
        </div>

        {state.kind === "error" && !loading && (
          <div className="space-y-2 text-xs">
            <p role="alert" className="text-red-700 dark:text-red-300">
              {state.message}
            </p>
            <button
              type="button"
              className={`${btnBase} bg-brand-700 text-white hover:bg-brand-800`}
              onClick={() => setReloadKey((k) => k + 1)}
            >
              ลองใหม่
            </button>
          </div>
        )}

        {data?.truncated && (
          <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
            รายการมีจำนวนมาก แสดงได้เฉพาะ {numberFmt.format(data.maxRecords)} รายการล่าสุด
            กรุณาเลือกช่วงวันที่หรือตัวกรองให้แคบลง
          </p>
        )}

        {data && items.length === 0 && !loading && (
          <p className="py-6 text-center text-xs text-zinc-500 dark:text-zinc-400">
            ไม่พบบันทึกการใช้งานตามเงื่อนไข
          </p>
        )}

        {items.length > 0 && (
          <div className={loading ? "opacity-60" : undefined}>
            {/* Desktop table */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-left text-xs">
                <caption className="sr-only">บันทึกการใช้งาน เรียงจากล่าสุด</caption>
                <thead className="bg-brand-50 text-brand-900 dark:bg-brand-900/30 dark:text-brand-100">
                  <tr>
                    <th scope="col" className="whitespace-nowrap px-3 py-2 text-sm font-semibold">วันเวลา</th>
                    <th scope="col" className="px-3 py-2 text-sm font-semibold">ผู้ใช้</th>
                    <th scope="col" className="px-3 py-2 text-sm font-semibold">การกระทำ</th>
                    <th scope="col" className="px-3 py-2 text-sm font-semibold">รายละเอียด</th>
                    <th scope="col" className="px-3 py-2 text-sm font-semibold">IP</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                  {items.map((it) => (
                    <tr key={it.id} className="align-top">
                      <td className="whitespace-nowrap px-3 py-2 tabular-nums">
                        <time dateTime={it.ts}>{formatTime(it.ts)}</time>
                      </td>
                      <td className="max-w-56 px-3 py-2">
                        <UserCell item={it} />
                      </td>
                      <td className="px-3 py-2">
                        <ActionBadge item={it} />
                      </td>
                      <td className="px-3 py-2 break-words">{describeAudit(it) || "-"}</td>
                      <td className="max-w-48 px-3 py-2">
                        <span className="tabular-nums">{it.ip ?? "-"}</span>
                        {it.ua && (
                          <span
                            className="block truncate text-zinc-500 dark:text-zinc-400"
                            title={it.ua}
                          >
                            {it.ua}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <ul className="space-y-3 md:hidden">
              {items.map((it) => (
                <li
                  key={it.id}
                  className="space-y-1.5 rounded-lg border border-zinc-200 p-3 text-xs dark:border-zinc-800"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <time dateTime={it.ts} className="tabular-nums">
                      {formatTime(it.ts)}
                    </time>
                    <ActionBadge item={it} />
                  </div>
                  <p>
                    <UserCell item={it} />
                  </p>
                  {describeAudit(it) && <p>{describeAudit(it)}</p>}
                  <p className="text-zinc-500 dark:text-zinc-400">IP: {it.ip ?? "-"}</p>
                </li>
              ))}
            </ul>
          </div>
        )}

        {data && keptPages > 1 && (
          <nav
            aria-label="เปลี่ยนหน้า"
            className="flex flex-wrap items-center justify-end gap-2 pt-1 text-xs"
          >
            <button
              type="button"
              disabled={loading || page <= 1}
              className={`${btnBase} border border-zinc-300 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800`}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft aria-hidden="true" className={iconCls} />
              ก่อนหน้า
            </button>
            <span aria-live="polite">
              หน้า {numberFmt.format(data.page)} / {numberFmt.format(keptPages)}
            </span>
            <button
              type="button"
              disabled={loading || data.page >= keptPages}
              className={`${btnBase} border border-zinc-300 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800`}
              onClick={() => setPage(data.page + 1)}
            >
              ถัดไป
              <ChevronRight aria-hidden="true" className={iconCls} />
            </button>
          </nav>
        )}
      </section>
    </div>
  );
}
