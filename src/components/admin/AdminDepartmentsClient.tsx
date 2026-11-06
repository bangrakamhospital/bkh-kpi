"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import {
  Building2,
  Check,
  Loader2,
  LogIn,
  Pencil,
  Plus,
  ShieldOff,
  Trash2,
  X,
} from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import {
  DEPARTMENT_TONES,
  toneFor,
  type Department,
} from "@/components/kpi/department-theme";
import { INDICATOR_ROWS } from "@/components/kpi/indicator-rows";
import type { ScreeningCode } from "@/lib/kpi/types";

type LoadState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; departments: Department[] };

interface FormState {
  /** null = เพิ่มใหม่ */
  id: string | null;
  name: string;
  color: string;
  codes: ScreeningCode[];
}

const iconCls = "h-4 w-4 shrink-0";
const btnBase =
  "inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 disabled:cursor-not-allowed disabled:opacity-50";
const cardCls =
  "rounded-xl border border-zinc-200 bg-surface p-4 shadow-sm dark:border-zinc-800";

/** ตัวชี้วัดที่มี code (ข้อ N ชื่อ) จาก metadata เดียวกับหน้าแรก */
const SELECTABLE = INDICATOR_ROWS.flatMap((r) =>
  r.code ? [{ no: r.no, title: r.title, code: r.code }] : [],
);

export function AdminDepartmentsClient() {
  const { status: authStatus, markLoggedOut } = useAuth();
  const { data: session } = useSession();
  const isAdmin =
    (session?.user as { role?: unknown } | undefined)?.role === "admin";

  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [reloadKey, setReloadKey] = useState(0);
  const [form, setForm] = useState<FormState | null>(null);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<{ id: string; message: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/departments", { cache: "no-store" })
      .then(async (res): Promise<LoadState> => {
        if (!res.ok) throw new Error(String(res.status));
        const json = (await res.json()) as { departments?: Department[] };
        return { kind: "ready", departments: json.departments ?? [] };
      })
      .catch(
        (): LoadState => ({ kind: "error", message: "โหลดข้อมูลแผนกไม่สำเร็จ" }),
      )
      .then((next) => {
        if (!cancelled) setState(next);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  if (authStatus === "out") {
    return (
      <div className={`${cardCls} space-y-3 text-xs`}>
        <p className="text-sm font-semibold">กรุณาเข้าสู่ระบบ</p>
        <p>ต้องเข้าสู่ระบบด้วยบัญชีผู้ดูแลระบบเพื่อจัดการแผนก</p>
        <Link
          href="/login?callbackUrl=/admin/departments"
          className={`${btnBase} bg-brand-700 text-white hover:bg-brand-800`}
        >
          <LogIn aria-hidden="true" className={iconCls} />
          เข้าสู่ระบบ
        </Link>
      </div>
    );
  }

  if (authStatus === "loading" || state.kind === "loading") {
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

  const departments = state.departments;

  /** เรียก API admin; คืน department หรือ throw ข้อความไทย */
  async function call(
    url: string,
    method: "POST" | "PATCH" | "DELETE",
    body?: unknown,
  ): Promise<{ department?: Department }> {
    const res = await fetch(url, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 401) {
      markLoggedOut();
      throw new Error("กรุณาเข้าสู่ระบบใหม่");
    }
    const json = (await res.json().catch(() => null)) as {
      department?: Department;
      error?: string;
    } | null;
    if (!res.ok) {
      throw new Error(
        json?.error ??
          (res.status === 403
            ? "ไม่มีสิทธิ์ดำเนินการ"
            : "บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง"),
      );
    }
    return json ?? {};
  }

  async function save() {
    if (!form) return;
    const name = form.name.trim();
    if (!name) {
      setFormError("กรุณากรอกชื่อแผนก");
      return;
    }
    setBusy(true);
    setFormError(null);
    try {
      const payload = { name, color: form.color, codes: form.codes };
      const { department } = form.id
        ? await call(
            `/api/admin/departments/${encodeURIComponent(form.id)}`,
            "PATCH",
            payload,
          )
        : await call("/api/admin/departments", "POST", payload);
      if (!department) throw new Error("บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง");
      setState({
        kind: "ready",
        departments: form.id
          ? departments.map((d) => (d.id === department.id ? department : d))
          : [...departments, department],
      });
      setForm(null);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setBusy(true);
    setRowError(null);
    try {
      await call(`/api/admin/departments/${encodeURIComponent(id)}`, "DELETE");
      setState({
        kind: "ready",
        departments: departments.filter((d) => d.id !== id),
      });
      setConfirmId(null);
    } catch (err) {
      setRowError({
        id,
        message: err instanceof Error ? err.message : "ลบไม่สำเร็จ",
      });
    } finally {
      setBusy(false);
    }
  }

  function toggleCode(code: ScreeningCode) {
    setForm((f) =>
      f
        ? {
            ...f,
            codes: f.codes.includes(code)
              ? f.codes.filter((c) => c !== code)
              : [...f.codes, code],
          }
        : f,
    );
  }

  function openForm(next: FormState) {
    setFormError(null);
    setForm(next);
  }

  return (
    <div className="space-y-4">
      <div className={`${cardCls} space-y-4`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-1.5 text-base font-bold">
            <Building2 aria-hidden="true" className={iconCls} />
            แผนก ({departments.length})
          </h2>
          {!form && (
            <button
              type="button"
              className={`${btnBase} bg-brand-700 text-white hover:bg-brand-800`}
              onClick={() =>
                openForm({ id: null, name: "", color: DEPARTMENT_TONES[0].key, codes: [] })
              }
            >
              <Plus aria-hidden="true" className={iconCls} />
              เพิ่มแผนก
            </button>
          )}
        </div>
        <p className="text-xs text-zinc-600 dark:text-zinc-400">
          แผนกใช้เป็นตัวกรองมุมมองในหน้าแรกเท่านั้น ทุกคนยังเห็นตัวชี้วัดครบทุกข้อ
        </p>

        {form && (
          <form
            className="space-y-3 rounded-lg border border-brand-200 bg-brand-50/50 p-3 dark:border-brand-800 dark:bg-brand-900/20"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <p className="text-sm font-semibold">
              {form.id ? "แก้ไขแผนก" : "เพิ่มแผนกใหม่"}
            </p>
            <label className="block space-y-1 text-xs">
              <span className="font-medium">ชื่อแผนก</span>
              <input
                type="text"
                value={form.name}
                maxLength={60}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="เช่น NCD, ทันตกรรม"
                className="w-full rounded-md border border-zinc-300 bg-surface px-3 py-1.5 text-xs focus:border-brand-600 focus:outline-2 focus:outline-brand-600 sm:max-w-xs dark:border-zinc-700"
              />
            </label>
            <fieldset className="space-y-1">
              <legend className="text-xs font-medium">สี</legend>
              <div className="flex flex-wrap gap-2">
                {DEPARTMENT_TONES.map((t) => (
                  <label
                    key={t.key}
                    className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-brand-600 ${
                      form.color === t.key
                        ? "border-brand-700 bg-surface font-semibold"
                        : "border-zinc-300 dark:border-zinc-700"
                    }`}
                  >
                    <input
                      type="radio"
                      name="dept-color"
                      value={t.key}
                      checked={form.color === t.key}
                      onChange={() => setForm({ ...form, color: t.key })}
                      className="sr-only"
                    />
                    <span aria-hidden="true" className={`h-3 w-3 rounded-full ${t.dot}`} />
                    {t.label}
                    {form.color === t.key && (
                      <Check aria-hidden="true" className="h-3.5 w-3.5" />
                    )}
                  </label>
                ))}
              </div>
            </fieldset>
            <fieldset className="space-y-1">
              <legend className="text-xs font-medium">ตัวชี้วัดของแผนก</legend>
              <div className="grid gap-1 sm:grid-cols-2">
                {SELECTABLE.map((ind) => (
                  <label
                    key={ind.code}
                    className="flex cursor-pointer items-start gap-2 rounded-md px-2 py-1 text-xs hover:bg-brand-100/60 dark:hover:bg-brand-900/40"
                  >
                    <input
                      type="checkbox"
                      checked={form.codes.includes(ind.code)}
                      onChange={() => toggleCode(ind.code)}
                      className="mt-0.5 h-4 w-4 accent-brand-700"
                    />
                    <span>
                      ข้อ {ind.no} {ind.title}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
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
                บันทึก
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

        {departments.length === 0 ? (
          <p className="py-6 text-center text-xs text-zinc-500 dark:text-zinc-400">
            ยังไม่มีแผนก
          </p>
        ) : (
          <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {departments.map((d, i) => {
              const tone = toneFor(d.color, i);
              return (
                <li key={d.id} className="space-y-2 py-3 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="flex items-center gap-2 text-sm font-semibold">
                      <span aria-hidden="true" className={`h-3 w-3 rounded-full ${tone.dot}`} />
                      {d.name}
                    </p>
                    {confirmId === d.id ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-red-700 dark:text-red-300">
                          ยืนยันลบแผนก {d.name}?
                        </span>
                        <button
                          type="button"
                          disabled={busy}
                          className={`${btnBase} bg-red-600 text-white hover:bg-red-700`}
                          onClick={() => void remove(d.id)}
                        >
                          {busy ? (
                            <Loader2 aria-hidden="true" className={`${iconCls} animate-spin`} />
                          ) : (
                            <Trash2 aria-hidden="true" className={iconCls} />
                          )}
                          ยืนยัน
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          className={`${btnBase} border border-zinc-300 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800`}
                          onClick={() => setConfirmId(null)}
                        >
                          ยกเลิก
                        </button>
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          className={`${btnBase} border border-sky-300 text-sky-800 hover:bg-sky-50 dark:border-sky-700 dark:text-sky-200 dark:hover:bg-sky-900/30`}
                          onClick={() =>
                            openForm({
                              id: d.id,
                              name: d.name,
                              color: tone.key,
                              codes: d.codes,
                            })
                          }
                        >
                          <Pencil aria-hidden="true" className={iconCls} />
                          แก้ไข
                        </button>
                        <button
                          type="button"
                          className={`${btnBase} border border-red-300 text-red-800 hover:bg-red-50 dark:border-red-700 dark:text-red-200 dark:hover:bg-red-900/30`}
                          onClick={() => {
                            setRowError(null);
                            setConfirmId(d.id);
                          }}
                        >
                          <Trash2 aria-hidden="true" className={iconCls} />
                          ลบ
                        </button>
                      </div>
                    )}
                  </div>
                  <p className="text-zinc-600 dark:text-zinc-400">
                    {d.codes.length === 0
                      ? "ยังไม่ได้เลือกตัวชี้วัด"
                      : SELECTABLE.filter((s) => d.codes.includes(s.code))
                          .map((s) => `ข้อ ${s.no}`)
                          .join(", ")}
                  </p>
                  {rowError?.id === d.id && (
                    <p role="alert" className="text-red-700 dark:text-red-300">
                      {rowError.message}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
