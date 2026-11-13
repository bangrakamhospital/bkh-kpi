/**
 * "P&P Basic Services" (/pp/basic) — coverage of the NHSO basic P&P
 * services in the hospital's catchment (TYPEAREA 1/3, Thai), per fiscal
 * year. Capitation-funded, so coverage (target vs done), not baht.
 * Aggregates only — no person rows.
 */

export type PpBasicCode =
  | "CHILD_DEV" // 1. เด็ก 0-5 ปี ตรวจพัฒนาการ
  | "CHILD_GROWTH" // 2. เด็ก 0-12 ปี ชั่งน้ำหนัก วัดส่วนสูง
  | "EPI" // 3. แรกเกิด-ป.6 วัคซีนพื้นฐาน
  | "FLUORIDE" // 4. เด็ก 4-12 ปี เคลือบฟลูออไรด์
  | "SEALANT" // 5. เด็ก 6-12 ปี เคลือบหลุมร่องฟัน
  | "ELDERLY_DEPRESSION"; // 6. ผู้สูงอายุ 60+ คัดกรองซึมเศร้า

/** Per-village aggregates (person.village_id; 0 = unknown village). */
export interface PpBasicVillageRow {
  villageId: number;
  moo: string | null;
  villageName: string | null;
  target: number;
  done: number;
}

export interface PpBasicItem {
  code: PpBasicCode;
  /** 1..6, display order. */
  order: number;
  /** Thai display name, e.g. "ตรวจพัฒนาการ". */
  name: string;
  /** Thai target group, e.g. "เด็กเล็กอายุ 0-5 ปี". */
  group: string;
  /** Thai definition of target and done (how it is counted). */
  condition: string;
  /** Thai count unit, e.g. "คน". */
  unit: string;
  /** Persons in the target group. */
  target: number;
  /** Persons in the target group who received the service. */
  done: number;
  /** done / target × 100 (0 when target 0). */
  percent: number;
  /** Short Thai note on proxies / data limits; null when none. */
  caveat: string | null;
  villages: PpBasicVillageRow[];
  /** Baht figures (see PpBasicMoney); null when the item failed (error set). */
  money: PpBasicMoney | null;
  /** Set when this item's query failed; the item then shows no numbers. */
  error?: string;
}

/**
 * "nhso"      = real NHSO fee-schedule rate (EPI: 20 baht per dose).
 * "reference" = internal reference value set by the hospital in
 *               src/lib/kpi/ppbasic-rates.ts — NOT money paid by NHSO
 *               (basic P&P is capitation-funded).
 * "unset"     = no rate decided yet: no baht shown for the item.
 */
export type PpBasicRateBasis = "nhso" | "reference" | "unset";

export interface PpBasicMoney {
  basis: PpBasicRateBasis;
  /** Baht per unit; null when basis is "unset". */
  rate: number | null;
  /** Thai per-unit text, e.g. "ต่อเข็ม", "ต่อคน". */
  rateUnit: string;
  /** Thai note on where the rate comes from. */
  rateNote: string;
  /**
   * Units the baht is computed on. For most items = persons (target/done).
   * EPI = vaccine doses: doneUnits = every EPI dose this hospital gave to
   * UC children in the period, all areas; targetUnits = doneUnits + the
   * catchment gap max(0, catchmentDueUnits − catchmentDoneUnits).
   */
  targetUnits: number;
  doneUnits: number;
  /**
   * EPI only (optional). doneUnits = catchmentDoneUnits +
   * catchmentBirthUnits + outOfAreaUnits.
   *   catchmentDueUnits   doses due by the EPI schedule (2 months – ป.6,
   *                       no birth doses) for catchment children
   *   catchmentDoneUnits  scheduled doses given here to catchment children
   *   catchmentBirthUnits birth doses (BCG, HBV1) given here to catchment
   *                       newborns (no schedule target: own target)
   *   outOfAreaUnits      doses given here to children outside the
   *                       catchment (own target, never a gap)
   * Village figures (persons) never include out-of-area children.
   */
  catchmentDueUnits?: number;
  catchmentDoneUnits?: number;
  catchmentBirthUnits?: number;
  outOfAreaUnits?: number;
  /** Thai unit of targetUnits/doneUnits, e.g. "เข็ม", "คน". */
  units: string;
  /** targetUnits × rate; null when unset. */
  targetBaht: number | null;
  /** doneUnits × rate; null when unset. */
  earnedBaht: number | null;
  /** max(0, targetBaht − earnedBaht); null when unset. */
  gapBaht: number | null;
}

export interface PpBasicSummary {
  /** Fiscal year (BE) requested. */
  fiscalYear: number;
  /** 'YYYY-MM-DD' fiscal year start / end. */
  periodStart: string;
  periodEnd: string;
  /**
   * 'YYYY-MM-DD' inclusive end of the counted data: periodEnd when closed,
   * otherwise today. Milestone targets (CHILD_DEV, EPI age cohorts) only
   * include children already due by this date.
   */
  dataAsOf: string;
  closed: boolean;
  items: PpBasicItem[];
  /**
   * Baht totals over items with a rate, split by basis so the UI never
   * mixes real NHSO money with reference values in one figure.
   */
  moneyTotals: {
    nhso: { targetBaht: number; earnedBaht: number; gapBaht: number };
    reference: { targetBaht: number; earnedBaht: number; gapBaht: number };
  };
  /** ISO timestamp the figures were computed. */
  updatedAt: string;
}
