"use client";

import Link from "next/link";
import { AlertTriangle, DatabaseZap, Loader2, RotateCw } from "lucide-react";
import { DOC_STATUS_LABELS, type DocStatus } from "@/lib/erp/types";
import type { ErpClientError } from "./erp-client";

/**
 * Shared UI of the /erp pages (same look as /admin: cards, pill buttons,
 * text-base / text-sm / text-xs only).
 */

export const iconCls = "h-4 w-4 shrink-0";
export const cardCls = "rounded-xl border border-zinc-200 bg-surface p-4 shadow-sm dark:border-zinc-800";
export const btnBase =
  "inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 disabled:cursor-not-allowed disabled:opacity-50";
export const btnPrimary = `${btnBase} bg-brand-700 text-white hover:bg-brand-800`;
export const btnSuccess = `${btnBase} bg-emerald-600 text-white hover:bg-emerald-700`;
export const btnDanger = `${btnBase} bg-red-600 text-white hover:bg-red-700`;
export const btnOutline = `${btnBase} border border-zinc-300 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800`;
export const inputCls =
  "w-full rounded-md border border-zinc-300 bg-surface px-2.5 py-1.5 text-xs focus:border-brand-600 focus:outline-2 focus:outline-brand-600 disabled:opacity-60 dark:border-zinc-700";
export const labelCls = "block space-y-1 text-xs";
export const thCls = "whitespace-nowrap px-2 py-2 text-left font-semibold";
export const tdCls = "px-2 py-1.5 align-top";
export const tableWrapCls = "overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800";
export const tableCls = "min-w-full divide-y divide-zinc-200 text-xs dark:divide-zinc-800";
export const theadCls = "bg-brand-50 text-brand-900 dark:bg-brand-900/30 dark:text-brand-100";

const STATUS_TONES: Record<DocStatus, string> = {
  draft: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200",
  submitted: "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200",
  approved: "bg-sky-100 text-sky-900 dark:bg-sky-900/40 dark:text-sky-200",
  rejected: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200",
  issued: "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200",
  posted: "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200",
  cancelled: "bg-zinc-200 text-zinc-600 line-through dark:bg-zinc-800 dark:text-zinc-400",
};

export function StatusBadge({ status }: { status: DocStatus }) {
  return (
    <span className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_TONES[status]}`}>
      {DOC_STATUS_LABELS[status]}
    </span>
  );
}

export function LoadingCard({ label = "กำลังโหลด..." }: { label?: string }) {
  return (
    <div className={`${cardCls} flex items-center gap-2 text-xs`}>
      <Loader2 aria-hidden="true" className={`${iconCls} animate-spin`} />
      {label}
    </div>
  );
}

/** Error card; "ERP not configured" gets its own explanation. */
export function ErrorCard({
  error,
  onRetry,
}: {
  error: ErpClientError;
  onRetry?: () => void;
}) {
  if (error.code === "erp_not_configured") {
    return (
      <div className={`${cardCls} space-y-2 text-xs`}>
        <p className="flex items-center gap-1.5 text-sm font-semibold text-amber-800 dark:text-amber-200">
          <DatabaseZap aria-hidden="true" className={iconCls} />
          ยังไม่ได้ตั้งค่าฐานข้อมูล ERP
        </p>
        <p className="text-zinc-600 dark:text-zinc-400">
          ผู้ดูแลระบบต้องสร้างฐานข้อมูล PostgreSQL และตั้งค่า ERP_DATABASE_URL บนเซิร์ฟเวอร์ก่อน (ดู docs/erp/README.md)
        </p>
      </div>
    );
  }
  return (
    <div className={`${cardCls} space-y-3 text-xs`}>
      <p role="alert" className="flex items-center gap-1.5 text-red-700 dark:text-red-300">
        <AlertTriangle aria-hidden="true" className={iconCls} />
        {error.message}
      </p>
      {error.status === 401 ? (
        <Link href="/login?callbackUrl=/erp" className={btnPrimary}>
          เข้าสู่ระบบ
        </Link>
      ) : (
        onRetry && (
          <button type="button" className={btnOutline} onClick={onRetry}>
            <RotateCw aria-hidden="true" className={iconCls} />
            ลองใหม่
          </button>
        )
      )}
    </div>
  );
}

export function InlineError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="text-xs text-red-700 dark:text-red-300">
      {message}
    </p>
  );
}

export function SectionTitle({ icon: Icon, children }: { icon: typeof Loader2; children: React.ReactNode }) {
  return (
    <h2 className="flex items-center gap-1.5 text-base font-bold">
      <Icon aria-hidden="true" className={iconCls} />
      {children}
    </h2>
  );
}

export function EmptyRow({ colSpan, children }: { colSpan: number; children: React.ReactNode }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-2 py-6 text-center text-zinc-500 dark:text-zinc-400">
        {children}
      </td>
    </tr>
  );
}

/** Spinner inside a submit button while busy. */
export function BusyIcon({ busy, icon: Icon }: { busy: boolean; icon: typeof Loader2 }) {
  return busy ? (
    <Loader2 aria-hidden="true" className={`${iconCls} animate-spin`} />
  ) : (
    <Icon aria-hidden="true" className={iconCls} />
  );
}
