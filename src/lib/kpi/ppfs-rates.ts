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
  | "MCH_IODINE"
  | "MCH_UPT"
  | "NB_TSH"
  | "FP_DMPA"
  | "FP_PILL"
  | "FLU_VACCINE";

export interface PpfsRate {
  code: PpfsRateCode;
  name: string;
  group: string;
  /** Baht per unit. */
  rate: number;
  unit: string;
  condition: string;
  grade: PpfsGrade;
  /**
   * true = the rate is the price set in HOSxP for the ADP code, not yet
   * checked against the NHSO FY2569 announcement.
   */
  rateUnconfirmed?: boolean;
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
  { code: "ANC_US", name: "อัลตราซาวด์ ANC", group: "แม่และเด็ก", rate: 400, unit: "ต่อครั้ง", condition: "หญิงตั้งครรภ์", grade: "B" },
  { code: "ANC_DENTAL", name: "ทันตกรรม ANC", group: "แม่และเด็ก", rate: 500, unit: "ต่อครรภ์", condition: "หญิงตั้งครรภ์ ครั้งเดียวต่อครรภ์", grade: "B" },
  { code: "PP_VISIT", name: "ตรวจหลังคลอด", group: "แม่และเด็ก", rate: 150, unit: "ต่อครั้ง", condition: "หญิงหลังคลอด 3 ครั้ง", grade: "B" },
  // HOSxP price of ADP 30016 (nondrugitems 3002640); unconfirmed.
  { code: "MCH_IODINE", name: "ยาเสริมไอโอดีน/ธาตุเหล็ก หญิงหลังคลอด", group: "แม่และเด็ก", rate: 135, unit: "ต่อคน", condition: "หญิงหลังคลอด ภายใน 42 วันหลังคลอด", grade: "B", rateUnconfirmed: true },
  // HOSxP price of ADP 30014 (nondrugitems 3002426 / 3002639); unconfirmed.
  { code: "MCH_UPT", name: "ทดสอบการตั้งครรภ์ (UPT)", group: "แม่และเด็ก", rate: 75, unit: "ต่อครั้ง", condition: "หญิงที่สงสัยว่าตั้งครรภ์", grade: "C", rateUnconfirmed: true },
  { code: "NB_TSH", name: "TSH ทารกแรกเกิด", group: "เด็ก", rate: 135, unit: "ต่อราย", condition: "ทารกแรกเกิด", grade: "C" },
  // Confirmed by the NHSO FY2569 claim guideline (17 Oct 2025): FP003_4, FP003_1.
  { code: "FP_DMPA", name: "ยาฉีดคุมกำเนิด (DMPA)", group: "วางแผนครอบครัว", rate: 60, unit: "ต่อครั้ง", condition: "หญิงไทยวัยเจริญพันธุ์ทุกสิทธิ ไม่เกิน 5 ครั้งต่อคนต่อปี", grade: "C" },
  { code: "FP_PILL", name: "ยาเม็ดคุมกำเนิดชนิดฮอร์โมนรวม", group: "วางแผนครอบครัว", rate: 40, unit: "ต่อแผง", condition: "หญิงไทยวัยเจริญพันธุ์ทุกสิทธิ ครั้งละไม่เกิน 3 แผง ไม่เกิน 13 แผงต่อคนต่อปี", grade: "C" },
  // Service fee only; the vaccine itself is allocated by NHSO (VMI).
  { code: "FLU_VACCINE", name: "ค่าบริการฉีดวัคซีนไข้หวัดใหญ่", group: "วัคซีน", rate: 20, unit: "ต่อโดส", condition: "คนไทย 7 กลุ่มเสี่ยงทุกสิทธิ (ตัววัคซีน สปสช. จัดสรรให้)", grade: "C" },
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

/**
 * Mother-and-child items shown on the hospital page only (HOSxP, SQL in
 * sql/ppfs-hosxp.ts). Kept apart from PpfsItemCode because the district
 * page (district-pp-items.ts, sql/district-ppfs-hdc.ts) keys HDC SQL by
 * Record<PpfsItemCode, …> and must not change.
 */
export type PpfsMchItemCode =
  | "ANC_LAB2"
  | "ANC_US"
  | "ANC_DENTAL"
  | "PP_VISIT"
  | "MCH_IODINE"
  | "MCH_UPT";

/**
 * Family-planning and influenza-vaccine items of the hospital page only
 * (HOSxP, no target population: grade C). Kept apart from PpfsItemCode for
 * the same reason as PpfsMchItemCode.
 */
export type PpfsFpVaccineItemCode = "FP_DMPA" | "FP_PILL" | "FLU_VACCINE";

/** Every item code of the hospital PPFS page. */
export type PpfsHospitalItemCode =
  | PpfsItemCode
  | PpfsMchItemCode
  | PpfsFpVaccineItemCode;

/**
 * Display definition of one revenue item. `C` is the item-code union of the
 * page: PpfsHospitalItemCode on /pp, NhsoOtherItemCode on /pp/other.
 */
export interface PpfsItemDef<C extends string = PpfsHospitalItemCode> {
  code: C;
  name: string;
  group: string;
  rate: number;
  unit: string;
  condition: string;
  grade: PpfsGrade;
  population: PpfsPopulation;
  ceiling: boolean;
  caveat: string | null;
  /** See PpfsRate.rateUnconfirmed (shown as a badge in the table). */
  rateUnconfirmed: boolean;
}

type ItemExtra = Pick<PpfsItemDef, "population" | "ceiling" | "caveat"> &
  Partial<Pick<PpfsItemDef, "unit" | "grade" | "condition">>;

function fromRate<C extends PpfsRateCode & PpfsHospitalItemCode>(
  code: C,
  extra: ItemExtra,
): PpfsItemDef<C> {
  const { name, group, rate, unit, condition, grade, rateUnconfirmed } = ppfsRate(code);
  return {
    code,
    name,
    group,
    rate,
    unit,
    condition,
    grade,
    rateUnconfirmed: rateUnconfirmed ?? false,
    ...extra,
  };
}

const CATCHMENT = { population: "catchment", ceiling: false } as const;

/**
 * Phase 1 items, in display order before sorting by gap. Shared with the
 * district page (HDC, district-pp-items.ts); the hospital-only
 * mother-and-child items are in PPFS_MCH_ITEMS below.
 */
export const PPFS_PHASE1_ITEMS: readonly PpfsItemDef<PpfsItemCode>[] = [
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
    rateUnconfirmed: false,
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
      "นับจากผู้มาฝากครรภ์ที่ รพ. ทำแล้ว = มีใบสั่ง LAB ANC ในปีงบฯ ก่อนอายุครรภ์ 28 สัปดาห์ (ใช้แทนชุด lab ครั้งที่ 1 ใบสั่งตั้งแต่ GA 28 สัปดาห์นับเป็นชุดครั้งที่ 2)",
  }),
];

const SERVICE = { population: "service", ceiling: false } as const;

/**
 * Mother-and-child items of the hospital page only (HOSxP, service-based:
 * ANC pregnancies / Thai women who gave birth / UPT visits at the
 * hospital). Definitions and FY2569 checks:
 * docs/kpi/ppfs-revenue-feasibility.md ("Implemented").
 */
export const PPFS_MCH_ITEMS: readonly PpfsItemDef<PpfsMchItemCode>[] = [
  fromRate("ANC_LAB2", {
    ...SERVICE,
    caveat:
      "นับจากผู้มาฝากครรภ์ที่ รพ. เป้า = ครรภ์ที่อายุครรภ์ 32 สัปดาห์ (LMP + 224 วัน) ตกในปีงบฯ · ทำแล้ว = มีใบสั่ง LAB ANC ในปีงบฯ ที่อายุครรภ์ 28 สัปดาห์ขึ้นไปจนถึงคลอด · ครรภ์ที่ตรวจชุดที่ 2 ในปีงบฯ แต่อายุครรภ์ 32 สัปดาห์ตกปีงบฯ ถัดไป ยังไม่นับ (ปี 2569 ราว 9 ครรภ์)",
  }),
  fromRate("ANC_US", {
    ...SERVICE,
    unit: "ต่อครรภ์",
    caveat:
      "อัตรา 400 บาทต่อครั้ง แต่นับ 1 ครั้งต่อครรภ์ตามที่ รพ. คิดเงินจริง (จำนวนครั้งที่ประกาศอนุญาตยังรอยืนยัน) · เป้า = ครรภ์ที่เริ่มฝากในปีงบฯ (เหมือน lab ครั้งที่ 1) · ทำแล้ว = มีบันทึกอัลตราซาวด์ในการฝากครรภ์ในปีงบฯ",
  }),
  fromRate("ANC_DENTAL", {
    ...SERVICE,
    caveat:
      "เป้า = ครรภ์ที่เริ่มฝากในปีงบฯ (เหมือน lab ครั้งที่ 1) · ทำแล้ว = ตรวจฟันหรือขัดฟัน (ทันตกรรม 000309, 000310, 000292) ในปีงบฯ ระหว่างตั้งครรภ์",
  }),
  fromRate("PP_VISIT", {
    population: "service",
    ceiling: true,
    caveat:
      "เพดาน: เป้า = หญิงไทยที่คลอดในปีงบฯ × 3 ครั้ง แต่หญิงคลอดราว 60% อาจไปตรวจหลังคลอดที่ รพ.สต. ซึ่ง HOSxP ของ รพ. มองไม่เห็น · ทำแล้ว = วันที่มาตรวจ 1–42 วันหลังคลอด ที่ลงรหัส Z39.2 หรือคิดรายการตรวจหลังคลอด ไม่เกิน 3 ครั้งต่อคน · นับตามรุ่นวันคลอด: คนที่คลอดปลายปีงบฯ มาตรวจในปีงบฯ ถัดไปก็นับในปีที่คลอด",
  }),
  fromRate("MCH_IODINE", {
    ...SERVICE,
    caveat:
      "อัตราจาก HOSxP รอยืนยันประกาศ สปสช. 2569 · เป้า = หญิงไทยที่คลอดในปีงบฯ · ทำแล้ว = ได้ยา Triferdine ตั้งแต่วันคลอดถึง 42 วันหลังคลอด (ผู้ป่วยในหรือนอก) · ยาที่ได้ตอนนอนหลังคลอดแทบไม่ถูกคิดรายการ 30016 และ 30016 ส่วนใหญ่ถูกคิดตอนฝากครรภ์ ซึ่งเสี่ยงถูกปฏิเสธถ้าประกาศจ่ายเฉพาะหลังคลอด · นับตามรุ่นวันคลอด: คนที่คลอดปลายปีงบฯ ได้ยาในปีงบฯ ถัดไปก็นับในปีที่คลอด",
  }),
  fromRate("MCH_UPT", {
    ...SERVICE,
    caveat:
      "อัตราจาก HOSxP รอยืนยันประกาศ สปสช. 2569 · ไม่มีข้อมูลกลุ่มเป้าหมาย ทำแล้ว = ครั้งที่หญิงไทยตรวจ UPT (มีผล) ที่ OPD ในปีงบฯ · รวม UPT ก่อนผ่าตัด/เอกซเรย์ที่อาจไม่เข้าเงื่อนไข PP",
  }),
];

/**
 * Family planning + influenza vaccine (hospital page only, HOSxP,
 * service-based, no target population: grade C). Rates confirmed by the
 * NHSO FY2569 claim guideline. Definitions and FY2569 checks:
 * docs/kpi/ppfs-revenue-feasibility.md (10.7).
 */
export const PPFS_FP_VACCINE_ITEMS: readonly PpfsItemDef<PpfsFpVaccineItemCode>[] = [
  fromRate("FP_DMPA", {
    ...SERVICE,
    caveat:
      "ไม่มีข้อมูลกลุ่มเป้าหมาย ทำแล้ว = ครั้ง (visit OPD) ที่หญิงไทยได้ยาฉีด DMPA ในปีงบฯ ไม่เกิน 5 ครั้งต่อคน · คิดเงินแล้ว = ครั้งเดียวกันที่ถูกคิดรายการ FP003_4 · ไม่นับยาที่ฉีดขณะนอน รพ.",
  }),
  fromRate("FP_PILL", {
    ...SERVICE,
    caveat:
      "ไม่มีข้อมูลกลุ่มเป้าหมาย ทำแล้ว = จำนวนแผงยาเม็ดฮอร์โมนรวมที่จ่ายให้หญิงไทยที่ OPD ในปีงบฯ (ครั้งละไม่เกิน 3 แผง สะสมไม่เกิน 13 แผงต่อคน) · คิดเงินแล้ว นับเป็นครั้ง (visit) ที่ถูกคิดรายการ FP003_1 ไม่ใช่จำนวนแผง · ยังไม่รวมยาเม็ดคุมกำเนิดฉุกเฉิน (FP003_3, 50 บาท) และชนิดฮอร์โมนเดี่ยว (FP003_2, 80 บาท ยาปิดใช้แล้ว)",
  }),
  fromRate("FLU_VACCINE", {
    ...SERVICE,
    caveat:
      "ไม่มีข้อมูลกลุ่มเป้าหมาย ทำแล้ว = โดสวัคซีนไข้หวัดใหญ่ (รหัส 815) ที่ รพ. ฉีดให้คนไทยในปีงบฯ ไม่นับ 817 (ผู้ประกันตน) และ 818 (กลุ่มอื่น) และไม่ได้ตรวจว่าอยู่ใน 7 กลุ่มเสี่ยงจริง · เบิกผ่านระบบ KTB/หมอพร้อม ไม่มีรายการค่าบริการใน HOSxP จึงดูยอดคิดเงินแล้วจาก HOSxP ไม่ได้",
  }),
];

/**
 * Items of the hospital PPFS page (/pp): Phase 1 + mother-and-child +
 * family planning / influenza vaccine.
 */
export const PPFS_HOSPITAL_ITEMS: readonly PpfsItemDef[] = [
  ...PPFS_PHASE1_ITEMS,
  ...PPFS_MCH_ITEMS,
  ...PPFS_FP_VACCINE_ITEMS,
];
