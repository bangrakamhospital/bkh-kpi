import type { ScreeningCode } from "@/lib/kpi/types";
import { INDICATOR_CATEGORY, type CategoryId } from "@/lib/kpi/categories";
import type { AccentKey } from "./indicator-theme";

export interface IndicatorRowConfig {
  no: number;
  /** ชื่อหลัก (บรรทัดรองมาจากข้อมูลของ indicator) */
  title: string;
  /** กลุ่มเป้าหมาย + อายุ แบบสั้น (บรรทัดรอง) */
  subtitle: string;
  /** คำพ้อง/คำค้นเพิ่มเติม */
  keywords: string[];
  accent: AccentKey;
  /** หมวดตัวชี้วัด (ต้องระบุ แม้ยังไม่มี code) */
  categoryId: CategoryId;
  /** undefined = ยังไม่มีข้อมูล/นิยาม */
  code?: ScreeningCode;
}

/** เพิ่มตัวชี้วัดใหม่ที่นี่ (ไม่ใส่ code = แสดงเป็นรอกำหนดนิยาม) */
export const INDICATOR_ROWS: IndicatorRowConfig[] = [
  { no: 1, code: "DM", categoryId: INDICATOR_CATEGORY.DM, accent: "dm", title: "คัดกรองเบาหวาน", subtitle: "ประชาชนอายุ 35 ปีขึ้นไป", keywords: ["เบาหวาน","DM","diabetes"] },
  { no: 2, code: "HT", categoryId: INDICATOR_CATEGORY.HT, accent: "ht", title: "คัดกรองความดันโลหิตสูง", subtitle: "ประชาชนอายุ 35 ปีขึ้นไป", keywords: ["ความดัน","HT","ความดันโลหิตสูง"] },
  { no: 3, code: "CX", categoryId: INDICATOR_CATEGORY.CX, accent: "cervix", title: "คัดกรองมะเร็งปากมดลูก", subtitle: "หญิงไทย 30–60 ปี", keywords: ["ปากมดลูก","HPV","Pap","มะเร็ง","CA cervix"] },
  { no: 4, code: "BR", categoryId: INDICATOR_CATEGORY.BR, accent: "breast", title: "คัดกรองมะเร็งเต้านม", subtitle: "หญิง 40–70 ปี", keywords: ["เต้านม","CBE","มะเร็ง","breast"] },
  { no: 5, code: "DMC", categoryId: INDICATOR_CATEGORY.DMC, accent: "confirmDm", title: "ยืนยันวินิจฉัยกลุ่มสงสัยป่วยเบาหวาน", subtitle: "ประชาชนไทยอายุ 35 ปีขึ้นไป กลุ่มสงสัยป่วย", keywords: ["เบาหวาน","ยืนยัน","สงสัยป่วย","FPG","DM","HDC","diabetes"] },
  { no: 6, code: "HTC", categoryId: INDICATOR_CATEGORY.HTC, accent: "confirmHt", title: "ยืนยันวินิจฉัยกลุ่มสงสัยป่วยความดันโลหิตสูง", subtitle: "ประชาชนไทยอายุ 35 ปีขึ้นไป กลุ่มสงสัยป่วย", keywords: ["ความดัน","ความดันโลหิตสูง","ยืนยัน","สงสัยป่วย","OBPM","HT","HDC"] },
  { no: 7, code: "RLU_HBA1C", categoryId: INDICATOR_CATEGORY.RLU_HBA1C, accent: "hba1c", title: "ผู้ป่วยเบาหวานได้รับการตรวจ HbA1c", subtitle: "ผู้ป่วยในทะเบียนคลินิกเบาหวาน", keywords: ["HbA1c","เบาหวาน","lab","RLU","HDC","diabetes"] },
  { no: 8, code: "RLU_LDL", categoryId: INDICATOR_CATEGORY.RLU_LDL, accent: "ldl", title: "ผู้ป่วยเบาหวานได้รับการตรวจ LDL", subtitle: "ผู้ป่วยในทะเบียนคลินิกเบาหวาน", keywords: ["LDL","ไขมัน","เบาหวาน","lab","RLU","HDC"] },
  { no: 9, code: "RLU_CR", categoryId: INDICATOR_CATEGORY.RLU_CR, accent: "creatinine", title: "ผู้ป่วยเบาหวานได้รับการตรวจ Creatinine", subtitle: "ผู้ป่วยในทะเบียนคลินิกเบาหวาน", keywords: ["Creatinine","ครีเอตินีน","ไต","เบาหวาน","lab","RLU","HDC"] },
  { no: 10, code: "CKD5", categoryId: INDICATOR_CATEGORY.CKD5, accent: "ckd5", title: "ผู้ป่วยไตเรื้อรัง stage 5 รายใหม่ ลดลงจากปีก่อน", subtitle: "ผู้มารับบริการที่ รพ. (ระดับโรงพยาบาล)", keywords: ["ไต","CKD","eGFR","stage 5","ไตเรื้อรัง","NCD"] },
  { no: 11, code: "STEMI", categoryId: INDICATOR_CATEGORY.STEMI, accent: "stemi", title: "อัตราตายผู้ป่วยโรคกล้ามเนื้อหัวใจตายเฉียบพลัน STEMI", subtitle: "ผู้ป่วย STEMI ที่มารับบริการที่ รพ. (ระดับโรงพยาบาล)", keywords: ["STEMI","หัวใจ","MI","กล้ามเนื้อหัวใจตาย","อัตราตาย","ACS","mortality"] },
];
