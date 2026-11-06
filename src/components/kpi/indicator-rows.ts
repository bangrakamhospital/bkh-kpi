import type { ScreeningCode } from "@/lib/kpi/types";
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
  /** undefined = ยังไม่มีข้อมูล/นิยาม */
  code?: ScreeningCode;
}

/** เพิ่มตัวชี้วัดใหม่ที่นี่ (ไม่ใส่ code = แสดงเป็นรอกำหนดนิยาม) */
export const INDICATOR_ROWS: IndicatorRowConfig[] = [
  { no: 1, code: "DM", accent: "dm", title: "คัดกรองเบาหวาน", subtitle: "ประชาชนอายุ 35 ปีขึ้นไป", keywords: ["เบาหวาน","DM","diabetes"] },
  { no: 2, code: "HT", accent: "ht", title: "คัดกรองความดันโลหิตสูง", subtitle: "ประชาชนอายุ 35 ปีขึ้นไป", keywords: ["ความดัน","HT","ความดันโลหิตสูง"] },
  { no: 3, code: "CX", accent: "cervix", title: "คัดกรองมะเร็งปากมดลูก", subtitle: "หญิงไทย 30–60 ปี", keywords: ["ปากมดลูก","HPV","Pap","มะเร็ง","CA cervix"] },
  { no: 4, code: "BR", accent: "breast", title: "คัดกรองมะเร็งเต้านม", subtitle: "หญิง 40–70 ปี", keywords: ["เต้านม","CBE","มะเร็ง","breast"] },
  { no: 5, code: "DMC", accent: "confirmDm", title: "ยืนยันวินิจฉัยกลุ่มสงสัยป่วยเบาหวาน", subtitle: "ประชาชนไทยอายุ 35 ปีขึ้นไป กลุ่มสงสัยป่วย", keywords: ["เบาหวาน","ยืนยัน","สงสัยป่วย","FPG","DM","HDC","diabetes"] },
  { no: 6, code: "HTC", accent: "confirmHt", title: "ยืนยันวินิจฉัยกลุ่มสงสัยป่วยความดันโลหิตสูง", subtitle: "ประชาชนไทยอายุ 35 ปีขึ้นไป กลุ่มสงสัยป่วย", keywords: ["ความดัน","ความดันโลหิตสูง","ยืนยัน","สงสัยป่วย","OBPM","HT","HDC"] },
  { no: 7, code: "RLU_HBA1C", accent: "hba1c", title: "ผู้ป่วยเบาหวานได้รับการตรวจ HbA1c", subtitle: "ผู้ป่วยในทะเบียนคลินิกเบาหวาน", keywords: ["HbA1c","เบาหวาน","lab","RLU","HDC","diabetes"] },
  { no: 8, code: "RLU_LDL", accent: "ldl", title: "ผู้ป่วยเบาหวานได้รับการตรวจ LDL", subtitle: "ผู้ป่วยในทะเบียนคลินิกเบาหวาน", keywords: ["LDL","ไขมัน","เบาหวาน","lab","RLU","HDC"] },
  { no: 9, code: "RLU_CR", accent: "creatinine", title: "ผู้ป่วยเบาหวานได้รับการตรวจ Creatinine", subtitle: "ผู้ป่วยในทะเบียนคลินิกเบาหวาน", keywords: ["Creatinine","ครีเอตินีน","ไต","เบาหวาน","lab","RLU","HDC"] },
  { no: 10, code: "CKD5", accent: "ckd5", title: "ผู้ป่วยไตเรื้อรัง stage 5 รายใหม่ ลดลงจากปีก่อน", subtitle: "ผู้มารับบริการที่ รพ. (ระดับโรงพยาบาล)", keywords: ["ไต","CKD","eGFR","stage 5","ไตเรื้อรัง","NCD"] },
];
