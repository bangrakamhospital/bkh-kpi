"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import type { F43Preset } from "@/lib/kpi/f43-range";
import { DateField } from "../overview/RangePicker";

/**
 * Date range of /f43 (?from=&to=, like @start_date/@end_date of the export
 * SQL) with shortcut buttons. `keep` = other params to keep ("&u=..&file=..").
 */
export function F43RangePicker({
  from,
  to,
  presets,
  keep,
  maxDays,
}: {
  from: string;
  to: string;
  presets: readonly F43Preset[];
  keep: string;
  maxDays: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function go(f: string, t: string) {
    const [a, b] = f <= t ? [f, t] : [t, f];
    startTransition(() => {
      router.push(`/f43?from=${a}&to=${b}${keep}`);
    });
  }

  return (
    <div aria-busy={pending} className="flex flex-wrap items-center gap-3">
      <DateField id="f43-from" label="วันที่เริ่ม" value={from} onChange={(v) => go(v, to)} />
      <DateField id="f43-to" label="ถึง" value={to} onChange={(v) => go(from, v)} />
      <div className="flex flex-wrap gap-2">
        {presets.map((p) => {
          const active = p.from === from && p.to === to;
          return (
            <button
              key={p.label}
              type="button"
              onClick={() => go(p.from, p.to)}
              aria-pressed={active}
              className={`rounded-full border px-3 py-1 text-xs font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 ${
                active
                  ? "border-brand-700 bg-brand-700 text-white"
                  : "border-brand-200 bg-brand-50 text-brand-800 hover:bg-brand-100 dark:border-brand-800 dark:bg-brand-900/30 dark:text-brand-100"
              }`}
            >
              {p.label}
            </button>
          );
        })}
      </div>
      <span className="text-xs text-zinc-600 dark:text-zinc-400">
        {pending ? "กำลังโหลด..." : `เลือกได้ไม่เกิน ${maxDays} วัน`}
      </span>
    </div>
  );
}
