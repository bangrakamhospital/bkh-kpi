/**
 * Data contract for the "PP / รายได้คัดกรอง" tab: PP Fee Schedule (สปสช. PPFS)
 * screening revenue — target baht vs earned baht vs gap baht.
 * Aggregates only, no patient-identifying data.
 * Definitions: docs/kpi/ppfs-revenue-feasibility.md ("Implemented Phase 1").
 */

/**
 * A = target and service both come from records that match the PPFS
 *     condition directly.
 * B = at least one proxy (risk group, lifetime history, schedule from LMP…).
 * C = no service marker, earned only (not shown in Phase 1).
 */
export type PpfsGrade = "A" | "B" | "C";

/**
 * catchment = people living in the hospital's own area (TYPEAREA 1/3,
 *             Thai), with a per-village breakdown.
 * service   = everyone served at the hospital (e.g. all Thai women with an
 *             ANC visit), no village breakdown.
 */
export type PpfsPopulation = "catchment" | "service";

/** Per-village aggregates of a catchment item (no person rows). */
export interface PpfsVillageRow {
  /** person.village_id; 0 = unknown village (safety net). */
  villageId: number;
  moo: string | null;
  villageName: string | null;
  target: number;
  done: number;
  /** null when the item has no billing code. */
  billed: number | null;
}

/** A conditional extra figure shown beside an item, never in its totals. */
export interface PpfsPotential {
  /** Thai label, e.g. "ครั้งที่ 9+ (ต้องส่งหลักฐาน)". */
  label: string;
  /** Short Thai label for table cells, e.g. "ครั้งที่ 9+". */
  shortLabel: string;
  /** Units (same unit as the item, e.g. visits). */
  units: number;
  /** Pregnancies / persons contributing the units. */
  persons: number;
  /** Thai unit of `persons`, e.g. "ครรภ์". */
  personsUnit: string;
  /** units × rate (only if NHSO accepts the evidence). */
  baht: number;
  /** Thai caveat shown with the figure. */
  note: string;
}

export interface PpfsItem {
  code: string;
  /** Thai display name. */
  name: string;
  /** e.g. "NCD", "มะเร็ง", "แม่และเด็ก", "โรคติดเชื้อ". */
  group: string;
  /** PPFS rate, baht per unit. */
  rate: number;
  /** e.g. "ต่อคน", "ต่อครั้ง". */
  unit: string;
  /** Eligibility condition text, e.g. "อายุ 50–70 ปี ทุก 2 ปี". */
  condition: string;
  grade: PpfsGrade;
  population: PpfsPopulation;
  /**
   * true = the target is an upper bound ("เพดาน"): the lifetime history
   * only covers this hospital's HOSxP, so people tested elsewhere still
   * look eligible.
   */
  ceiling: boolean;
  /** Short note on proxies / data limits; null when none. */
  caveat: string | null;
  /** Target units (persons or visits, see `unit`); null for grade C. */
  target: number | null;
  /** Units done (recorded service) within the target. */
  done: number;
  /**
   * Visits of the target population charged with the matching NHSO ADP
   * code in opitemrece during the fiscal year ("recorded vs charged");
   * null when the item has no ADP billing code at this site.
   */
  billed: number | null;
  /** target × rate; null when target is null. */
  targetBaht: number | null;
  /** done × rate (estimate, not an actual NHSO transfer). */
  earnedBaht: number;
  /** targetBaht − earnedBaht (min 0); null when target is null. */
  gapBaht: number | null;
  /**
   * Potential extra beyond the guaranteed units (ANC visit 9+ per
   * pregnancy, claimable only with supporting evidence reviewed by NHSO).
   * NOT included in done / earnedBaht / targetBaht / gapBaht or totals;
   * null when the item has no such figure.
   */
  potential: PpfsPotential | null;
  /** Per-village breakdown (catchment items only); null for service items. */
  villages: PpfsVillageRow[] | null;
  /** Set when this item's query failed; the item then shows no numbers. */
  error?: string;
}

export interface PpfsTotals {
  /** Sum of targetBaht over items with a target. */
  targetBaht: number;
  /** Sum of earnedBaht over all items. */
  earnedBaht: number;
  /** Sum of gapBaht over items with a target. */
  gapBaht: number;
  /** earned (of items with a target) / targetBaht × 100; 0 when no target. */
  coveragePercent: number;
}

export interface PpfsSummary {
  /** Fiscal year (BE) requested. */
  fiscalYear: number;
  /** Year of the PPFS rate table applied (BE), e.g. 2569. */
  rateYear: number;
  /** 'YYYY-MM-DD' fiscal year start / end. */
  periodStart: string;
  periodEnd: string;
  /** true when the fiscal year has ended (cached longer). */
  closed: boolean;
  items: PpfsItem[];
  totals: PpfsTotals;
  /** ISO timestamp the figures were computed. */
  updatedAt: string;
  source: "stub" | "hosxp";
}
