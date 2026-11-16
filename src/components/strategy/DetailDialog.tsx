"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import type { Kpi } from "@/lib/kpi/strategy-types";
import { fmtCell, fmtTarget } from "@/lib/kpi/strategy-format";
import { KpiQuarterChart } from "./BarCharts";
import { CodeChip, Pill, StatusBadge } from "./ui";

/**
 * Detail modal for a KPI / HA indicator. Uses a native <dialog> (same
 * pattern as DistrictPersonsDialog): Esc and backdrop click close it.
 */
export function DetailDialog({
  open,
  onClose,
  badge,
  title,
  meta,
  children,
}: {
  open: boolean;
  onClose: () => void;
  badge?: ReactNode;
  title: ReactNode;
  meta?: ReactNode;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) e.currentTarget.close();
      }}
      className="m-auto max-h-[90dvh] w-[calc(100vw-1.5rem)] max-w-2xl overflow-hidden rounded-xl bg-surface p-0 text-left text-foreground backdrop:bg-black/50 backdrop:backdrop-blur-sm open:flex"
    >
      {open && (
        <div className="flex min-h-0 w-full flex-col">
          <header className="flex items-start gap-3 bg-linear-to-r from-brand-700 to-brand-900 p-3 text-white">
            <div className="min-w-0 flex-1">
              {badge && <CodeChip>{badge}</CodeChip>}
              <h2 id={titleId} className="mt-1 text-base font-bold leading-6">
                {title}
              </h2>
              {meta && <p className="mt-0.5 text-xs text-white/90">{meta}</p>}
            </div>
            <button
              type="button"
              onClick={() => ref.current?.close()}
              aria-label="ปิดหน้าต่าง"
              title="ปิด"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/15 hover:bg-white/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              <X aria-hidden="true" className="h-4 w-4" />
            </button>
          </header>
          <div className="min-h-0 flex-1 overflow-auto p-4">{children}</div>
        </div>
      )}
    </dialog>
  );
}

/** Grid of labelled values inside the dialog: 4 quarters or 5 years. */
export function DetailValueGrid({ items }: { items: { label: string; value: string }[] }) {
  const cols = items.length >= 5 ? "sm:grid-cols-5" : "sm:grid-cols-4";
  return (
    <div className={`grid grid-cols-2 gap-2 ${cols}`}>
      {items.map((it) => (
        <div
          key={it.label}
          className="rounded-lg border border-zinc-200 bg-brand-50/50 p-2 dark:border-zinc-800 dark:bg-brand-900/20"
        >
          <p className="text-xs text-zinc-600 dark:text-zinc-400">{it.label}</p>
          <p className="text-base font-bold tabular-nums">{it.value}</p>
        </div>
      ))}
    </div>
  );
}

const QUARTER_LABELS = ["ไตรมาส 1 (Q1)", "ไตรมาส 2 (Q2)", "ไตรมาส 3 (Q3)", "ไตรมาส 4 (Q4)"];

/** KPI detail modal (Executive watchlist + KPI table). Open while `kpi` is set. */
export function KpiDetailDialog({
  kpi,
  year,
  onClose,
}: {
  kpi: Kpi | null;
  year: string;
  onClose: () => void;
}) {
  return (
    <DetailDialog
      open={kpi !== null}
      onClose={onClose}
      badge={kpi ? `${kpi.code} • ปีงบประมาณ ${year}` : undefined}
      title={kpi?.name ?? ""}
      meta={
        kpi
          ? `${kpi.groupName}${kpi.objective ? ` • ${kpi.objective}` : ""} | ผู้รับผิดชอบ: ${kpi.owner}`
          : undefined
      }
    >
      {kpi && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={kpi.status} />
            <Pill tone="target">เกณฑ์เป้าหมาย: {fmtTarget(kpi.target, kpi.q)}</Pill>
          </div>
          <DetailValueGrid
            items={kpi.q.map((v, i) => ({ label: QUARTER_LABELS[i], value: fmtCell(v) }))}
          />
          <KpiQuarterChart kpi={kpi} year={year} />
        </div>
      )}
    </DetailDialog>
  );
}
