"use client";

import { useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { CalendarDays } from "lucide-react";
import type { OverviewPreset, OverviewRange } from "@/lib/kpi/overview-types";

const PRESETS: { value: OverviewPreset; label: string }[] = [
  { value: "today", label: "วันนี้" },
  { value: "yesterday", label: "เมื่อวาน" },
  { value: "7d", label: "7 วันล่าสุด" },
  { value: "month", label: "เดือนนี้" },
  { value: "fiscal", label: "ปีงบประมาณ" },
  { value: "custom", label: "กำหนดเอง" },
];

const dateFormat = new Intl.DateTimeFormat("th-TH", {
  timeZone: "UTC",
  day: "numeric",
  month: "short",
  year: "numeric",
});

function formatShortThai(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return dateFormat.format(new Date(Date.UTC(y, m - 1, d)));
}

function DateField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <label htmlFor={id} className="text-zinc-600 dark:text-zinc-400">
        {label}
      </label>
      <div className="relative">
        <div className="inline-flex min-w-32 items-center justify-between gap-2 rounded-lg border border-zinc-300 bg-surface px-3 py-1.5 text-xs dark:border-zinc-700">
          <span>{formatShortThai(value)}</span>
          <CalendarDays aria-hidden="true" className="h-4 w-4 text-brand-700 dark:text-brand-300" />
        </div>
        <input
          id={id}
          type="date"
          value={value}
          onChange={(e) => {
            if (e.target.value) onChange(e.target.value);
          }}
          onClick={(e) => e.currentTarget.showPicker?.()}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
      </div>
    </div>
  );
}

export function RangePicker({ range }: { range: OverviewRange }) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();

  function navigate(params: Record<string, string>) {
    const qs = new URLSearchParams(params).toString();
    startTransition(() => {
      router.replace(qs ? `${pathname}?${qs}` : pathname);
    });
  }

  function onPreset(next: OverviewPreset) {
    if (next === "custom") {
      navigate({ preset: "custom", from: range.from, to: range.to });
    } else {
      navigate({ preset: next });
    }
  }

  function onDate(key: "from" | "to", value: string) {
    const from = key === "from" ? value : range.from;
    const to = key === "to" ? value : range.to;
    navigate({
      preset: "custom",
      from: from <= to ? from : to,
      to: from <= to ? to : from,
    });
  }

  return (
    <div
      aria-busy={pending}
      className="flex flex-wrap items-center gap-3 rounded-xl border border-zinc-200 bg-surface p-3 shadow-sm dark:border-zinc-800"
    >
      <div className="flex items-center gap-2 text-xs">
        <label htmlFor="overview-preset" className="text-zinc-600 dark:text-zinc-400">
          ช่วงเวลา
        </label>
        <select
          id="overview-preset"
          value={range.preset}
          onChange={(e) => onPreset(e.target.value as OverviewPreset)}
          className="rounded-lg border border-zinc-300 bg-surface px-3 py-1.5 text-xs focus:border-brand-600 focus:outline-2 focus:outline-brand-600 dark:border-zinc-700"
        >
          {PRESETS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
      </div>
      <DateField id="overview-from" label="ตั้งแต่" value={range.from} onChange={(v) => onDate("from", v)} />
      <DateField id="overview-to" label="ถึง" value={range.to} onChange={(v) => onDate("to", v)} />
      {pending && (
        <span role="status" className="text-xs text-zinc-600 dark:text-zinc-400">
          กำลังโหลด...
        </span>
      )}
    </div>
  );
}
