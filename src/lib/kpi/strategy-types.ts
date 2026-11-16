/**
 * Data contract for the "ยุทธศาสตร์ & HA" tab (/strategy): hospital
 * strategic KPIs (fiscal years 2568–2569, quarterly) and HA Part I–IV
 * quality indicators (fiscal years 2565–2569). Aggregates only, no
 * patient-identifying data. Produced by getStrategyDashboard()
 * (src/lib/kpi/strategy.ts); the UI only receives it via props.
 */

/** A table cell from the source sheets: number, free text, or "" (empty). */
export type Cell = number | string;

export interface Kpi {
  idx: number;
  code: string;
  name: string;
  /** Strategy index (2569) or goal index (2568). */
  groupIdx: number;
  groupName: string;
  groupShort: string;
  /** Objective text — 2568 only. */
  objective?: string;
  target: string;
  /** Q1..Q4 results. */
  q: [Cell, Cell, Cell, Cell];
  /** 1 = pass, 0 = fail. */
  status: 0 | 1;
  owner: string;
}

export interface HaSection {
  id: number;
  partIdx: number;
  partName: string;
  secName: string;
}

export interface HaItem {
  idx: number;
  secId: number;
  partIdx: number;
  partName: string;
  secName: string;
  name: string;
  target: string;
  /** Results for fiscal years 2565..2569. */
  years: [Cell, Cell, Cell, Cell, Cell];
}

export interface StrategyDashboardData {
  kpi2569: Kpi[];
  kpi2568: Kpi[];
  /** Strategy names, 2569 (index = Kpi.groupIdx). */
  strat69: string[];
  /** Goal names, 2568 (index = Kpi.groupIdx). */
  goals68: string[];
  /** HA part names (index = partIdx). */
  partNames: string[];
  haSections: HaSection[];
  haItems: HaItem[];
}
