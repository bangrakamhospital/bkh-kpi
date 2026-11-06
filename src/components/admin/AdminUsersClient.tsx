"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  Clock,
  Loader2,
  LogIn,
  Search,
  ShieldCheck,
  ShieldOff,
  XCircle,
} from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";

type UserStatus = "pending" | "approved" | "rejected";
type UserRole = "admin" | "user";

interface AdminUser {
  sub: string;
  name: string;
  orgCode: string | null;
  orgName: string | null;
  jobPosition: string | null;
  status: UserStatus;
  role: UserRole;
  createdAt: string;
  lastLoginAt: string | null;
  loginCount: number;
  decidedBy: { sub: string; name: string } | null;
  decidedAt: string | null;
}

type LoadState =
  | { kind: "loading" }
  | { kind: "unauthorized" }
  | { kind: "forbidden" }
  | { kind: "error"; message: string }
  | { kind: "ready"; users: AdminUser[]; meSub: string };

type Filter = "all" | UserStatus;

const numberFmt = new Intl.NumberFormat("th-TH");
const dateFmt = new Intl.DateTimeFormat("th-TH-u-ca-buddhist", {
  dateStyle: "medium",
  timeStyle: "short",
});

function formatDate(value: string | null): string {
  if (!value) return "-";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "-" : dateFmt.format(d);
}

const STATUS_META: Record<
  UserStatus,
  { label: string; badge: string; chip: string; Icon: typeof Clock }
> = {
  pending: {
    label: "รออนุมัติ",
    badge: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
    chip: "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200",
    Icon: Clock,
  },
  approved: {
    label: "อนุมัติแล้ว",
    badge: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200",
    chip: "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-200",
    Icon: CheckCircle2,
  },
  rejected: {
    label: "ไม่อนุมัติ",
    badge: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200",
    chip: "border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-900/20 dark:text-red-200",
    Icon: XCircle,
  },
};

const iconCls = "h-4 w-4 shrink-0";
const btnBase =
  "inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 disabled:cursor-not-allowed disabled:opacity-50";

export function AdminUsersClient() {
  const { status: authStatus, markLoggedOut } = useAuth();
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [filter, setFilter] = useState<Filter | null>(null);
  const [query, setQuery] = useState("");
  const [busySub, setBusySub] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [confirmSub, setConfirmSub] = useState<string | null>(null);

  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (authStatus !== "in") return;
    let cancelled = false;
    fetch("/api/admin/users", { cache: "no-store" })
      .then(async (res): Promise<LoadState> => {
        if (res.status === 401) return { kind: "unauthorized" };
        if (res.status === 403) return { kind: "forbidden" };
        if (!res.ok) throw new Error(String(res.status));
        const json = (await res.json()) as {
          users?: AdminUser[];
          me?: { sub?: string };
        };
        return {
          kind: "ready",
          users: json.users ?? [],
          meSub: json.me?.sub ?? "",
        };
      })
      .catch(
        (): LoadState => ({
          kind: "error",
          message: "โหลดข้อมูลผู้ใช้ไม่สำเร็จ",
        }),
      )
      .then((next) => {
        if (!cancelled) setState(next);
      });
    return () => {
      cancelled = true;
    };
  }, [authStatus, reloadKey]);

  const users = useMemo(
    () => (state.kind === "ready" ? state.users : []),
    [state],
  );

  const counts = useMemo(() => {
    const c = { pending: 0, approved: 0, rejected: 0 };
    for (const u of users) c[u.status] += 1;
    return c;
  }, [users]);

  const activeFilter: Filter = filter ?? (counts.pending > 0 ? "pending" : "all");

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return users.filter((u) => {
      if (activeFilter !== "all" && u.status !== activeFilter) return false;
      if (!q) return true;
      return [u.name, u.orgName, u.orgCode, u.jobPosition].some((v) =>
        (v ?? "").toLowerCase().includes(q),
      );
    });
  }, [users, activeFilter, query]);

  async function patch(
    sub: string,
    body: { status?: UserStatus; role?: UserRole },
  ) {
    setBusySub(sub);
    setRowErrors((e) => {
      const next = { ...e };
      delete next[sub];
      return next;
    });
    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(sub)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.status === 401) {
        markLoggedOut();
        return;
      }
      const json = (await res.json().catch(() => null)) as {
        user?: AdminUser;
        error?: string;
      } | null;
      if (!res.ok || !json?.user) {
        throw new Error(
          json?.error ??
            (res.status === 409
              ? "ไม่สามารถเปลี่ยนบัญชีนี้ได้"
              : "บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง"),
        );
      }
      const updated = json.user;
      setState((s) =>
        s.kind === "ready"
          ? {
              ...s,
              users: s.users.map((u) => (u.sub === updated.sub ? updated : u)),
            }
          : s,
      );
      setConfirmSub(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "บันทึกไม่สำเร็จ";
      setRowErrors((e) => ({ ...e, [sub]: message }));
    } finally {
      setBusySub(null);
    }
  }

  const cardCls =
    "rounded-xl border border-zinc-200 bg-surface p-4 shadow-sm dark:border-zinc-800";

  if (authStatus === "out" || state.kind === "unauthorized") {
    return (
      <div className={`${cardCls} space-y-3 text-xs`}>
        <p className="text-sm font-semibold">กรุณาเข้าสู่ระบบ</p>
        <p>ต้องเข้าสู่ระบบด้วยบัญชีผู้ดูแลระบบเพื่อจัดการผู้ใช้งาน</p>
        <Link
          href="/login?callbackUrl=/admin/users"
          className={`${btnBase} bg-brand-700 text-white hover:bg-brand-800`}
        >
          <LogIn aria-hidden="true" className={iconCls} />
          เข้าสู่ระบบ
        </Link>
      </div>
    );
  }

  if (state.kind === "loading") {
    return (
      <div className={`${cardCls} flex items-center gap-2 text-xs`}>
        <Loader2 aria-hidden="true" className={`${iconCls} animate-spin`} />
        กำลังโหลด...
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

  if (state.kind === "error") {
    return (
      <div className={`${cardCls} space-y-3 text-xs`}>
        <p role="alert" className="text-red-700 dark:text-red-300">
          {state.message}
        </p>
        <button
          type="button"
          className={`${btnBase} bg-brand-700 text-white hover:bg-brand-800`}
          onClick={() => {
            setState({ kind: "loading" });
            setReloadKey((k) => k + 1);
          }}
        >
          ลองใหม่
        </button>
      </div>
    );
  }

  const meSub = state.meSub;
  const tabs: { key: Filter; label: string; count: number }[] = [
    { key: "pending", label: "รออนุมัติ", count: counts.pending },
    { key: "approved", label: "อนุมัติแล้ว", count: counts.approved },
    { key: "rejected", label: "ไม่อนุมัติ", count: counts.rejected },
    { key: "all", label: "ทั้งหมด", count: users.length },
  ];

  function renderActions(u: AdminUser) {
    const isMe = u.sub === meSub;
    const busy = busySub === u.sub;
    if (isMe) {
      return (
        <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
          บัญชีของคุณ
        </span>
      );
    }
    if (confirmSub === u.sub) {
      return (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-red-700 dark:text-red-300">
            ยืนยันไม่อนุมัติ {u.name}?
          </span>
          <button
            type="button"
            disabled={busy}
            className={`${btnBase} bg-red-600 text-white hover:bg-red-700`}
            onClick={() => void patch(u.sub, { status: "rejected" })}
          >
            {busy ? (
              <Loader2 aria-hidden="true" className={`${iconCls} animate-spin`} />
            ) : (
              <XCircle aria-hidden="true" className={iconCls} />
            )}
            ยืนยัน
          </button>
          <button
            type="button"
            disabled={busy}
            className={`${btnBase} border border-zinc-300 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800`}
            onClick={() => setConfirmSub(null)}
          >
            ยกเลิก
          </button>
        </div>
      );
    }
    return (
      <div className="flex flex-wrap items-center gap-2">
        {u.status !== "approved" && (
          <button
            type="button"
            disabled={busy}
            className={`${btnBase} bg-emerald-600 text-white hover:bg-emerald-700`}
            onClick={() => void patch(u.sub, { status: "approved" })}
          >
            {busy ? (
              <Loader2 aria-hidden="true" className={`${iconCls} animate-spin`} />
            ) : (
              <CheckCircle2 aria-hidden="true" className={iconCls} />
            )}
            อนุมัติ
          </button>
        )}
        {u.status !== "rejected" && (
          <button
            type="button"
            disabled={busy}
            className={`${btnBase} bg-red-600 text-white hover:bg-red-700`}
            onClick={() => setConfirmSub(u.sub)}
          >
            <XCircle aria-hidden="true" className={iconCls} />
            ไม่อนุมัติ
          </button>
        )}
        {u.status === "approved" && (
          <button
            type="button"
            disabled={busy}
            className={`${btnBase} border border-violet-300 text-violet-800 hover:bg-violet-50 dark:border-violet-700 dark:text-violet-200 dark:hover:bg-violet-900/30`}
            onClick={() =>
              void patch(u.sub, { role: u.role === "admin" ? "user" : "admin" })
            }
          >
            {u.role === "admin" ? (
              <ShieldOff aria-hidden="true" className={iconCls} />
            ) : (
              <ShieldCheck aria-hidden="true" className={iconCls} />
            )}
            {u.role === "admin" ? "ยกเลิกผู้ดูแล" : "ตั้งเป็นผู้ดูแล"}
          </button>
        )}
      </div>
    );
  }

  function statusBadge(u: AdminUser) {
    const meta = STATUS_META[u.status];
    return (
      <span className="inline-flex flex-wrap items-center gap-1">
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${meta.badge}`}
        >
          <meta.Icon aria-hidden="true" className="h-3.5 w-3.5" />
          {meta.label}
        </span>
        {u.role === "admin" && (
          <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-800 dark:bg-violet-900/40 dark:text-violet-200">
            <ShieldCheck aria-hidden="true" className="h-3.5 w-3.5" />
            ผู้ดูแล
          </span>
        )}
      </span>
    );
  }

  function decided(u: AdminUser) {
    if (!u.decidedBy && !u.decidedAt) return "-";
    return `${u.decidedBy?.name ?? "-"} / ${formatDate(u.decidedAt)}`;
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {(["pending", "approved", "rejected"] as const).map((k) => {
          const meta = STATUS_META[k];
          return (
            <div
              key={k}
              className={`flex items-center gap-3 rounded-xl border p-4 shadow-sm ${meta.chip}`}
            >
              <meta.Icon aria-hidden="true" className="h-5 w-5 shrink-0" />
              <div>
                <p className="text-sm font-semibold">{meta.label}</p>
                <p className="text-base font-bold">
                  {numberFmt.format(counts[k])} คน
                </p>
              </div>
            </div>
          );
        })}
      </div>

      <div className={`${cardCls} space-y-4`}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div role="tablist" aria-label="กรองตามสถานะ" className="flex flex-wrap gap-2">
            {tabs.map((t) => {
              const active = activeFilter === t.key;
              return (
                <button
                  key={t.key}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  className={`rounded-full px-3 py-1.5 text-xs font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 ${
                    active
                      ? "bg-brand-700 text-white"
                      : "bg-brand-50 text-brand-800 hover:bg-brand-100 dark:bg-brand-900/30 dark:text-brand-100"
                  }`}
                  onClick={() => setFilter(t.key)}
                >
                  {t.label} ({numberFmt.format(t.count)})
                </button>
              );
            })}
          </div>
          <label className="relative block sm:w-72">
            <span className="sr-only">ค้นหาชื่อหรือหน่วยงาน</span>
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400"
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="ค้นหาชื่อ / หน่วยงาน"
              className="w-full rounded-md border border-zinc-300 bg-transparent py-1.5 pl-8 pr-3 text-xs dark:border-zinc-700"
            />
          </label>
        </div>

        {visible.length === 0 ? (
          <p className="py-6 text-center text-xs text-zinc-500 dark:text-zinc-400">
            ไม่พบผู้ใช้งาน
          </p>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-left text-xs">
                <thead className="bg-brand-50 text-brand-900 dark:bg-brand-900/30 dark:text-brand-100">
                  <tr>
                    <th className="px-3 py-2 text-sm font-semibold">ชื่อ</th>
                    <th className="px-3 py-2 text-sm font-semibold">หน่วยงาน</th>
                    <th className="px-3 py-2 text-sm font-semibold">ตำแหน่ง</th>
                    <th className="px-3 py-2 text-sm font-semibold">สถานะ / สิทธิ์</th>
                    <th className="px-3 py-2 text-sm font-semibold">เข้าใช้ล่าสุด</th>
                    <th className="px-3 py-2 text-right text-sm font-semibold">ครั้ง</th>
                    <th className="px-3 py-2 text-sm font-semibold">ผู้อนุมัติ / วันที่</th>
                    <th className="px-3 py-2 text-sm font-semibold">จัดการ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                  {visible.map((u) => (
                    <tr key={u.sub} className="align-top">
                      <td className="px-3 py-2 font-medium">{u.name}</td>
                      <td className="px-3 py-2">
                        {u.orgName ?? "-"}
                        {u.orgCode && (
                          <span className="block text-zinc-500 dark:text-zinc-400">
                            {u.orgCode}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2">{u.jobPosition ?? "-"}</td>
                      <td className="px-3 py-2">{statusBadge(u)}</td>
                      <td className="px-3 py-2">{formatDate(u.lastLoginAt)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {numberFmt.format(u.loginCount)}
                      </td>
                      <td className="px-3 py-2">{decided(u)}</td>
                      <td className="px-3 py-2">
                        {renderActions(u)}
                        {rowErrors[u.sub] && (
                          <p role="alert" className="mt-1 text-red-700 dark:text-red-300">
                            {rowErrors[u.sub]}
                          </p>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <ul className="space-y-3 md:hidden">
              {visible.map((u) => (
                <li
                  key={u.sub}
                  className="space-y-2 rounded-lg border border-zinc-200 p-3 text-xs dark:border-zinc-800"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <p className="text-sm font-semibold">{u.name}</p>
                    {statusBadge(u)}
                  </div>
                  <p>
                    {u.orgName ?? "-"}
                    {u.orgCode ? ` (${u.orgCode})` : ""}
                  </p>
                  <p>ตำแหน่ง: {u.jobPosition ?? "-"}</p>
                  <p>
                    เข้าใช้ล่าสุด: {formatDate(u.lastLoginAt)} (
                    {numberFmt.format(u.loginCount)} ครั้ง)
                  </p>
                  <p>ผู้อนุมัติ: {decided(u)}</p>
                  <div>{renderActions(u)}</div>
                  {rowErrors[u.sub] && (
                    <p role="alert" className="text-red-700 dark:text-red-300">
                      {rowErrors[u.sub]}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
