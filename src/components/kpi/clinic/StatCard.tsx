import type { LucideIcon } from "lucide-react";

export interface StatCardProps {
  title: string;
  value: string;
  sub: string;
  Icon: LucideIcon;
  /** Icon badge colours (bg + text, light and dark). */
  tone: string;
}

/** Headline card of the /clinic/* pages (value at 16px, emphasis by weight). */
export function StatCard({ title, value, sub, Icon, tone }: StatCardProps) {
  return (
    <div className="min-w-0 rounded-xl border border-zinc-200 bg-surface p-4 shadow-sm dark:border-zinc-800">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-zinc-600 dark:text-zinc-400">{title}</p>
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${tone}`}>
          <Icon aria-hidden="true" className="h-5 w-5" />
        </span>
      </div>
      <p className="mt-2 break-words text-base font-bold tabular-nums text-zinc-950 dark:text-zinc-50">
        {value}
      </p>
      <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">{sub}</p>
    </div>
  );
}

/** Icon badge tones of the four headline cards, in card order. */
export const STAT_TONES = {
  sky: "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300",
  emerald: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  amber: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  violet: "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300",
} as const;
