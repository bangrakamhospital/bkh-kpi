import type { PpfsItemDef } from "@/lib/kpi/ppfs-rates";

/**
 * "รายได้ สปสช. อื่นๆ" (/pp/other) — NHSO revenue items that are NOT part
 * of the PP Fee Schedule, shown on their own page with their own totals
 * (never mixed into the PPFS totals of /pp).
 * Rates: "แนวทางปฏิบัติในการขอรับค่าใช้จ่ายเพื่อบริการสาธารณสุข
 * ปีงบประมาณ 2569" (NHSO, 17 Oct 2025).
 * Definitions and FY2569 checks: docs/kpi/ppfs-revenue-feasibility.md (10.7).
 * SQL: ./sql/nhso-other-hosxp.ts, loader: ./nhso-other.ts.
 */

export const NHSO_OTHER_RATE_YEAR = 2569;

export type NhsoOtherItemCode = "TELEMED" | "PALLIATIVE_OPIOID";

const GROUP = "บริการอื่น (นอก PP)";

export const NHSO_OTHER_ITEMS: readonly PpfsItemDef<NhsoOtherItemCode>[] = [
  {
    code: "TELEMED",
    name: "บริการสาธารณสุขทางไกล (Telehealth) ผู้ป่วยโรคเรื้อรังรายเก่า",
    group: GROUP,
    rate: 50,
    unit: "ต่อครั้ง",
    condition:
      "ผู้ป่วยสิทธิ UC โรคเรื้อรังรายเก่า หน่วยบริการขึ้นทะเบียน H24 และยืนยันตัวตนผู้ป่วย",
    grade: "B",
    rateUnconfirmed: false,
    population: "service",
    ceiling: true,
    caveat:
      "เพดาน: เป้า = visit บริการทางไกล (ประเภทมา 05) ของผู้ป่วยสิทธิ UC ในปีงบฯ ที่มีแผนก ไม่ใช่ทุก visit เข้าเงื่อนไขโรคเรื้อรังรายเก่าและยืนยันตัวตน · ตัด visit ที่ไม่มีแผนก (ชุดส่งยา/ต่อยา ลงรหัส Z71.8 ราว 4,000 visit ต่อปี) และแผนก 014 ห้องการเงิน (งานเอกสารเป็นชุด ไม่มียา) · ผู้ป่วยคลินิก HIV อาจเบิกผ่านกองทุน HIV/AIDS แยก ต้องยืนยันกับงานประกัน · ทำแล้ว = visit ในเป้าที่ถูกคิดรายการ TELMED · คิดเงินแล้ว = visit สิทธิ UC ทั้งหมดที่ถูกคิด TELMED ในปีงบฯ (รวม visit ที่ไม่ได้ลงประเภทมา 05) · ยังไม่รวมค่าส่งยา (DRUGP 50 บาท)",
  },
  {
    code: "PALLIATIVE_OPIOID",
    name: "ค่ายา Strong opioid ผู้ป่วยระยะท้าย (Palliative care)",
    group: GROUP,
    rate: 750,
    unit: "ต่อคน-เดือน",
    condition:
      "ผู้ป่วยสิทธิ UC ระยะท้าย มะเร็ง C00–C96, D37–D48 ที่มีรหัส Z51.5 หน่วยบริการต้องมียาครบ 3 กลุ่ม",
    grade: "C",
    rateUnconfirmed: false,
    population: "service",
    ceiling: false,
    caveat:
      "ประมาณการ ไม่มีข้อมูลกลุ่มเป้าหมาย ทำแล้ว = จำนวนคน-เดือนที่ผู้ป่วยไทยซึ่งเคยลง Z51.5 และเคยวินิจฉัยมะเร็งตามช่วงข้างต้น (ผู้ป่วยนอกหรือใน ภายในสิ้นปีงบฯ จึงนับเดือนก่อนลง Z51.5 ครั้งแรกด้วย) ได้ morphine ชนิดกิน (MST, Kapanol, IR, น้ำ) หรือ fentanyl แปะ ที่ OPD ในปีงบฯ ไม่นับ morphine ฉีด · ไม่ได้กรองสิทธิ · ต้องลงทะเบียน palliative และลงรหัส Z51.5 + Z71.8 จึงเบิกได้ · ไม่รวมค่าเยี่ยมบ้าน 1,000 บาทต่อเดือน และ 3,000 บาทเมื่อเสียชีวิต · ไม่มียอดคิดเงิน (รายการ ADP M00xx ใน HOSxP ราคา 0 บาท) · HOSxP ผูก ADP ผิด 2 รายการ: morphine IR 1460028 ผูก M0001 (ควร M0012) และ morphine น้ำ 1560001 ผูก M0007 (ควร M0010/M0011) ควรแจ้งงานเภสัชกรรม",
  },
];
