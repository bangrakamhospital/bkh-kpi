"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { ERP_NOT_CONFIGURED_CODE } from "@/lib/erp/types";

/** Error of an /api/erp call with the server's Thai message. */
export class ErpClientError extends Error {
  readonly status: number;
  readonly code: string | undefined;
  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function fallbackMessage(status: number): string {
  if (status === 401) return "กรุณาเข้าสู่ระบบใหม่";
  if (status === 403) return "ไม่มีสิทธิ์ดำเนินการนี้";
  if (status === 404) return "ไม่พบข้อมูล";
  if (status === 429) return "เรียกใช้งานถี่เกินไป กรุณาลองใหม่ภายหลัง";
  return "ทำรายการไม่สำเร็จ กรุณาลองใหม่";
}

/** fetch JSON from /api/erp/*; throws ErpClientError (Thai message). */
export async function erpFetch<T>(
  url: string,
  init: { method?: "GET" | "POST" | "PATCH" | "DELETE"; body?: unknown; signal?: AbortSignal } = {},
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: init.method ?? "GET",
      cache: "no-store",
      signal: init.signal,
      headers: init.body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
  } catch (err) {
    if (init.signal?.aborted) throw err;
    throw new ErpClientError(0, "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาลองใหม่");
  }
  const json = (await res.json().catch(() => null)) as (T & { error?: string; code?: string }) | null;
  if (!res.ok) {
    throw new ErpClientError(res.status, json?.error ?? fallbackMessage(res.status), json?.code);
  }
  return json as T;
}

export interface ErpGetState<T> {
  data: T | undefined;
  loading: boolean;
  error: ErpClientError | null;
  /** ERP database not configured (503 erp_not_configured). */
  notConfigured: boolean;
  reload: () => void;
  /** Replace the data locally (after a mutation that returned the new value). */
  setData: (value: T) => void;
}

/**
 * GET an /api/erp URL (null = skip). A 401 marks the session as logged
 * out (HeaderAuth then redirects to /login).
 */
export function useErpGet<T>(url: string | null): ErpGetState<T> {
  const { markLoggedOut } = useAuth();
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{ key: string; data?: T; error?: ErpClientError } | null>(null);
  const key = url ? `${url}#${attempt}` : "";

  useEffect(() => {
    if (!url) return;
    const controller = new AbortController();
    erpFetch<T>(url, { signal: controller.signal })
      .then((data) => setState({ key, data }))
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        const e = err instanceof ErpClientError ? err : new ErpClientError(0, "โหลดข้อมูลไม่สำเร็จ");
        if (e.status === 401) markLoggedOut();
        setState({ key, error: e });
      });
    return () => controller.abort();
  }, [url, key, markLoggedOut]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  const setData = useCallback((value: T) => setState((s) => ({ key: s?.key ?? key, data: value })), [key]);
  const current = state?.key === key ? state : null;
  return {
    data: current?.data,
    loading: url !== null && current === null,
    error: current?.error ?? null,
    notConfigured: current?.error?.code === ERP_NOT_CONFIGURED_CODE,
    reload,
    setData,
  };
}

// --- formatting (Thai locale, Bangkok time) ------------------------------------------

const qtyFmt = new Intl.NumberFormat("th-TH", { maximumFractionDigits: 3 });
const moneyFmt = new Intl.NumberFormat("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const costFmt = new Intl.NumberFormat("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
const dateTimeFmt = new Intl.DateTimeFormat("th-TH", {
  timeZone: "Asia/Bangkok",
  day: "numeric",
  month: "short",
  year: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});
const dateFmt = new Intl.DateTimeFormat("th-TH", {
  timeZone: "Asia/Bangkok",
  day: "numeric",
  month: "short",
  year: "numeric",
});

export const fmtQty = (n: number | null | undefined) => (n === null || n === undefined ? "-" : qtyFmt.format(n));
export const fmtMoney = (n: number | null | undefined) => (n === null || n === undefined ? "-" : moneyFmt.format(n));
export const fmtCost = (n: number | null | undefined) => (n === null || n === undefined ? "-" : costFmt.format(n));

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "-";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "-" : dateTimeFmt.format(d);
}

/** "YYYY-MM-DD" (calendar date) -> Thai date. */
export function fmtDate(date: string | null | undefined): string {
  if (!date) return "-";
  const d = new Date(`${date}T00:00:00+07:00`);
  return Number.isNaN(d.getTime()) ? "-" : dateFmt.format(d);
}

/** Today in Bangkok as "YYYY-MM-DD". */
export function todayBangkok(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(new Date());
}

/** Parse a user-typed number ("1,234.5") -> number | null. */
export function parseNumberInput(v: string): number | null {
  const s = v.replace(/,/g, "").trim();
  if (!s || !/^-?\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
