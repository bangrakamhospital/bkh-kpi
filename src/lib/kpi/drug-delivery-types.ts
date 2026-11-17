/**
 * Types of the "ค่าส่งยาที่บ้าน" report (/delivery). Pure module (no
 * server-only), shared by the loader (./drug-delivery.ts) and the UI.
 * Aggregates only: no patient-level data.
 */

/** Scheme groups of the report, in display order. */
export type DrugDeliverySchemeCode = "UC" | "SSS" | "OFC" | "LGO" | "CSH" | "OTHER";

/** Counts and baht of one row (a scheme group, a month or the total). */
export interface DrugDeliveryCounts {
  /** Visits with a pharmacy delivery record that has a parcel tracking number. */
  shipped: number;
  /** Shipped visits charged a delivery fee (postal or rider), once per visit. */
  shippedCharged: number;
  /** shipped − shippedCharged. */
  shippedUncharged: number;
  /** shippedUncharged × feeBaht (estimate, not billed). */
  shippedUnchargedBaht: number;
  /** Visits charged the postal fee (also visits without a delivery record). */
  postVisits: number;
  /** Sum of opitemrece.sum_price of the postal fee. */
  postBaht: number;
  /** Visits charged the Health Rider fee. */
  riderVisits: number;
  riderBaht: number;
  /** Postal + rider baht billed to the scheme's fund (paidst 02 ลูกหนี้สิทธิ). */
  fundBaht: number;
  /** Postal + rider baht paid by the patient (paidst 01 / 03 ชำระเอง). */
  patientBaht: number;
  /** postBaht + riderBaht − fundBaht − patientBaht (ค้างชำระ / ส่วนลด). */
  otherPaidBaht: number;
}

export interface DrugDeliverySchemeRow extends DrugDeliveryCounts {
  code: DrugDeliverySchemeCode;
  name: string;
  /** Who pays the fee for this scheme (short Thai label). */
  payer: string;
  /** pttype.hipdata_code values of the group (kept for reference; not shown in the UI). */
  hipdata: readonly string[];
}

export interface DrugDeliveryMonthRow extends DrugDeliveryCounts {
  /** "YYYY-MM" (Gregorian). */
  month: string;
}

export interface DrugDeliverySummary {
  fiscalYear: number;
  periodStart: string;
  periodEnd: string;
  closed: boolean;
  /** Fee per delivery in HOSxP (both items), for estimates and notes. */
  feeBaht: number;
  /** Always every group, in display order (zero rows included). */
  schemes: DrugDeliverySchemeRow[];
  /** Twelve months Oct–Sep (zero months included). */
  months: DrugDeliveryMonthRow[];
  total: DrugDeliveryCounts;
  updatedAt: string;
}
