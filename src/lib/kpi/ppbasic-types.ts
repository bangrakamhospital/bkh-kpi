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
  /** Set when this item's query failed; the item then shows no numbers. */
  error?: string;
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
  /** ISO timestamp the figures were computed. */
  updatedAt: string;
}
