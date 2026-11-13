"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import {
  AlertTriangle,
  Check,
  Copy,
  KeyRound,
  Loader2,
  LogIn,
  Plus,
  ShieldOff,
  X,
} from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import {
  ACCESS_CODE_DEFAULT_DAYS,
  ACCESS_CODE_MAX_DAYS,
  ACCESS_CODE_NAME_MAX,
  ACCESS_CODE_ORG_MAX,
  accessCodeExpiry,
  addDays,
  bangkokToday,
  type AccessCodeCreateResponse,
  type AccessCodeResponse,
  type AccessCodesResponse,
  type AccessCodeStatus,
  type AccessCodeView,
} from "@/lib/access-codes/types";

type LoadState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; codes: AccessCodeView[] };

interface FormState {
  name: string;
  org: string;
  expiresOn: string;
}

/** Sign-in link of the code just created (shown once, kept only in memory). */
interface Issued {
  id: string;
  name: string;
  /** ${origin}/access#<code> (code in the fragment only). */
  link: string;
  expiresAt: string;
}

const iconCls = "h-4 w-4 shrink-0";
const btnBase =
  "inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 disabled:cursor-not-allowed disabled:opacity-50";
const cardCls =
  "rounded-xl border border-zinc-200 bg-surface p-4 shadow-sm dark:border-zinc-800";
const inputCls =
  "w-full rounded-md border border-zinc-300 bg-surface px-3 py-1.5 text-xs focus:border-brand-600 focus:outline-2 focus:outline-brand-600 dark:border-zinc-700";

const dateTimeFmt = new Intl.DateTimeFormat("th-TH", {
  timeZone: "Asia/Bangkok",
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});
const dateFmt = new Intl.DateTimeFormat("th-TH", {
  timeZone: "Asia/Bangkok",
  day: "numeric",
  month: "short",
  year: "numeric",
});

function fmtDateTime(iso: string | null): string {
  if (!iso) return "-";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "-" : dateTimeFmt.format(d);
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "-" : dateFmt.format(d);
}

const STATUS_LABEL: Record<AccessCodeStatus, string> = {
  active: "ใช้งานได้",
  expired: "หมดอายุ",
  revoked: "ยกเลิกแล้ว",
};
const STATUS_CLS: Record<AccessCodeStatus, string> = {
  active:
    "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200",
  expired: "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  revoked: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200",
};

function newForm(): FormState {
  return {
    name: "",
    org: "",
    expiresOn: addDays(bangkokToday(), ACCESS_CODE_DEFAULT_DAYS),
  };
}

export function AdminAccessCodesClient() {
  const { status: authStatus, markLoggedOut } = useAuth();
  const { data: session } = useSession();
  const isAdmin =
    (session?.user as { role?: unknown } | undefined)?.role === "admin";

  const [state, setState] = useState<LoadState>({ kind: "idle" });
  const [reloadKey, setReloadKey] = useState(0);
  const [form, setForm] = useState<FormState | null>(null);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [issued, setIssued] = useState<Issued | null>(null);
  const [copied, setCopied] = useState<"idle" | "ok" | "fail">("idle");
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<{ id: string; message: string } | null>(null);

  useEffect(() => {
    if (authStatus !== "in" || !isAdmin) return;
    let cancelled = false;
    fetch("/api/admin/access-codes", { cache: "no-store" })
      .then(async (res): Promise<LoadState> => {
        if (res.status === 401) {
          markLoggedOut();
          return { kind: "error", message: "กรุณาเข้าสู่ระบบใหม่" };
        }
        const json = (await res.json().catch(() => null)) as
          | (AccessCodesResponse & { error?: string })
          | null;
        if (!res.ok || !json) {
          return {
            kind: "error",
            message: json?.error ?? "โหลดรายการลิงก์ผู้ตรวจไม่สำเร็จ",
          };
        }
        return { kind: "ready", codes: json.codes ?? [] };
      })
      .catch((): LoadState => ({ kind: "error", message: "โหลดรายการลิงก์ผู้ตรวจไม่สำเร็จ" }))
      .then((next) => {
        if (!cancelled) setState(next);
      });
    return () => {
      cancelled = true;
    };
  }, [authStatus, isAdmin, reloadKey, markLoggedOut]);

  if (authStatus === "out") {
    return (
      <div className={`${cardCls} space-y-3 text-xs`}>
        <p className="text-sm font-semibold">กรุณาเข้าสู่ระบบ</p>
        <p>ต้องเข้าสู่ระบบด้วยบัญชีผู้ดูแลระบบเพื่อจัดการลิงก์ผู้ตรวจภายนอก</p>
        <Link
          href="/login?callbackUrl=/admin/access-codes"
          className={`${btnBase} bg-brand-700 text-white hover:bg-brand-800`}
        >
          <LogIn aria-hidden="true" className={iconCls} />
          เข้าสู่ระบบ
        </Link>
      </div>
    );
  }

  if (authStatus === "loading") {
    return (
      <div className={`${cardCls} flex items-center gap-2 text-xs`}>
        <Loader2 aria-hidden="true" className={`${iconCls} animate-spin`} />
        กำลังโหลด...
      </div>
    );
  }

  if (!isAdmin) {
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

  if (state.kind === "idle" || state.kind === "loading") {
    return (
      <div className={`${cardCls} flex items-center gap-2 text-xs`}>
        <Loader2 aria-hidden="true" className={`${iconCls} animate-spin`} />
        กำลังโหลด...
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

  const codes = state.codes;
  const today = bangkokToday();
  const maxDay = addDays(today, ACCESS_CODE_MAX_DAYS);

  async function call<T>(url: string, method: "POST" | "DELETE", body?: unknown): Promise<T> {
    const res = await fetch(url, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 401) {
      markLoggedOut();
      throw new Error("กรุณาเข้าสู่ระบบใหม่");
    }
    const json = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
    if (!res.ok || !json) {
      throw new Error(
        json?.error ??
          (res.status === 403 ? "ไม่มีสิทธิ์ดำเนินการ" : "บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง"),
      );
    }
    return json;
  }

  async function create() {
    if (!form) return;
    const name = form.name.trim();
    const org = form.org.trim();
    if (!name || !org) {
      setFormError("กรุณากรอกชื่อผู้ตรวจและหน่วยงาน");
      return;
    }
    if (!form.expiresOn || form.expiresOn < today || form.expiresOn > maxDay) {
      setFormError(`วันหมดอายุต้องอยู่ระหว่างวันนี้ถึง ${ACCESS_CODE_MAX_DAYS} วันข้างหน้า`);
      return;
    }
    setBusy(true);
    setFormError(null);
    try {
      const res = await call<AccessCodeCreateResponse>("/api/admin/access-codes", "POST", {
        name,
        org,
        expiresOn: form.expiresOn,
      });
      setState({ kind: "ready", codes: [res.code, ...codes] });
      setIssued({
        id: res.code.id,
        name: res.code.name,
        link: `${window.location.origin}/access#${encodeURIComponent(res.plaintext)}`,
        expiresAt: res.code.expiresAt,
      });
      setCopied("idle");
      setForm(null);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "สร้างลิงก์ไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: string) {
    setBusy(true);
    setRowError(null);
    try {
      const res = await call<AccessCodeResponse>(
        `/api/admin/access-codes/${encodeURIComponent(id)}`,
        "DELETE",
      );
      setState({
        kind: "ready",
        codes: codes.map((c) => (c.id === id ? res.code : c)),
      });
      if (issued?.id === id) setIssued(null);
      setConfirmId(null);
    } catch (err) {
      setRowError({ id, message: err instanceof Error ? err.message : "ยกเลิกไม่สำเร็จ" });
    } finally {
      setBusy(false);
    }
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied("ok");
    } catch {
      // Not a secure context (plain-HTTP intranet) or permission denied.
      setCopied("fail");
    }
  }

  return (
    <div className="space-y-4">
      {issued && (
        <div
          role="status"
          className="space-y-2 rounded-xl border border-amber-300 bg-amber-50 p-4 text-xs text-amber-950 shadow-sm dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100"
        >
          <p className="flex items-center gap-1.5 text-sm font-semibold">
            <AlertTriangle aria-hidden="true" className={iconCls} />
            ลิงก์ผู้ตรวจภายนอกของ {issued.name} (แสดงครั้งเดียวเท่านั้น)
          </p>
          <p>
            คัดลอกลิงก์แล้วส่งให้ผู้ตรวจทางช่องทางที่ปลอดภัย ผู้ตรวจเปิดลิงก์แล้วเข้าสู่ระบบได้ทันที
            ระบบเก็บเฉพาะค่าแฮช หากปิดกล่องนี้จะดูลิงก์อีกไม่ได้ ถ้าลิงก์หาย ให้สร้างลิงก์ใหม่แล้วยกเลิกลิงก์เดิม
            ใช้ได้ถึง {fmtDateTime(issued.expiresAt)}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <input
              readOnly
              aria-label="ลิงก์ผู้ตรวจภายนอก"
              value={issued.link}
              onFocus={(e) => e.currentTarget.select()}
              className="w-full rounded-md border border-amber-400 bg-white px-3 py-1.5 font-mono text-sm text-zinc-900 sm:w-auto sm:min-w-[28rem] sm:flex-1 dark:bg-zinc-900 dark:text-zinc-100"
            />
            <button
              type="button"
              className={`${btnBase} bg-brand-700 text-white hover:bg-brand-800`}
              onClick={() => void copy(issued.link)}
            >
              {copied === "ok" ? (
                <Check aria-hidden="true" className={iconCls} />
              ) : (
                <Copy aria-hidden="true" className={iconCls} />
              )}
              {copied === "ok" ? "คัดลอกแล้ว" : "คัดลอกลิงก์"}
            </button>
            <button
              type="button"
              className={`${btnBase} border border-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/40`}
              onClick={() => setIssued(null)}
            >
              <X aria-hidden="true" className={iconCls} />
              ปิด (ส่งลิงก์แล้ว)
            </button>
          </div>
          {copied === "fail" && (
            <p role="alert">คัดลอกอัตโนมัติไม่ได้ กรุณาคลิกที่ช่องลิงก์แล้วคัดลอกเอง</p>
          )}
        </div>
      )}

      <div className={`${cardCls} space-y-4`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-1.5 text-base font-bold">
            <KeyRound aria-hidden="true" className={iconCls} />
            ลิงก์ผู้ตรวจภายนอก ({codes.length})
          </h2>
          {!form && (
            <button
              type="button"
              className={`${btnBase} bg-brand-700 text-white hover:bg-brand-800`}
              onClick={() => {
                setFormError(null);
                setForm(newForm());
              }}
            >
              <Plus aria-hidden="true" className={iconCls} />
              สร้างลิงก์
            </button>
          )}
        </div>
        <p className="text-xs text-zinc-600 dark:text-zinc-400">
          ออกลิงก์ให้ผู้ตรวจ 1 คนต่อ 1 ลิงก์ ผู้ตรวจที่เข้าสู่ระบบด้วยลิงก์มีสิทธิ์เท่าผู้ใช้ทั่วไปที่ได้รับอนุมัติ
          (ดูรายชื่อและส่งออก Excel ได้) แต่ไม่มีสิทธิ์ผู้ดูแลระบบ ทุกการใช้งานถูกบันทึกในบันทึกการใช้งาน
          เมื่อยกเลิกหรือหมดอายุ ผู้ตรวจจะถูกออกจากระบบทันทีในคำขอถัดไป
        </p>

        {form && (
          <form
            className="space-y-3 rounded-lg border border-brand-200 bg-brand-50/50 p-3 dark:border-brand-800 dark:bg-brand-900/20"
            onSubmit={(e) => {
              e.preventDefault();
              void create();
            }}
          >
            <p className="text-sm font-semibold">สร้างลิงก์ผู้ตรวจภายนอกใหม่</p>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="block space-y-1 text-xs">
                <span className="font-medium">ชื่อผู้ตรวจ</span>
                <input
                  type="text"
                  required
                  value={form.name}
                  maxLength={ACCESS_CODE_NAME_MAX}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="ชื่อ-นามสกุล"
                  className={inputCls}
                />
              </label>
              <label className="block space-y-1 text-xs">
                <span className="font-medium">หน่วยงาน</span>
                <input
                  type="text"
                  required
                  value={form.org}
                  maxLength={ACCESS_CODE_ORG_MAX}
                  onChange={(e) => setForm({ ...form, org: e.target.value })}
                  placeholder="เช่น สสจ.พิษณุโลก, สปสช. เขต 2"
                  className={inputCls}
                />
              </label>
              <label className="block space-y-1 text-xs">
                <span className="font-medium">ใช้ได้ถึงวันที่ (สิ้นวัน)</span>
                <input
                  type="date"
                  required
                  value={form.expiresOn}
                  min={today}
                  max={maxDay}
                  onChange={(e) => setForm({ ...form, expiresOn: e.target.value })}
                  className={inputCls}
                />
                <span className="block text-zinc-600 dark:text-zinc-400">
                  ค่าเริ่มต้น {ACCESS_CODE_DEFAULT_DAYS} วัน สูงสุด {ACCESS_CODE_MAX_DAYS} วันนับจากตอนนี้
                  {form.expiresOn >= today && form.expiresOn <= maxDay
                    ? ` (หมดอายุ ${fmtDateTime(accessCodeExpiry(form.expiresOn))})`
                    : ""}
                </span>
              </label>
            </div>
            {formError && (
              <p role="alert" className="text-xs text-red-700 dark:text-red-300">
                {formError}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <button
                type="submit"
                disabled={busy}
                className={`${btnBase} bg-emerald-600 text-white hover:bg-emerald-700`}
              >
                {busy ? (
                  <Loader2 aria-hidden="true" className={`${iconCls} animate-spin`} />
                ) : (
                  <Check aria-hidden="true" className={iconCls} />
                )}
                สร้างลิงก์
              </button>
              <button
                type="button"
                disabled={busy}
                className={`${btnBase} border border-zinc-300 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800`}
                onClick={() => setForm(null)}
              >
                <X aria-hidden="true" className={iconCls} />
                ยกเลิก
              </button>
            </div>
          </form>
        )}

        {codes.length === 0 ? (
          <p className="py-6 text-center text-xs text-zinc-500 dark:text-zinc-400">
            ยังไม่มีลิงก์ผู้ตรวจภายนอก
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[56rem] text-left text-xs">
              <thead className="border-b border-zinc-200 text-zinc-600 dark:border-zinc-800 dark:text-zinc-400">
                <tr>
                  <th scope="col" className="px-2 py-2 font-medium">ผู้ตรวจ / หน่วยงาน</th>
                  <th scope="col" className="px-2 py-2 font-medium">สร้างโดย</th>
                  <th scope="col" className="px-2 py-2 font-medium">สร้างเมื่อ</th>
                  <th scope="col" className="px-2 py-2 font-medium">ใช้ได้ถึง</th>
                  <th scope="col" className="px-2 py-2 font-medium">ใช้ล่าสุด</th>
                  <th scope="col" className="px-2 py-2 font-medium">สถานะ</th>
                  <th scope="col" className="px-2 py-2 font-medium">
                    <span className="sr-only">การจัดการ</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {codes.map((c) => (
                  <tr key={c.id} className="align-top">
                    <td className="px-2 py-2">
                      <p className="font-semibold">{c.name}</p>
                      <p className="text-zinc-600 dark:text-zinc-400">{c.org}</p>
                    </td>
                    <td className="px-2 py-2">{c.createdBy.name || c.createdBy.sub}</td>
                    <td className="px-2 py-2 whitespace-nowrap">{fmtDateTime(c.createdAt)}</td>
                    <td className="px-2 py-2 whitespace-nowrap">{fmtDate(c.expiresAt)}</td>
                    <td className="px-2 py-2 whitespace-nowrap">
                      {fmtDateTime(c.lastUsedAt)}
                      {c.useCount > 0 && (
                        <span className="block text-zinc-600 dark:text-zinc-400">
                          {c.useCount.toLocaleString("th-TH")} ครั้ง
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-2">
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 font-medium ${STATUS_CLS[c.status]}`}
                      >
                        {STATUS_LABEL[c.status]}
                      </span>
                      {c.revokedAt && (
                        <span className="mt-1 block text-zinc-600 dark:text-zinc-400">
                          {fmtDateTime(c.revokedAt)}
                          {c.revokedBy ? ` โดย ${c.revokedBy.name || c.revokedBy.sub}` : ""}
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-2 text-right">
                      {c.status === "active" &&
                        (confirmId === c.id ? (
                          <div className="flex flex-wrap justify-end gap-2">
                            <button
                              type="button"
                              disabled={busy}
                              className={`${btnBase} bg-red-600 text-white hover:bg-red-700`}
                              onClick={() => void revoke(c.id)}
                            >
                              {busy ? (
                                <Loader2 aria-hidden="true" className={`${iconCls} animate-spin`} />
                              ) : (
                                <ShieldOff aria-hidden="true" className={iconCls} />
                              )}
                              ยืนยันยกเลิก
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              className={`${btnBase} border border-zinc-300 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800`}
                              onClick={() => setConfirmId(null)}
                            >
                              ไม่ใช่
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            className={`${btnBase} border border-red-300 text-red-800 hover:bg-red-50 dark:border-red-700 dark:text-red-200 dark:hover:bg-red-900/30`}
                            onClick={() => {
                              setRowError(null);
                              setConfirmId(c.id);
                            }}
                          >
                            <ShieldOff aria-hidden="true" className={iconCls} />
                            ยกเลิกลิงก์
                          </button>
                        ))}
                      {rowError?.id === c.id && (
                        <p role="alert" className="mt-1 text-red-700 dark:text-red-300">
                          {rowError.message}
                        </p>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
