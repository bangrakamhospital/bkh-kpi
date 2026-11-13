"use client";

import { useId, useState } from "react";
import { Table2 } from "lucide-react";

/** Card with title, optional badge (top-right) and a "show data table" toggle. */
export function ChartCard({
  title,
  badge,
  chart,
  table,
  controls,
}: {
  title: string;
  badge?: string;
  chart: React.ReactNode;
  table: React.ReactNode;
  controls?: React.ReactNode;
}) {
  const [showTable, setShowTable] = useState(false);
  const panelId = useId();

  return (
    <section
      aria-label={title}
      className="min-w-0 rounded-xl border border-zinc-200 bg-surface p-4 shadow-sm dark:border-zinc-800"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 className="text-base font-semibold">{title}</h2>
        {badge && (
          <span className="rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-semibold text-brand-800 dark:bg-brand-900 dark:text-brand-100">
            {badge}
          </span>
        )}
      </div>
      {controls && <div className="mt-2">{controls}</div>}
      <div id={panelId} className="mt-3">
        {showTable ? <div className="overflow-x-auto">{table}</div> : chart}
      </div>
      <button
        type="button"
        aria-pressed={showTable}
        aria-controls={panelId}
        onClick={() => setShowTable((v) => !v)}
        className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 px-3 py-1 text-xs font-medium hover:bg-brand-50 focus-visible:outline-2 focus-visible:outline-brand-600 dark:border-zinc-700 dark:hover:bg-brand-900/40"
      >
        <Table2 aria-hidden="true" className="h-4 w-4" />
        {showTable ? "แสดงกราฟ" : "แสดงตารางข้อมูล"}
      </button>
    </section>
  );
}
