"use client";

import { useId, useState, type KeyboardEvent } from "react";
import type { StrategyDashboardData } from "@/lib/kpi/strategy-types";
import { AlignView } from "./AlignView";
import { ExecutiveView } from "./ExecutiveView";
import { HaView } from "./HaView";
import { DEFAULT_KPI_FILTERS, kpiListOf, KpiView, type KpiFilters } from "./KpiView";

type TabKey = "exec" | "kpi" | "ha" | "align";

const TAB_KEYS: TabKey[] = ["exec", "kpi", "ha", "align"];
const TAB_LABELS: Record<TabKey, string> = {
  exec: "ภาพรวมผู้บริหาร (Executive)",
  kpi: "KPI ยุทธศาสตร์ รพ.",
  ha: "มาตรฐาน HA 5 ปี (Part I–IV)",
  align: "เชื่อมโยงยุทธศาสตร์ & HA",
};

/**
 * Strategy & HA dashboard (/strategy). Data arrives via props from the
 * server page (getStrategyDashboard). All four panels stay mounted (hidden
 * when inactive) so each tab keeps its filters while switching.
 */
export function StrategyDashboard({ data }: { data: StrategyDashboardData }) {
  const baseId = useId();
  const [tab, setTab] = useState<TabKey>("exec");
  const [kpiFilters, setKpiFilters] = useState<KpiFilters>(DEFAULT_KPI_FILTERS);

  const counts: Partial<Record<TabKey, number>> = {
    kpi: kpiListOf(data, kpiFilters.year).length,
    ha: data.haItems.length,
  };

  function selectStrategy(groupIdx: number) {
    setKpiFilters((f) => ({ ...f, year: "2569", group: String(groupIdx), owner: "all" }));
    setTab("kpi");
  }

  function onTabKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = TAB_KEYS[(TAB_KEYS.indexOf(tab) + step + TAB_KEYS.length) % TAB_KEYS.length];
    setTab(next);
    document.getElementById(`${baseId}-tab-${next}`)?.focus();
  }

  return (
    <div className="space-y-4">
      <div
        role="tablist"
        aria-label="เมนูหลักของแดชบอร์ด"
        className="flex gap-1 overflow-x-auto rounded-xl border border-zinc-200 bg-surface p-1.5 shadow-sm dark:border-zinc-800"
      >
        {TAB_KEYS.map((key) => {
          const active = tab === key;
          return (
            <button
              key={key}
              id={`${baseId}-tab-${key}`}
              type="button"
              role="tab"
              aria-selected={active}
              aria-controls={`${baseId}-panel-${key}`}
              tabIndex={active ? 0 : -1}
              onClick={() => setTab(key)}
              onKeyDown={onTabKeyDown}
              className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 ${
                active
                  ? "bg-brand-700 text-white"
                  : "text-zinc-700 hover:bg-brand-50 dark:text-zinc-300 dark:hover:bg-brand-900/40"
              }`}
            >
              {TAB_LABELS[key]}
              {counts[key] !== undefined && (
                <span
                  className={`rounded-full px-1.5 text-xs font-semibold tabular-nums ${
                    active ? "bg-white/20" : "bg-brand-100 text-brand-800 dark:bg-brand-900 dark:text-brand-200"
                  }`}
                >
                  {counts[key]}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {TAB_KEYS.map((key) => (
        <div
          key={key}
          id={`${baseId}-panel-${key}`}
          role="tabpanel"
          aria-labelledby={`${baseId}-tab-${key}`}
          hidden={tab !== key}
        >
          {key === "exec" && (
            <ExecutiveView
              data={data}
              onSelectStrategy={selectStrategy}
              onShowAllKpi={() => setTab("kpi")}
            />
          )}
          {key === "kpi" && (
            <KpiView data={data} filters={kpiFilters} onFiltersChange={setKpiFilters} />
          )}
          {key === "ha" && <HaView data={data} />}
          {key === "align" && <AlignView />}
        </div>
      ))}
    </div>
  );
}
