import type { ReactNode } from "react";
import type { F43FileStatus } from "@/lib/kpi/f43-types";
import { chipClass } from "../overview/table-styles";

/** Chip colours of /f43 (pass / warn / error / neutral). */
export const F43_TONE = {
  pass: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  warn: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  error: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
  muted: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
} as const;

export type F43Tone = keyof typeof F43_TONE;

export function F43Chip({ tone, children }: { tone: F43Tone; children: ReactNode }) {
  return <span className={`${chipClass} whitespace-nowrap ${F43_TONE[tone]}`}>{children}</span>;
}

export const FILE_STATUS: Record<F43FileStatus, { tone: F43Tone; label: string }> = {
  pass: { tone: "pass", label: "พร้อมส่ง" },
  warn: { tone: "warn", label: "พร้อมส่ง (มีเตือน)" },
  error: { tone: "error", label: "ยังไม่พร้อม" },
  empty: { tone: "muted", label: "ไม่มีข้อมูล" },
  na: { tone: "muted", label: "ไม่แยกหน่วย" },
  unsupported: { tone: "muted", label: "ยังไม่รองรับ" },
};

/** /f43 URL with the given params (empty values dropped). */
export function f43Href(p: { from: string; to: string; u?: string; file?: string | null }): string {
  const qs = new URLSearchParams({ from: p.from, to: p.to });
  if (p.u !== undefined && p.u !== "*") qs.set("u", p.u);
  if (p.file) qs.set("file", p.file);
  return `/f43?${qs.toString()}`;
}
