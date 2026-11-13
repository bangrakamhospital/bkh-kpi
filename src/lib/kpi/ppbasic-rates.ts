import type { PpBasicCode, PpBasicRateBasis } from "@/lib/kpi/ppbasic-types";

/**
 * P&P Basic Services (/pp/basic) money table — the single editable place
 * for the baht value of each of the 6 items.
 *
 * Basic P&P is capitation-funded (เหมาจ่ายรายหัว), so most items have NO
 * per-item NHSO payment. Each item therefore has a `basis`:
 *   "nhso"      real NHSO PPFS fee-schedule rate (source: NHSO PPFS FY2569,
 *               https://www.uckkpho.com/ppfs69/ — same as ./ppfs-rates.ts).
 *               Only EPI: item 25 "ค่าบริการฉีดวัคซีน" 20 baht per dose of
 *               the EPI vaccines in the NHSO announcement (table 1).
 *   "reference" a reference value chosen by the hospital to show the worth
 *               of the work. It is NOT money paid by NHSO; the UI shows it
 *               separately and never adds it to NHSO money.
 *   "unset"     no value decided: the page shows counts only, no baht.
 *
 * How the hospital edits a reference value:
 *   1. Change `rate` (baht per unit) and, if needed, `rateNote` (Thai text
 *      shown next to the figure: say where the number comes from).
 *   2. To give an "unset" item a value, set basis: "reference" and a rate.
 *      To hide the baht of an item, set basis: "unset" and rate: null.
 *   3. Do not use basis "nhso" unless NHSO actually pays that item per
 *      unit (cite the PPFS item number in rateNote).
 *   4. Units: EPI is valued per vaccine dose (done = every EPI dose this
 *      hospital gave to UC children in the FY, all areas; target = done +
 *      the catchment schedule gap, see ./ppbasic.ts toDoseUnits); every
 *      other item per person (target / done persons). `rateUnit` is only
 *      the display text of that unit — changing it does not change the
 *      counting. Results are cached (tag "kpi:ppbasic", hours); a rebuild /
 *      redeploy or revalidateTag shows the new rate.
 * NOTE: FY2570 NHSO rates are not published yet; keep the FY2569 values
 * until they are (same rule as ./ppfs-rates.ts, PPFS_RATE_YEAR).
 */

export const PPBASIC_RATE_YEAR = 2569;

/** basis "unset" <=> rate null (enforced by the type). */
export type PpBasicRate =
  | {
      basis: Exclude<PpBasicRateBasis, "unset">;
      /** Baht per unit. */
      rate: number;
      /** Thai per-unit text, e.g. "ต่อเข็ม". */
      rateUnit: string;
      /** Thai note on where the rate comes from. */
      rateNote: string;
    }
  | { basis: "unset"; rate: null; rateUnit: string; rateNote: string };

const UNSET_NOTE = "ยังไม่กำหนดมูลค่าอ้างอิง (เหมาจ่ายรายหัว)";

export const PPBASIC_RATES: Readonly<Record<PpBasicCode, PpBasicRate>> = {
  CHILD_DEV: { basis: "unset", rate: null, rateUnit: "ต่อคน", rateNote: UNSET_NOTE },
  CHILD_GROWTH: { basis: "unset", rate: null, rateUnit: "ต่อคน", rateNote: UNSET_NOTE },
  EPI: {
    basis: "nhso",
    rate: 20,
    rateUnit: "ต่อเข็ม",
    rateNote:
      "อัตรา สปสช. PPFS ปีงบ 2569 ข้อ 25 ค่าบริการฉีดวัคซีน · นับทุกเข็ม EPI ที่ฉีดให้เด็กสิทธิ UC ในปีงบ (รวมนอกเขต)",
  },
  FLUORIDE: {
    basis: "reference",
    rate: 100,
    rateUnit: "ต่อคน",
    rateNote:
      "มูลค่าอ้างอิง เทียบอัตราทาฟลูออไรด์ของ สปสช. (ข้อ 19, ผู้ใหญ่) — เด็กอยู่ในเหมาจ่ายรายหัว",
  },
  SEALANT: { basis: "unset", rate: null, rateUnit: "ต่อคน", rateNote: UNSET_NOTE },
  ELDERLY_DEPRESSION: {
    basis: "unset",
    rate: null,
    rateUnit: "ต่อคน",
    rateNote: UNSET_NOTE,
  },
};
