import type { DistrictPpItemDef } from "@/lib/kpi/district-pp-types";
import { PPBASIC_RATES } from "@/lib/kpi/ppbasic-rates";
import type { PpBasicCode } from "@/lib/kpi/ppbasic-types";
import { PPFS_PHASE1_ITEMS, type PpfsItemCode } from "@/lib/kpi/ppfs-rates";

/**
 * Item definitions of the district PP page (/district/pp). Client-safe
 * (constants only). Rates come from the hospital rate tables, never typed
 * here, so both pages always show the same baht.
 *
 * This file is shared by the two halves of the page:
 *  - DISTRICT_PPFS_ITEMS  (page "ppfs")  — PPFS, SQL in sql/district-ppfs-hdc.ts
 *  - DISTRICT_PPBASIC_ITEMS (page "basic") — SQL in sql/district-ppbasic-hdc.ts
 * Definitions and FY2569 figures: docs/kpi/district-pp.md (index).
 */

/* ============================== PPFS ===================================== */

/** Display unit of target / done per rate unit of ppfs-rates.ts. */
const UNIT_OF_RATE: Record<string, string> = {
  ต่อคน: "คน",
  ต่อครั้ง: "ครั้ง",
  ต่อครรภ์: "ครรภ์",
};

/** HDC-specific condition (target / done) and caveat per PPFS item. */
const PPFS_HDC: Record<PpfsItemCode, { condition: string; caveat: string }> = {
  FIT: {
    condition:
      "เป้า: คนไทยในเขตอายุ 50–70 ปี ไม่ได้ตรวจ FIT ในปีงบฯ ก่อน และไม่มีมะเร็งลำไส้ (C18–C20) ก่อนวันตรวจ · ทำแล้ว: มีรหัส SPECIALPP 1B0060/1B0061 ในปีงบฯ",
    caveat:
      "นับเฉพาะรหัส SPECIALPP ไม่นับ lab 0583166 (occult blood) ที่ไม่มีรหัส PP เพราะแยก FIT กับ guaiac ไม่ได้ · HDC ไม่มีข้อมูลปีงบฯ 2568 เป้าปี 2569 จึงยังไม่ได้ตัดคนที่ตรวจปีก่อน",
  },
  CX_HPV: {
    condition:
      "เป้า: หญิงไทยในเขตอายุ 30–59 ปี ไม่ได้คัดกรองมะเร็งปากมดลูกใน 5 ปีก่อน · ทำแล้ว: มีรหัส SPECIALPP คัดกรองมะเร็งปากมดลูก (ส่วนใหญ่ 1B0046 HPV) ในปีงบฯ",
    caveat:
      "อัตรา 50 + 280 บาท ถ้าแล็บภายนอกเบิกค่า HPV หน่วยบริการได้เฉพาะ 50 บาท · HDC มีประวัติคัดกรองตั้งแต่ พ.ค. 2568 เป้าจึงเป็นเพดาน (ยังตัดรอบ 5 ปีไม่ได้)",
  },
  TC_HDL: {
    condition:
      "เป้า: คนไทยในเขตอายุ 45–70 ปี ไม่ได้ตรวจ TC/HDL ใน 5 ปีก่อน ไม่เป็นไขมันสูง (E78) ไม่ได้ statin และไม่อยู่ในทะเบียนเบาหวาน/ความดัน ก่อนวันตรวจ · ทำแล้ว: มีผล TC และ HDL (LABFU) ในปีงบฯ",
    caveat:
      "ใช้อายุ 45–70 ปีเหมือนหน้าโรงพยาบาล (ต้องยืนยันกับประกาศ) · HDC ไม่มีประวัติ 5 ปี จึงตัดผู้ป่วยเบาหวาน/ความดันในทะเบียน CHRONIC แทน (ตรวจไขมันทุกปีอยู่แล้ว) และตัด E78/statin ที่พบก่อนวันตรวจในปีงบฯ",
  },
  HBSAG: {
    condition:
      "เป้า: คนไทยในเขตที่เกิดก่อน พ.ศ. 2535 ไม่เคยตรวจ HBsAg และไม่มีไวรัสตับอักเสบบีก่อนวันตรวจ · ทำแล้ว: มีผล HBsAg (LABFU) หรือรหัส SPECIALPP 1B010* ในปีงบฯ",
    caveat:
      "เพดาน: HDC มีประวัติตรวจตั้งแต่ปีงบฯ 2569 เท่านั้น คนที่เคยตรวจก่อนหน้ายังนับเป็นเป้า",
  },
  ANTI_HCV: {
    condition:
      "เป้า: คนไทยในเขตที่เกิดก่อน พ.ศ. 2535 ไม่เคยตรวจ Anti-HCV และไม่มีไวรัสตับอักเสบซีก่อนวันตรวจ · ทำแล้ว: มีผล Anti-HCV (LABFU) หรือรหัส SPECIALPP 1B011* ในปีงบฯ",
    caveat:
      "เพดาน: HDC มีประวัติตรวจตั้งแต่ปีงบฯ 2569 เท่านั้น คนที่เคยตรวจก่อนหน้ายังนับเป็นเป้า",
  },
  FPG: {
    condition:
      "เป้า: คนไทยในเขตอายุ 35–59 ปี ไม่เป็นเบาหวานก่อนวันตรวจ และผลคัดกรอง NCD (ปีงบฯ นี้หรือปีก่อน) มีความเสี่ยง · ทำแล้ว: มีผล FPG จากหลอดเลือดดำ (LABFU 0531002 หรือ NCDSCREEN วิธีที่ 1) ในปีงบฯ",
    caveat:
      "กลุ่มเสี่ยง = ญาติสายตรงเป็นเบาหวาน หรือ BMI ≥ 25 หรือรอบเอว ≥ 90/80 ซม. หรือ BP ≥ 130/85 จากแฟ้ม NCDSCREEN · ไม่นับ DTX ปลายนิ้ว",
  },
  CBC_WOMEN: {
    condition:
      "เป้า: หญิงไทยในเขตอายุ 13–24 ปี ที่ไม่ตั้งครรภ์ในปีงบฯ (ไม่มี ANC/คลอด/ฝากครรภ์) · ทำแล้ว: มีผล Hb หรือ CBC (LABFU) ในปีงบฯ",
    caveat:
      "มีเพียงบางหน่วยที่ส่งผล Hb/CBC เข้าแฟ้ม LABFU ยอดทำแล้วจึงอาจต่ำกว่าจริง · ไม่นับ Hct อย่างเดียว",
  },
  ANC_VISIT: {
    condition:
      "เป้า: นัดฝากครรภ์ตามอายุครรภ์ 12, 20, 26, 30, 34, 36, 38, 40 สัปดาห์ที่ตกในปีงบฯ ของหญิงไทยในเขตที่มาฝากครรภ์ (ทุกหน่วย) · ทำแล้ว: วันที่มาฝากครรภ์ในปีงบฯ ไม่เกิน 8 ครั้งต่อครรภ์",
    caveat:
      "นับเฉพาะหญิงที่อยู่ในอำเภอ (หน้าโรงพยาบาลนับทุกคนที่มา รพ.) · LMP ประมาณจากอายุครรภ์ในแฟ้ม ANC · ข้อมูล ANC เดือน ส.ค.–ก.ย. ยังส่งไม่ครบ",
  },
  ANC_LAB1: {
    condition:
      "เป้า: ครรภ์ของหญิงไทยในเขตที่อายุครรภ์ 12 สัปดาห์ตกตั้งแต่ 1 ต.ค. และเริ่มตั้งครรภ์ก่อนสิ้นปีงบฯ · ทำแล้ว: มีผล VDRL/TPHA/HIV (LABFU) ในปีงบฯ ระหว่างตั้งครรภ์",
    caveat:
      "ใช้ผล VDRL/TPHA/HIV แทนชุด lab ANC ครั้งที่ 1 (หน้าโรงพยาบาลใช้ใบสั่ง LAB ANC)",
  },
};

/** PPFS items of the district page, in the hospital page's order. */
export const DISTRICT_PPFS_ITEMS: readonly DistrictPpItemDef[] =
  PPFS_PHASE1_ITEMS.map((item, i) => ({
    code: item.code,
    page: "ppfs",
    order: i + 1,
    name: item.name,
    group: item.group,
    condition: PPFS_HDC[item.code].condition,
    unit: UNIT_OF_RATE[item.unit] ?? "คน",
    basis: "nhso",
    rate: item.rate,
    rateUnit: item.unit,
    caveat: PPFS_HDC[item.code].caveat,
  }));

/* =========================== P&P Basic =================================== */


/** HDC-specific condition / caveat / display per P&P Basic item. */
const PPBASIC_HDC: Record<
  PpBasicCode,
  { name: string; group: string; condition: string; unit: string; caveat: string | null }
> = {
  CHILD_DEV: {
    name: "ตรวจพัฒนาการ (DSPM)",
    group: "เด็กอายุ 0-5 ปี",
    condition:
      "เป้า: เด็กไทยในเขตที่อายุครบ 9, 18, 30, 42 หรือ 60 เดือนในปีงบฯ · ทำแล้ว: มีรหัส SPECIALPP DSPM ตอนอายุนั้น (หน่วยใดก็ได้ในอำเภอ)",
    unit: "คน",
    caveat: null,
  },
  CHILD_GROWTH: {
    name: "ชั่งน้ำหนัก วัดส่วนสูง",
    group: "เด็กอายุ 0-12 ปี",
    condition:
      "เป้า: เด็กไทยในเขตอายุ 0-12 ปี ณ 1 ต.ค. รวมเด็กเกิดในปีงบฯ · ทำแล้ว: แฟ้ม NUTRITION มีทั้งน้ำหนักและส่วนสูงอย่างน้อย 1 ครั้งในปีงบฯ",
    unit: "คน",
    caveat: null,
  },
  EPI: {
    name: "ค่าบริการฉีดวัคซีน EPI",
    group: "แรกเกิด - ป.6",
    condition:
      "เป้า: เข็มที่ฉีดแล้ว + เข็มที่ถึงกำหนดตามตาราง EPI แต่ยังไม่ได้ (รายหมู่บ้าน) ของเด็กไทยสิทธิ UC ในเขต · ทำแล้ว: เข็ม EPI ที่หน่วยในอำเภอฉีดให้เด็กสิทธิ UC อายุไม่เกิน 14 ปี ในปีงบฯ",
    unit: "เข็ม",
    caveat:
      "ไม่นับเงิน HPV 9 สายพันธุ์ (HPVG91) เพราะยังไม่ยืนยันว่า สปสช. จ่าย (เด็กหญิง ป.5 ที่ได้แล้วไม่นับเป็นเข็มค้าง) · เงินจริงจ่ายให้หน่วยที่ฉีดและส่งเบิก ตารางนี้นับตามหมู่บ้านของเด็ก · ป.5/ป.6 คิดจากช่วงวันเกิด",
  },
  FLUORIDE: {
    name: "เคลือบฟลูออไรด์",
    group: "เด็กอายุ 4-12 ปี",
    condition:
      "เป้า: เด็กไทยในเขตอายุ 4-12 ปี ณ 1 ต.ค. · ทำแล้ว: หัตถการ 2377020/2387020 (PROCEDURE_OPD) อย่างน้อย 1 ครั้งในปีงบฯ",
    unit: "คน",
    caveat:
      "ไม่มีข้อมูลกลุ่มเสี่ยงฟันผุ จึงใช้เด็กทุกคนเป็นเป้า (สปสช. จ่ายเฉพาะกลุ่มเสี่ยง) · มูลค่าเป็นค่าอ้างอิง ไม่ใช่เงิน สปสช.",
  },
  SEALANT: {
    name: "เคลือบหลุมร่องฟัน",
    group: "เด็กอายุ 6-12 ปี",
    condition:
      "เป้า: เด็กไทยในเขตอายุ 6-12 ปี ณ 1 ต.ค. · ทำแล้ว: หัตถการ 238703x (PROCEDURE_OPD) อย่างน้อย 1 ซี่ในปีงบฯ",
    unit: "คน",
    caveat: "เป้าไม่ได้ตัดเด็กที่เคยเคลือบแล้วในปีก่อน (HDC มีประวัติไม่พอ)",
  },
  ELDERLY_DEPRESSION: {
    name: "คัดกรองซึมเศร้า",
    group: "ผู้สูงอายุ 60 ปีขึ้นไป",
    condition:
      "เป้า: ผู้สูงอายุไทยในเขตอายุ 60 ปีขึ้นไป ณ 1 ต.ค. · ทำแล้ว: รหัส SPECIALPP 1B0280/1B0281 (2Q ผู้สูงอายุ) ในปีงบฯ",
    unit: "คน",
    caveat:
      "นับเฉพาะรหัส SPECIALPP แบบ HDC (หน้าโรงพยาบาลนับแบบฟอร์ม 2Q ของ HOSxP ด้วย) หน่วยที่บันทึก 2Q แต่ไม่ส่งรหัสนี้จะได้ตัวเลขต่ำ",
  },
};

/** Display order of the P&P Basic items (= hospital /pp/basic). */
const PPBASIC_ORDER: readonly PpBasicCode[] = [
  "CHILD_DEV",
  "CHILD_GROWTH",
  "EPI",
  "FLUORIDE",
  "SEALANT",
  "ELDERLY_DEPRESSION",
];

/**
 * P&P Basic items of the district page; baht from ppbasic-rates.ts
 * (EPI "nhso" 20 baht per dose, FLUORIDE "reference", others "unset").
 * EPI_PERSONS is not shown (HDC lacks vaccine history before Oct 2025).
 * Definitions and FY2569 figures: docs/kpi/district-pp-basic.md.
 */
export const DISTRICT_PPBASIC_ITEMS: readonly DistrictPpItemDef[] =
  PPBASIC_ORDER.map((code, i) => {
    const r = PPBASIC_RATES[code];
    const d = PPBASIC_HDC[code];
    return {
      code,
      page: "basic",
      order: i + 1,
      name: d.name,
      group: d.group,
      condition: d.condition,
      unit: d.unit,
      basis: r.basis,
      rate: r.rate,
      rateUnit: r.rateUnit,
      caveat: d.caveat,
    };
  });

/** Every item of the page (PPFS first, then P&P Basic). */
export const DISTRICT_PP_ITEMS: readonly DistrictPpItemDef[] = [
  ...DISTRICT_PPFS_ITEMS,
  ...DISTRICT_PPBASIC_ITEMS,
];
