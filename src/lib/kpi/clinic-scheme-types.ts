/**
 * Payment groups and scheme rows shared by every "ประมาณการรายได้แยกคลินิก"
 * page (/clinic/*). Pure module (no server-only): the rules themselves live
 * in ./sql/clinic-scheme-hosxp.ts.
 */

/** Payment groups of the infographic. */
export type ClinicPayGroupCode =
  /** "สิทธิเกิดรายได้เต็มจำนวน": billed fee-for-service. */
  | "FULL"
  /** "รายรับเรียกเก็บไม่เต็มจำนวน": capitation, the hospital is the main unit. */
  | "CAPITATION";

/** Scheme rows, in rule order (capitation first, then fee-for-service, OTHER last). */
export type ClinicSchemeCode =
  | "UC_OWN"
  | "SSS_OWN"
  | "NRH_OWN"
  | "OFC"
  | "LGO"
  | "GOV"
  | "SSS_OTHER"
  | "UC_OTHER"
  | "CSH"
  | "OTHER";
