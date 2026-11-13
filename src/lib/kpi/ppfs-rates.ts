import type {
  PpfsGrade,
  PpfsPopulation,
} from "@/lib/kpi/ppfs-types";

/**
 * PPFS (PP Fee Schedule) rate table — the single editable place for rates.
 * Source: https://www.uckkpho.com/ppfs69/ (FY2569 rates).
 * NOTE: per-item rates for FY2570 are not published yet; keep using these
 * FY2569 values until they are, then edit this file (and PPFS_RATE_YEAR).
 *
 * Grades / groups / conditions follow the HOSxP feasibility study,
 * docs/kpi/ppfs-revenue-feasibility.md (sections 3–5, "Implemented Phase 1").
 */

export const PPFS_RATE_YEAR = 2569;

export type PpfsRateCode =
  | "FPG"
  | "TC_HDL"
  | "CX_COLLECT"
  | "HPV2"
  | "HPV14"
  | "LBC_PAP_VIA"
  | "FIT"
  | "HBSAG"
  | "ANTI_HCV"
  | "CBC_WOMEN"
  | "HB_HCT_CHILD"
  | "ANC_VISIT"
  | "ANC_LAB1"
  | "ANC_LAB2"
  | "ANC_US"
  | "ANC_DENTAL"
  | "PP_VISIT"
  | "NB_TSH";

export interface PpfsRate {
  code: PpfsRateCode;
  name: string;
  group: string;
  /** Baht per unit. */
  rate: number;
  unit: string;
  condition: string;
  grade: PpfsGrade;
}

/** Every FY2569 PPFS rate known to this app (Phase 1 uses a subset). */
export const PPFS_RATES: readonly PpfsRate[] = [
  { code: "FPG", name: "ตรวจน้ำตาลในเลือด (FPG) กลุ่มเสี่ยง", group: "NCD", rate: 40, unit: "ต่อคน", condition: "อายุ 35–59 ปี กลุ่มเสี่ยง ไม่เป็นเบาหวาน ปีละครั้ง", grade: "B" },
  { code: "TC_HDL", name: "ตรวจไขมัน (TC + HDL)", group: "NCD", rate: 160, unit: "ต่อคน", condition: "อายุ 45–70 ปี ไม่มีไขมันสูง/statin ทุก 5 ปี", grade: "B" },
  { code: "CX_COLLECT", name: "เก็บตัวอย่างมะเร็งปากมดลูก", group: "มะเร็ง", rate: 50, unit: "ต่อคน", condition: "สตรีอายุ 30–59 ปี ทุก 5 ปี", grade: "B" },
  { code: "HPV2", name: "HPV DNA (2 สายพันธุ์)", group: "มะเร็ง", rate: 280, unit: "ต่อคน", condition: "สตรีอายุ 30–59 ปี ทุก 5 ปี", grade: "B" },
  { code: "HPV14", name: "HPV DNA (14 สายพันธุ์)", group: "มะเร็ง", rate: 370, unit: "ต่อคน", condition: "สตรีอายุ 30–59 ปี ทุก 5 ปี", grade: "B" },
  { code: "LBC_PAP_VIA", name: "LBC / Pap smear / VIA", group: "มะเร็ง", rate: 250, unit: "ต่อคน", condition: "สตรีอายุ 30–59 ปี ทุก 5 ปี", grade: "B" },
  { code: "FIT", name: "FIT (มะเร็งลำไส้ใหญ่)", group: "มะเร็ง", rate: 60, unit: "ต่อคน", condition: "อายุ 50–70 ปี ไม่เป็นมะเร็งลำไส้ ทุก 2 ปี", grade: "A" },
  { code: "HBSAG", name: "HBsAg (ไวรัสตับอักเสบบี)", group: "โรคติดเชื้อ", rate: 50, unit: "ต่อคน", condition: "เกิดก่อน พ.ศ. 2535 ครั้งเดียวในชีวิต", grade: "B" },
  { code: "ANTI_HCV", name: "Anti-HCV (ไวรัสตับอักเสบซี)", group: "โรคติดเชื้อ", rate: 50, unit: "ต่อคน", condition: "เกิดก่อน พ.ศ. 2535 ครั้งเดียวในชีวิต", grade: "B" },
  { code: "CBC_WOMEN", name: "ตรวจ CBC โลหิตจางในสตรี", group: "แม่และเด็ก", rate: 65, unit: "ต่อคน", condition: "สตรีอายุ 13–24 ปี ไม่ตั้งครรภ์ ปีละครั้ง", grade: "B" },
  { code: "HB_HCT_CHILD", name: "ตรวจ Hb/Hct เด็ก", group: "เด็ก", rate: 30, unit: "ต่อคน", condition: "เด็ก 6–12 เดือน และ 3–5 ปี", grade: "B" },
  { code: "ANC_VISIT", name: "ฝากครรภ์ (ANC) ต่อครั้ง", group: "แม่และเด็ก", rate: 360, unit: "ต่อครั้ง", condition: "หญิงไทยที่ฝากครรภ์ที่ รพ. ตามนัด 8 ครั้ง", grade: "B" },
  { code: "ANC_LAB1", name: "ชุดตรวจ lab ANC ครั้งที่ 1", group: "แม่และเด็ก", rate: 600, unit: "ต่อครรภ์", condition: "หญิงไทยที่ฝากครรภ์ที่ รพ. ไตรมาสแรก/เริ่มฝาก", grade: "B" },
  { code: "ANC_LAB2", name: "ชุดตรวจ lab ANC ครั้งที่ 2", group: "แม่และเด็ก", rate: 190, unit: "ต่อครรภ์", condition: "อายุครรภ์ 32 สัปดาห์", grade: "B" },
  { code: "ANC_US", name: "อัลตราซาวด์ ANC", group: "แม่และเด็ก", rate: 400, unit: "ต่อครั้ง", condition: "หญิงตั้งครรภ์", grade: "C" },
  { code: "ANC_DENTAL", name: "ทันตกรรม ANC", group: "แม่และเด็ก", rate: 500, unit: "ต่อครรภ์", condition: "หญิงตั้งครรภ์ ครั้งเดียวต่อครรภ์", grade: "B" },
  { code: "PP_VISIT", name: "ตรวจหลังคลอด", group: "แม่และเด็ก", rate: 150, unit: "ต่อครั้ง", condition: "หญิงหลังคลอด 3 ครั้ง", grade: "B" },
  { code: "NB_TSH", name: "TSH ทารกแรกเกิด", group: "เด็ก", rate: 135, unit: "ต่อราย", condition: "ทารกแรกเกิด", grade: "C" },
];

export function ppfsRate(code: PpfsRateCode): PpfsRate {
  const r = PPFS_RATES.find((x) => x.code === code);
  if (!r) throw new Error(`unknown PPFS rate code: ${code}`);
  return r;
}

/** Codes of the items shown in Phase 1 (each has SQL in sql/ppfs-hosxp.ts). */
export type PpfsItemCode =
  | "FIT"
  | "CX_HPV"
  | "TC_HDL"
  | "HBSAG"
  | "ANTI_HCV"
  | "FPG"
  | "CBC_WOMEN"
  | "ANC_VISIT"
  | "ANC_LAB1";

export interface PpfsItemDef {
  code: PpfsItemCode;
  name: string;
  group: string;
  rate: number;
  unit: string;
  condition: string;
  grade: PpfsGrade;
  population: PpfsPopulation;
  ceiling: boolean;
  caveat: string | null;
}

function fromRate(
  code: PpfsRateCode & PpfsItemCode,
  extra: Pick<PpfsItemDef, "population" | "ceiling" | "caveat">,
): PpfsItemDef {
  const { name, group, rate, unit, condition, grade } = ppfsRate(code);
  return { code, name, group, rate, unit, condition, grade, ...extra };
}

const CATCHMENT = { population: "catchment", ceiling: false } as const;

/**
 * Phase 1 items, in display order before sorting by gap. Grade C items
 * (ANC ultrasound, vaccines, …) and the small Phase 2 items (lab set 2,
 * dental, PNC, Hb/Hct child, TSH newborn) are intentionally not here.
 */
export const PPFS_PHASE1_ITEMS: readonly PpfsItemDef[] = [
  fromRate("FIT", {
    ...CATCHMENT,
    caveat: null,
  }),
  {
    code: "CX_HPV",
    name: "มะเร็งปากมดลูก: เก็บตัวอย่าง + HPV DNA (2 สายพันธุ์)",
    group: "มะเร็ง",
    rate: ppfsRate("CX_COLLECT").rate + ppfsRate("HPV2").rate,
    unit: "ต่อคน",
    condition: ppfsRate("CX_COLLECT").condition,
    grade: "B",
    ...CATCHMENT,
    caveat:
      "อัตรา 50 + 280 บาท ถ้าแล็บภายนอกเป็นผู้เบิกค่า HPV รพ. ได้เฉพาะ 50 บาท · ยอดคิดเงินนับรายการ C30 (เก็บตัวอย่าง) ซึ่ง รพ. ยังไม่เคยคิด แต่คิด 1B004 (Pap/VIA) แทนในวันตรวจ HPV",
  },
  fromRate("TC_HDL", {
    ...CATCHMENT,
    caveat:
      "ใช้อายุ 45–70 ปีตามเกณฑ์ที่ได้รับ แต่ป้ายรายการ 12004 ใน HOSxP เขียน 45–59 ปี ต้องยืนยันกับประกาศ · ตัดคนที่ได้ statin หรือตรวจ TC/HDL ใน 5 ปีก่อนปีงบฯ",
  }),
  fromRate("HBSAG", {
    population: "catchment",
    ceiling: true,
    caveat:
      "เพดาน: ประวัติตรวจย้อนได้เฉพาะใน HOSxP ของ รพ. (ประมาณ 17 ปี) คนที่ตรวจที่อื่นยังนับเป็นเป้า · ไม่มีรายการ ADP ให้คิดแบบ PP",
  }),
  fromRate("ANTI_HCV", {
    population: "catchment",
    ceiling: true,
    caveat:
      "เพดาน: ประวัติตรวจย้อนได้เฉพาะใน HOSxP ของ รพ. (ประมาณ 17 ปี) คนที่ตรวจที่อื่นยังนับเป็นเป้า · ไม่มีรายการ ADP ให้คิดแบบ PP",
  }),
  fromRate("FPG", {
    ...CATCHMENT,
    caveat:
      "กลุ่มเสี่ยง = ผลคัดกรอง NCD ในปีงบฯ นี้หรือปีก่อน ที่มีคะแนนเสี่ยง หรือ BMI ≥ 25 หรือ BP ≥ 130/85 · นับเฉพาะ FBS จากห้องแล็บ ไม่นับ DTX",
  }),
  fromRate("CBC_WOMEN", {
    ...CATCHMENT,
    caveat: "CBC = ผล Hb ในฟอร์ม Hematology (ไม่มีรายการ CBC เดี่ยว)",
  }),
  fromRate("ANC_VISIT", {
    population: "service",
    ceiling: false,
    caveat:
      "นับจากผู้มาฝากครรภ์ที่ รพ. (ทุกพื้นที่) เป้า = นัดตาม GA 12, 20, 26, 30, 34, 36, 38, 40 สัปดาห์จาก LMP ที่ตกในปีงบฯ · ทำแล้ว = วันที่มาฝากครรภ์ในปีงบฯ ครั้งที่ 1–8 ต่อครรภ์ (สปสช. จ่ายโดยไม่ต้องส่งหลักฐาน) ครั้งที่ 9+ แยกแสดงต่างหาก",
  }),
  fromRate("ANC_LAB1", {
    population: "service",
    ceiling: false,
    caveat:
      "นับจากผู้มาฝากครรภ์ที่ รพ. ทำแล้ว = มีใบสั่ง LAB ANC ในปีงบฯ (ใช้แทนชุด lab ครั้งที่ 1)",
  }),
];
