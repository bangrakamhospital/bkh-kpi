import type { F43Group, F43Scope, F43Severity } from "@/lib/kpi/f43-types";

/**
 * Files and checks of "ตรวจ 43 แฟ้ม" (/f43): HDC 52 files (v2.4.1) in
 * structure order, then FDH OP. Field sources follow the HDC 52-file reference SQL (v2.4.1, kept outside the repo)
 * (verified against the real HOSxP schema with db-cli).
 * Check ids match the SQL columns c_<id> of ./sql/f43-hosxp.ts.
 * Severity: "error" = ฟิลด์บังคับว่าง / รหัสไม่อยู่ในตารางมาตรฐาน / ขาดความ
 * สัมพันธ์ข้ามแฟ้ม / ข้อมูลขัดกันชัดเจน (HDC reject or error report);
 * "warn" = ควรแก้ (ความสมเหตุสมผล, ฟิลด์ที่ HDC ใช้คำนวณตัวชี้วัด).
 * HOSxP screen names in `fix` are the usual menu names; they may differ
 * slightly between HOSxP versions.
 */

export interface F43CheckDef {
  id: string;
  /** SQL column c_<sqlId> when the check reuses another check's column (FDH group). */
  sqlId?: string;
  label: string;
  severity: F43Severity;
  what: string;
  fix: string;
}

export interface F43FileDef {
  /** Unique key, also the ?file= value (FDH files are "FDH-<name>"). */
  code: string;
  /** File name shown in the sidebar (defaults to code). */
  label?: string;
  group: F43Group;
  name: string;
  /** Query key in F43_QUERIES; absent = unsupported. */
  query?: string;
  scope?: F43Scope;
  unitLabel?: string;
  /** Scope / source note, or the reason when unsupported. */
  note?: string;
  checks?: F43CheckDef[];
}

const E: F43Severity = "error";
const W: F43Severity = "warn";

const FIX_PATIENT = "ทะเบียนผู้ป่วย (Patient Registration) > แก้ไขข้อมูลผู้ป่วย";
const FIX_PERSON = "ระบบงานเชิงรุก > ข้อมูลประชากร/บุคคล (Person) ของผู้ป่วยรายนั้น";
const FIX_VISIT = "หน้าส่งตรวจ / OPD Registry > แก้ไข visit";
const FIX_DX = "ห้องตรวจแพทย์ (Doctor Workbench) > วินิจฉัย หรือหน้าลงรหัสโรค (เวชระเบียน)";
const FIX_PROVIDER_SETUP = "ตั้งค่าระบบ > ผู้ให้บริการ/แพทย์ (Doctor) — ผู้ดูแลระบบ";
const FIX_PTTYPE_SETUP = "ตั้งค่าระบบ > สิทธิการรักษา (pttype) > รหัสมาตรฐาน INSTYPE — ผู้ดูแลระบบ";
const FIX_SCREEN = "หน้าซักประวัติ/คัดกรอง (OPD Screen) > อาการสำคัญ และสัญญาณชีพ";
const FIX_REFER = "ระบบส่งต่อ (Refer) > ส่งต่อผู้ป่วย (Refer out)";
const FIX_IPD = "ระบบผู้ป่วยใน (IPD) > จำหน่าย / สรุปเวชระเบียน (Summary)";

const HDC_FILES: readonly Omit<F43FileDef, "group">[] = [
  {
    code: "PERSON",
    name: "ข้อมูลบุคคล",
    query: "person",
    scope: "unit-distinct",
    unitLabel: "คน",
    note: "ผู้ที่มารับบริการ OPD ในช่วงวันที่ (ไม่ซ้ำคน) ข้อมูลจาก patient + person ที่เชื่อม HN",
    checks: [
      { id: "person_no_person", label: "HN ไม่มีแฟ้มบุคคล (person)", severity: E, what: "ผู้มารับบริการต้องมีในแฟ้ม PERSON — HN นี้ไม่มีข้อมูลบุคคลเชื่อม", fix: `${FIX_PERSON} — สร้าง/เชื่อมบุคคลกับ HN` },
      { id: "person_cid_format", label: "เลขบัตรประชาชนว่าง/ไม่ครบ 13 หลัก", severity: E, what: "CID ต้องเป็นตัวเลข 13 หลัก (ต่างด้าวใช้เลขที่ออกให้ 13 หลัก)", fix: FIX_PATIENT },
      { id: "person_cid_checksum", label: "เลขบัตรประชาชนผิด (หลักตรวจสอบไม่ถูก)", severity: E, what: "หลักที่ 13 ไม่ตรงสูตร mod 11 แปลว่าพิมพ์เลขผิด", fix: `${FIX_PATIENT} — ตรวจกับบัตรจริง` },
      { id: "person_cid_dup", label: "เลขบัตรประชาชนซ้ำกับ HN อื่น", severity: E, what: "CID เดียวกันมีหลาย HN ทำให้ HDC รวมคนผิด", fix: "เวชระเบียน > รวม HN (Merge) หรือแก้ CID ของ HN ที่ผิด" },
      { id: "person_cid_mismatch", label: "CID ใน patient กับ person ไม่ตรงกัน", severity: E, what: "เลขบัตรในทะเบียนผู้ป่วยกับแฟ้มบุคคลไม่เท่ากัน", fix: `${FIX_PATIENT} และ ${FIX_PERSON} ให้ตรงกัน` },
      { id: "person_birth", label: "วันเกิดว่าง/ผิด", severity: E, what: "วันเกิดว่าง ก่อนปี 1900 หรือเป็นวันในอนาคต", fix: FIX_PATIENT },
      { id: "person_sex", label: "เพศว่าง/ไม่ใช่ 1, 2", severity: E, what: "เพศต้องเป็น 1 ชาย หรือ 2 หญิง", fix: FIX_PATIENT },
      { id: "person_nation", label: "สัญชาติว่าง/ไม่อยู่ในตารางมาตรฐาน", severity: E, what: "รหัสสัญชาติต้องมีในตาราง nationality", fix: FIX_PATIENT },
      { id: "person_typearea", label: "ประเภทที่อยู่ (TYPEAREA) ว่าง/ผิด", severity: E, what: "TYPEAREA ต้องเป็น 1–5 (1,3 = ในเขตรับผิดชอบ, 4 = นอกเขตมารับบริการ)", fix: `${FIX_PERSON} > สถานะการอยู่อาศัย` },
      { id: "person_multi_person", label: "HN เชื่อมกับบุคคลมากกว่า 1 คน", severity: W, what: "มี person หลายรายการชี้ HN เดียวกัน อาจส่งข้อมูลซ้ำ", fix: `${FIX_PERSON} — ยกเลิกการเชื่อมรายการที่ซ้ำ` },
      { id: "person_birth_mismatch", label: "วันเกิดใน patient กับ person ไม่ตรงกัน", severity: W, what: "วันเกิดสองที่ไม่เท่ากัน ทำให้อายุคำนวณผิด", fix: `${FIX_PATIENT} และ ${FIX_PERSON}` },
      { id: "person_village", label: "อยู่ในเขต (TYPEAREA 1/3) แต่ไม่ระบุหมู่บ้าน", severity: W, what: "คนในเขตรับผิดชอบต้องมีบ้าน/หมู่บ้าน เพื่อใช้คิดตัวชี้วัดรายหมู่", fix: `${FIX_PERSON} > ย้ายเข้าบ้าน/หมู่บ้าน` },
      { id: "person_occupation", label: "อาชีพว่าง", severity: W, what: "ฟิลด์ OCCUPATION ของแฟ้ม PERSON", fix: FIX_PATIENT },
      { id: "person_education", label: "การศึกษาว่าง", severity: W, what: "ฟิลด์ EDUCATION ของแฟ้ม PERSON", fix: FIX_PERSON },
      { id: "person_marry", label: "สถานะสมรสว่าง", severity: W, what: "ฟิลด์ MSTATUS ของแฟ้ม PERSON", fix: FIX_PATIENT },
      { id: "person_religion", label: "ศาสนาว่าง", severity: W, what: "ฟิลด์ RELIGION ของแฟ้ม PERSON", fix: FIX_PATIENT },
      { id: "person_pname", label: "คำนำหน้าว่าง", severity: W, what: "ฟิลด์ PRENAME ของแฟ้ม PERSON", fix: FIX_PATIENT },
      { id: "person_death_date", label: "สถานะเสียชีวิตแต่ไม่มีวันที่เสียชีวิต", severity: W, what: "patient.death = Y แต่ไม่ลงวันเสียชีวิต", fix: `${FIX_PATIENT} > ข้อมูลการเสียชีวิต` },
    ],
  },
  {
    code: "ADDRESS",
    name: "ที่อยู่",
    query: "person",
    scope: "unit-distinct",
    unitLabel: "คน",
    note: "ตรวจจากผู้มารับบริการชุดเดียวกับ PERSON (ที่อยู่ตามทะเบียนผู้ป่วย)",
    checks: [
      { id: "address_out_area", label: "นอกเขต (TYPEAREA 3/4) ที่อยู่ไม่ครบ ตำบล/อำเภอ/จังหวัด", severity: E, what: "คนนอกเขตต้องส่งแฟ้ม ADDRESS ที่มีตำบล อำเภอ จังหวัด", fix: `${FIX_PATIENT} > ที่อยู่` },
      { id: "address_changwat", label: "ไม่ระบุจังหวัด", severity: W, what: "ที่อยู่ไม่มีรหัสจังหวัด", fix: `${FIX_PATIENT} > ที่อยู่` },
    ],
  },
  {
    code: "DEATH",
    name: "การเสียชีวิต",
    query: "death",
    scope: "hospital",
    unitLabel: "ราย",
    note: "ผู้เสียชีวิตที่วันเสียชีวิตอยู่ในช่วงวันที่ (ตาราง death)",
    checks: [
      { id: "death_cause", label: "ไม่ระบุสาเหตุการตาย", severity: E, what: "CDEATH (ICD-10 สาเหตุการตาย) ว่าง", fix: "เวชระเบียน > บันทึกการเสียชีวิต > สาเหตุการตาย" },
      { id: "death_future", label: "วันเสียชีวิตเป็นวันในอนาคต", severity: E, what: "วันที่เสียชีวิตเกินวันนี้", fix: "เวชระเบียน > บันทึกการเสียชีวิต" },
      { id: "death_patient", label: "ทะเบียนผู้ป่วยยังไม่เป็นสถานะเสียชีวิต", severity: W, what: "มีบันทึกการตายแต่ patient.death ไม่เป็น Y", fix: `${FIX_PATIENT} > สถานะเสียชีวิต` },
      { id: "death_place", label: "ไม่ระบุสถานที่ตาย", severity: W, what: "PDEATH (สถานที่ตาย) ว่าง", fix: "เวชระเบียน > บันทึกการเสียชีวิต" },
    ],
  },
  {
    code: "CHRONIC",
    name: "โรคเรื้อรัง",
    query: "chronic",
    scope: "hospital",
    unitLabel: "ทะเบียน",
    note: "ทะเบียนคลินิกโรคเรื้อรัง (clinic.chronic = Y) ของผู้ที่มารับบริการในช่วงวันที่",
    checks: [
      { id: "chr_dxdate", label: "ไม่มีวันที่วินิจฉัย", severity: E, what: "DATE_DIAG ว่าง (ไม่มีทั้งวันวินิจฉัยและวันลงทะเบียน)", fix: "คลินิกพิเศษ > ทะเบียนผู้ป่วยคลินิก > วันที่วินิจฉัย" },
      { id: "chr_dxdate_future", label: "วันที่วินิจฉัยเป็นวันในอนาคต", severity: E, what: "DATE_DIAG เกินวันนี้", fix: "คลินิกพิเศษ > ทะเบียนผู้ป่วยคลินิก" },
      { id: "chr_status", label: "ไม่ระบุสถานะผู้ป่วยในคลินิก", severity: E, what: "TYPEDISCH (สถานะ) ว่าง", fix: "คลินิกพิเศษ > ทะเบียนผู้ป่วยคลินิก > สถานะ" },
      { id: "chr_icd", label: "ไม่ระบุรหัสโรค (ICD-10) ของสมาชิก", severity: W, what: "ทะเบียนไม่มีรายการ ICD-10 ของผู้ป่วย (HOSxP อาจใช้รหัสของคลินิกแทน)", fix: "คลินิกพิเศษ > ทะเบียนผู้ป่วยคลินิก > ICD-10" },
    ],
  },
  { code: "CARD", name: "สิทธิการรักษา", note: "ยังไม่รองรับ — HOSxP ส่งจากสิทธิในแฟ้มบุคคล ตรวจการ map สิทธิแทนในแฟ้ม SERVICE (INSTYPE)" },
  { code: "HOME", name: "ข้อมูลบ้าน", note: "ยังไม่รองรับ — เป็นข้อมูลทะเบียนบ้านทั้งเขต ไม่ใช่ข้อมูลรายเดือนของการให้บริการ" },
  { code: "VILLAGE", name: "ข้อมูลหมู่บ้าน", note: "ยังไม่รองรับ — ข้อมูลทะเบียนหมู่บ้าน (ตั้งค่าครั้งเดียว)" },
  { code: "DISABILITY", name: "ความพิการ", note: "ยังไม่รองรับ — ทะเบียนผู้พิการ (person_deformed) ไม่มีรอบรายเดือน" },
  {
    code: "ICF",
    name: "ความบกพร่อง (ICF)",
    query: "icf",
    scope: "unit",
    unitLabel: "รายการ",
    note: "การประเมิน ICF (ovst_icf) ใน visit ของช่วงวันที่",
    checks: [
      { id: "icf_code", label: "ไม่ระบุรหัส ICF", severity: E, what: "ICF ว่าง", fix: "หน้าบันทึกการประเมิน ICF" },
      { id: "icf_level", label: "ไม่ระบุระดับความบกพร่อง (QUALIFIER)", severity: E, what: "QUALIFIER ว่าง", fix: "หน้าบันทึกการประเมิน ICF" },
      { id: "icf_provider", label: "ไม่ระบุผู้ประเมิน", severity: E, what: "PROVIDER ว่างหรือไม่มีในแฟ้ม PROVIDER", fix: "หน้าบันทึกการประเมิน ICF" },
    ],
  },
  {
    code: "DRUGALLERGY",
    name: "ประวัติแพ้ยา",
    query: "drugallergy",
    scope: "unit",
    unitLabel: "รายการ",
    note: "บันทึกแพ้ยาที่รายงานในช่วงวันที่ หน่วยบริการ = จุดที่บันทึก",
    checks: [
      { id: "alg_code24", label: "ยาที่แพ้ไม่มีรหัสยา 24 หลัก", severity: E, what: "DRUGALLERGY ต้องเป็นรหัสยามาตรฐาน 24 หลัก", fix: "ข้อมูลผู้ป่วย > ประวัติแพ้ยา > เลือกยาจากรายการ (มีรหัส 24 หลัก)" },
      { id: "alg_level", label: "ไม่ระบุระดับความรุนแรง", severity: E, what: "ALEVEL ว่าง", fix: "ข้อมูลผู้ป่วย > ประวัติแพ้ยา > ความรุนแรง" },
      { id: "alg_type", label: "ไม่ระบุประเภทการแพ้", severity: E, what: "TYPEDX ว่าง", fix: "ข้อมูลผู้ป่วย > ประวัติแพ้ยา > ประเภท" },
      { id: "alg_informant", label: "ไม่ระบุผู้ให้ประวัติ/ความสัมพันธ์", severity: W, what: "INFORMANT ว่าง", fix: "ข้อมูลผู้ป่วย > ประวัติแพ้ยา" },
    ],
  },
  {
    code: "FUNCTIONAL",
    name: "ความสามารถในการประกอบกิจวัตร",
    query: "functional",
    scope: "unit",
    unitLabel: "รายการ",
    note: "การประเมินความสามารถ (ovst_functional) เช่น ADL ใน visit ของช่วงวันที่",
    checks: [
      { id: "func_type", label: "ไม่ระบุวิธีประเมิน", severity: E, what: "FUNCTIONAL_TEST ว่าง", fix: "หน้าบันทึกการประเมินความสามารถ (ADL)" },
      { id: "func_dependent", label: "ไม่ระบุภาวะพึ่งพิง", severity: E, what: "DEPENDENT ว่าง", fix: "หน้าบันทึกการประเมินความสามารถ (ADL)" },
      { id: "func_provider", label: "ไม่ระบุผู้ประเมิน", severity: E, what: "PROVIDER ว่างหรือไม่มีในแฟ้ม PROVIDER", fix: "หน้าบันทึกการประเมินความสามารถ (ADL)" },
      { id: "func_score", label: "ไม่ลงคะแนน", severity: W, what: "TESTRESULT ว่าง", fix: "หน้าบันทึกการประเมินความสามารถ (ADL)" },
    ],
  },
  {
    code: "SERVICE",
    name: "การให้บริการ",
    query: "service",
    scope: "unit",
    unitLabel: "visit",
    note: "visit OPD ในช่วงวันที่ (ovst) ผู้บันทึก = ผู้ลงทะเบียนส่งตรวจ",
    checks: [
      { id: "svc_no_dx", label: "visit ไม่มีการวินิจฉัย", severity: E, what: "ทุก SERVICE ต้องมี DIAGNOSIS_OPD อย่างน้อย 1 รายการ", fix: FIX_DX },
      { id: "svc_no_pdx", label: "ไม่มีการวินิจฉัยหลัก (Principal Dx)", severity: E, what: "มีรหัสโรคแต่ไม่มีรายการประเภท 1 (โรคหลัก)", fix: `${FIX_DX} — ตั้งรหัสหนึ่งเป็นโรคหลัก` },
      { id: "svc_multi_pdx", label: "มีโรคหลักมากกว่า 1 รหัส", severity: E, what: "ต่อ visit ต้องมีโรคหลัก (ประเภท 1) เพียงรหัสเดียว", fix: `${FIX_DX} — เปลี่ยนรหัสอื่นเป็นโรคร่วม (2)` },
      { id: "svc_person", label: "ไม่มีข้อมูลผู้ป่วย (PERSON)", severity: E, what: "HN ของ visit ไม่มีในทะเบียนผู้ป่วย", fix: FIX_PATIENT },
      { id: "svc_pttype", label: "สิทธิการรักษาว่าง/ไม่มีในระบบ", severity: E, what: "INSTYPE ของ visit ต้องมี", fix: `${FIX_VISIT} > สิทธิ` },
      { id: "svc_instype", label: "สิทธิไม่ได้ map รหัสมาตรฐาน (INSTYPE)", severity: E, what: "สิทธิที่ใช้ไม่มีรหัส 4 หลักของ สนย. หรือรหัสไม่อยู่ในตารางมาตรฐาน", fix: FIX_PTTYPE_SETUP },
      { id: "svc_doctor", label: "ไม่ระบุผู้ให้บริการของ visit", severity: W, what: "แพทย์/ผู้ตรวจของ visit ว่างหรือไม่มีในตาราง PROVIDER", fix: `${FIX_VISIT} > แพทย์ผู้ตรวจ` },
      { id: "svc_hospmain", label: "สิทธิ UC ไม่ระบุหน่วยบริการหลัก", severity: W, what: "visit สิทธิบัตรทองไม่มี hospmain (MAIN) ทำให้ HDC คิดเขตผิด", fix: `${FIX_VISIT} > สิทธิ > ตรวจสอบสิทธิ สปสช.` },
      { id: "svc_typein", label: "ไม่ระบุประเภทการมารับบริการ", severity: W, what: "TYPEIN (มาเอง/ส่งต่อ/นัด) ว่าง", fix: `${FIX_VISIT} > ประเภทการมา` },
      { id: "svc_typeout", label: "ไม่ระบุสถานะการจำหน่าย", severity: W, what: "TYPEOUT (กลับบ้าน/admit/ส่งต่อ) ว่าง", fix: `${FIX_VISIT} หรือห้องตรวจ > จำหน่ายผู้ป่วย` },
      { id: "opd_no_screen", label: "ไม่มีการซักประวัติ (opdscreen)", severity: W, what: "visit ไม่มีหน้าซักประวัติ จึงไม่มีอาการสำคัญและสัญญาณชีพ", fix: FIX_SCREEN },
      { id: "opd_cc", label: "ไม่ลงอาการสำคัญ (CHIEFCOMP)", severity: W, what: "อาการสำคัญ (CC) ว่าง", fix: FIX_SCREEN },
      { id: "opd_bp", label: "ไม่ลงความดันโลหิต (SBP/DBP)", severity: W, what: "ความดันตัวบนหรือตัวล่างว่าง", fix: FIX_SCREEN },
      { id: "opd_temp", label: "ไม่ลงอุณหภูมิ (BTEMP)", severity: W, what: "อุณหภูมิร่างกายว่าง", fix: FIX_SCREEN },
      { id: "opd_pr", label: "ไม่ลงชีพจร (PR)", severity: W, what: "ชีพจรว่าง", fix: FIX_SCREEN },
      { id: "opd_rr", label: "ไม่ลงอัตราการหายใจ (RR)", severity: W, what: "อัตราการหายใจว่าง", fix: FIX_SCREEN },
    ],
  },
  {
    code: "DIAGNOSIS_OPD",
    name: "การวินิจฉัยโรคผู้ป่วยนอก",
    query: "dx_opd",
    scope: "unit",
    unitLabel: "รหัส",
    note: "รหัส ICD-10 ใน ovstdiag ของช่วงวันที่ (รหัสตัวเลขเป็นหัตถการ ตรวจในแฟ้ม PROCEDURE_OPD) ผู้บันทึก = ผู้ลงรหัส",
    checks: [
      { id: "dx_blank", label: "รหัสโรคว่าง", severity: E, what: "DIAGCODE ว่าง", fix: FIX_DX },
      { id: "dx_nomatch", label: "รหัสโรคไม่อยู่ในตาราง ICD-10", severity: E, what: "รหัสไม่มีในตาราง icd101 ของ HOSxP", fix: `${FIX_DX} — เลือกรหัสจากรายการ` },
      { id: "dx_type", label: "ประเภทการวินิจฉัยผิด", severity: E, what: "DIAGTYPE ต้องเป็น 1–7", fix: FIX_DX },
      { id: "dx_pdx_ext", label: "ใช้รหัสสาเหตุภายนอก (V–Y) เป็นโรคหลัก", severity: E, what: "รหัส V01–Y98 ใช้เป็นสาเหตุร่วม (ประเภท 5) เท่านั้น ห้ามเป็นโรคหลัก", fix: `${FIX_DX} — ใช้รหัสการบาดเจ็บ (S/T) เป็นโรคหลัก` },
      { id: "dx_ext_missing", label: "บาดเจ็บ (S/T) ไม่ลงรหัสสาเหตุภายนอก", severity: E, what: "โรคหลักเป็น S00–T98 ต้องมีรหัส V01–Y98 ใน visit เดียวกัน", fix: `${FIX_DX} — เพิ่มรหัสสาเหตุ (ประเภท 5)` },
      { id: "dx_provider", label: "ไม่ระบุแพทย์ผู้วินิจฉัย", severity: E, what: "PROVIDER ว่างหรือไม่มีในแฟ้ม PROVIDER", fix: `${FIX_DX} > แพทย์ผู้วินิจฉัย` },
      { id: "dx_sex", label: "รหัสโรคไม่ตรงกับเพศ", severity: E, what: "เช่น ชายได้รหัสตั้งครรภ์ (O) / โรคอวัยวะเพศหญิง หรือหญิงได้รหัสต่อมลูกหมาก", fix: `${FIX_DX} หรือแก้เพศใน ${FIX_PATIENT}` },
      { id: "dx_no_service", label: "การวินิจฉัยไม่มี visit (SERVICE)", severity: E, what: "รหัสโรคอ้าง visit ที่ไม่มีในระบบ", fix: "แจ้งผู้ดูแลระบบ HOSxP" },
      { id: "dx_not_specific", label: "รหัสไม่ละเอียดถึงหลักสุดท้าย", severity: W, what: "ใช้รหัสระดับหมวด ทั้งที่มีรหัสย่อย (เช่น F152 มี F1520–F1529)", fix: `${FIX_DX} — เลือกรหัสย่อย` },
      { id: "dx_inactive", label: "รหัสโรคถูกยกเลิกแล้ว", severity: W, what: "รหัสมีสถานะไม่ใช้งานในตาราง ICD-10", fix: FIX_DX },
      { id: "dx_age_preg", label: "รหัสตั้งครรภ์ (O) อายุไม่สมเหตุสมผล", severity: W, what: "อายุน้อยกว่า 10 ปี หรือมากกว่า 60 ปี", fix: `${FIX_DX} หรือแก้วันเกิด` },
      { id: "dx_age_perinatal", label: "รหัสปริกำเนิด (P) ในผู้ที่อายุ 1 ปีขึ้นไป", severity: W, what: "รหัส P00–P96 ใช้กับทารกแรกเกิด", fix: FIX_DX },
    ],
  },
  {
    code: "PROCEDURE_OPD",
    name: "การทำหัตถการผู้ป่วยนอก",
    query: "proc_opd",
    scope: "unit",
    unitLabel: "รายการ",
    note: "หัตถการจากหน้าวินิจฉัย (รหัสตัวเลขใน ovstdiag) และหัตถการ ER/ห้องหัตถการ (doctor_operation)",
    checks: [
      { id: "proc_nomap", label: "หัตถการไม่ได้ผูกรหัส ICD-9-CM", severity: E, what: "รายการหัตถการไม่มีรหัส PROCEDCODE (รหัส 0/ว่าง)", fix: "ตั้งค่า > รายการหัตถการ (ER oper code) > รหัส ICD-9-CM — ผู้ดูแลระบบ หรือเลือกรหัสตอนลงหัตถการ" },
      { id: "proc_nomatch", label: "รหัสหัตถการไม่อยู่ในตาราง ICD-9-CM", severity: E, what: "รหัสไม่มีในตาราง icd9cm1", fix: "หน้าลงหัตถการ — เลือกรหัสจากรายการ" },
      { id: "proc_provider", label: "ไม่ระบุผู้ทำหัตถการ", severity: E, what: "PROVIDER ว่างหรือไม่มีในแฟ้ม PROVIDER", fix: "หน้าลงหัตถการ (ER / ห้องหัตถการ) > ผู้ทำหัตถการ" },
      { id: "proc_no_service", label: "หัตถการไม่มี visit (SERVICE)", severity: E, what: "หัตถการอ้าง visit ที่ไม่มีในระบบ", fix: "แจ้งผู้ดูแลระบบ HOSxP" },
    ],
  },
  {
    code: "DRUG_OPD",
    name: "การจ่ายยาผู้ป่วยนอก",
    query: "drug_opd",
    scope: "unit",
    unitLabel: "รายการ",
    note: "รายการยา OPD ในช่วงวันที่ (opitemrece ที่เป็นยา) ผู้บันทึก = ผู้คีย์รายการ",
    checks: [
      { id: "drug_did", label: "ยาไม่มีรหัสมาตรฐาน 24 หลัก", severity: E, what: "DIDSTD ว่างหรือไม่ใช่ตัวเลข 24 หลัก", fix: "ระบบห้องยา > กำหนดรายการยา (Drug items) > รหัส 24 หลัก — เภสัชกร/ผู้ดูแลระบบ" },
      { id: "drug_provider", label: "ไม่ระบุผู้สั่งยา", severity: E, what: "PROVIDER ว่างหรือไม่มีในแฟ้ม PROVIDER", fix: "หน้าสั่งยา > แพทย์ผู้สั่ง" },
      { id: "drug_no_service", label: "รายการยาไม่มี visit (SERVICE)", severity: E, what: "ยาอ้าง visit ที่ไม่มีในระบบ", fix: "แจ้งผู้ดูแลระบบ HOSxP" },
      { id: "drug_unit", label: "ยาไม่ได้ map หน่วยนับมาตรฐาน", severity: W, what: "UNIT (หน่วยนับยา 43 แฟ้ม) ว่าง", fix: "ระบบห้องยา > กำหนดรายการยา > หน่วยมาตรฐาน" },
      { id: "drug_qty", label: "จำนวนยา 0 หรือติดลบ", severity: W, what: "AMOUNT ต้องมากกว่า 0 (มักเป็นรายการคืนยา)", fix: "หน้าสั่งยา/ห้องยา — ลบรายการที่ไม่ได้จ่ายจริง" },
      { id: "drug_price", label: "ไม่มีราคายา", severity: W, what: "DRUGPRICE ว่างหรือติดลบ", fix: "ระบบห้องยา > ราคายา" },
    ],
  },
  {
    code: "CHARGE_OPD",
    name: "ค่าบริการผู้ป่วยนอก",
    query: "charge_opd",
    scope: "unit",
    unitLabel: "รายการ",
    note: "ค่าใช้จ่ายทุกรายการของ visit OPD ในช่วงวันที่",
    checks: [
      { id: "chg_item", label: "รายการไม่ได้ map หมวดค่าบริการ (CHARGEITEM)", severity: E, what: "หมวดค่าใช้จ่าย (income) ว่างหรือไม่มีกลุ่มมาตรฐาน", fix: "ตั้งค่า > หมวดค่าใช้จ่าย (income) > กลุ่มมาตรฐาน — ผู้ดูแลระบบ" },
      { id: "chg_instype", label: "สิทธิของรายการไม่ได้ map INSTYPE", severity: E, what: "รายการถูกคิดในสิทธิที่ไม่มีรหัสมาตรฐาน", fix: FIX_PTTYPE_SETUP },
      { id: "chg_price", label: "ราคาว่างหรือติดลบ", severity: E, what: "PRICE ต้องไม่ว่างและไม่ติดลบ", fix: "การเงิน > แก้ไขรายการค่าใช้จ่าย" },
      { id: "chg_no_service", label: "ค่าบริการไม่มี visit (SERVICE)", severity: E, what: "รายการอ้าง visit ที่ไม่มีในระบบ", fix: "แจ้งผู้ดูแลระบบ HOSxP" },
    ],
  },
  {
    code: "SURVEILLANCE",
    name: "การเฝ้าระวังโรค (506)",
    query: "surveillance",
    scope: "unit",
    unitLabel: "ราย",
    note: "รายงาน 506 ที่วันรับบริการอยู่ในช่วงวันที่",
    checks: [
      { id: "surv_code506", label: "ไม่ระบุรหัสโรค 506", severity: E, what: "CODE506 ว่าง", fix: "งานระบาดวิทยา > รายงาน 506" },
      { id: "surv_pdx", label: "ไม่ระบุ ICD-10", severity: E, what: "DIAGCODE ของรายงาน 506 ว่าง", fix: "งานระบาดวิทยา > รายงาน 506" },
      { id: "surv_begin", label: "วันเริ่มป่วยว่าง/หลังวันรับบริการ", severity: E, what: "ILLDATE ต้องไม่ว่างและไม่หลังวันที่มารับบริการ", fix: "งานระบาดวิทยา > รายงาน 506 > วันเริ่มป่วย" },
      { id: "surv_ptstat", label: "ไม่ระบุสภาพผู้ป่วย", severity: E, what: "PTSTATUS ว่าง", fix: "งานระบาดวิทยา > รายงาน 506" },
      { id: "surv_area", label: "ที่อยู่ขณะป่วยไม่ครบ", severity: W, what: "ตำบล/อำเภอ/จังหวัดขณะป่วยว่าง", fix: "งานระบาดวิทยา > รายงาน 506 > ที่อยู่ขณะป่วย" },
    ],
  },
  {
    code: "ACCIDENT",
    name: "อุบัติเหตุ",
    query: "accident",
    scope: "unit",
    unitLabel: "visit",
    note: "visit ที่โรคหลักเป็นการบาดเจ็บ (S00–T98)",
    checks: [
      { id: "acc_datetime", label: "ไม่ระบุวันเวลาเกิดเหตุ", severity: E, what: "DATETIME_AE ว่าง", fix: "ห้องฉุกเฉิน (ER) > ข้อมูลอุบัติเหตุ > วันเวลาเกิดเหตุ" },
      { id: "acc_place", label: "ไม่ระบุสถานที่เกิดเหตุ", severity: E, what: "AEPLACE ว่าง", fix: "ห้องฉุกเฉิน (ER) > ข้อมูลอุบัติเหตุ" },
      { id: "acc_type", label: "ไม่ระบุประเภทอุบัติเหตุ", severity: E, what: "AETYPE ว่าง", fix: "ห้องฉุกเฉิน (ER) > ข้อมูลอุบัติเหตุ" },
      { id: "acc_no_record", label: "บาดเจ็บแต่ไม่มีบันทึกอุบัติเหตุ", severity: W, what: "โรคหลัก S/T แต่ไม่ได้บันทึกข้อมูลอุบัติเหตุ จึงไม่มีแฟ้ม ACCIDENT", fix: "ห้องฉุกเฉิน (ER) > ข้อมูลอุบัติเหตุ — บันทึกให้ครบทุกรายบาดเจ็บ" },
      { id: "acc_transport", label: "ไม่ระบุการนำส่ง/ยานพาหนะ", severity: W, what: "ข้อมูลการเดินทาง/ยานพาหนะว่าง", fix: "ห้องฉุกเฉิน (ER) > ข้อมูลอุบัติเหตุ" },
    ],
  },
  {
    code: "LABFU",
    name: "การตรวจทางห้องปฏิบัติการ",
    query: "labfu",
    scope: "unit",
    unitLabel: "รายการ",
    note: "รายการแลป OPD ที่ map รหัส 43 แฟ้ม (lab_items.provis_labcode) ผู้บันทึก = ผู้ลงผล",
    checks: [
      { id: "lab_result", label: "สั่งแลปแล้วไม่มีผล", severity: W, what: "LABRESULT ว่าง (ยังไม่ลงผล หรือยกเลิกไม่ได้ลบรายการ)", fix: "ระบบ LAB > ลงผล/ยืนยันผล หรือยกเลิกรายการที่ไม่ได้ตรวจ" },
    ],
  },
  {
    code: "CHRONICFU",
    name: "การติดตามโรคเรื้อรัง",
    query: "chronicfu",
    scope: "unit",
    unitLabel: "visit",
    note: "visit ของสมาชิกคลินิกโรคเรื้อรังที่โรคหลักเป็นเบาหวาน/ความดัน (E10–E14, I10–I15) ข้อมูลจากหน้าซักประวัติ",
    checks: [
      { id: "cfu_bp", label: "ไม่ลงความดันโลหิต", severity: E, what: "SBP/DBP ว่าง", fix: FIX_SCREEN },
      { id: "cfu_weight", label: "ไม่ลงน้ำหนัก", severity: E, what: "WEIGHT ว่าง", fix: FIX_SCREEN },
      { id: "cfu_no_screen", label: "ไม่มีการซักประวัติ", severity: E, what: "visit ไม่มีหน้าซักประวัติ จึงไม่มีข้อมูลติดตาม", fix: FIX_SCREEN },
      { id: "cfu_height", label: "ไม่ลงส่วนสูง", severity: W, what: "HEIGHT ว่าง", fix: FIX_SCREEN },
      { id: "cfu_waist", label: "ไม่ลงรอบเอว", severity: W, what: "WAIST_CM ว่าง", fix: FIX_SCREEN },
    ],
  },
  {
    code: "ADMISSION",
    name: "ผู้ป่วยใน",
    query: "admission",
    scope: "ipd",
    unitLabel: "AN",
    note: "ผู้ป่วยที่จำหน่าย (discharge) ในช่วงวันที่ — ส่งเมื่อจำหน่ายแล้ว",
    checks: [
      { id: "adm_no_pdx", label: "ไม่มีการวินิจฉัยหลัก", severity: E, what: "ADMISSION ต้องมี DIAGNOSIS_IPD ประเภท 1", fix: `${FIX_IPD} > ลงรหัสโรค` },
      { id: "adm_multi_pdx", label: "มีโรคหลักมากกว่า 1 รหัส", severity: E, what: "ต่อ AN ต้องมีโรคหลักรหัสเดียว", fix: `${FIX_IPD} > ลงรหัสโรค` },
      { id: "adm_dch_before", label: "วันจำหน่ายก่อนวัน admit", severity: E, what: "DATETIME_DISCH ต้องหลัง DATETIME_ADMIT", fix: `${FIX_IPD} > แก้วัน/เวลา` },
      { id: "adm_future", label: "วันจำหน่ายเป็นวันในอนาคต", severity: E, what: "วันจำหน่ายเกินวันนี้", fix: FIX_IPD },
      { id: "adm_dchstts", label: "ไม่ระบุสถานภาพการจำหน่าย", severity: E, what: "DISCHSTATUS ว่าง", fix: FIX_IPD },
      { id: "adm_dchtype", label: "ไม่ระบุวิธีการจำหน่าย", severity: E, what: "DISCHTYPE ว่าง", fix: FIX_IPD },
      { id: "adm_ward", label: "ไม่ระบุหอผู้ป่วย", severity: E, what: "WARDDISCH ว่าง", fix: FIX_IPD },
      { id: "adm_instype", label: "สิทธิไม่ได้ map INSTYPE", severity: E, what: "สิทธิของ AN ไม่มีรหัสมาตรฐาน", fix: FIX_PTTYPE_SETUP },
      { id: "adm_dchdoc", label: "ไม่ระบุแพทย์ผู้จำหน่าย", severity: E, what: "PROVIDER ว่างหรือไม่มีในแฟ้ม PROVIDER", fix: `${FIX_IPD} > แพทย์ผู้จำหน่าย` },
      { id: "adm_no_service", label: "AN ไม่มี visit ต้นทาง", severity: W, what: "ADMISSION อ้าง SEQ (vn) ที่ไม่มีในระบบ", fix: "แจ้งผู้ดูแลระบบ HOSxP" },
      { id: "adm_admdoc", label: "ไม่ระบุแพทย์ผู้รับ admit", severity: W, what: "แพทย์ admit ว่าง", fix: "ระบบผู้ป่วยใน > ข้อมูล admit" },
    ],
  },
  {
    code: "DIAGNOSIS_IPD",
    name: "การวินิจฉัยโรคผู้ป่วยใน",
    query: "dx_ipd",
    scope: "ipd",
    unitLabel: "รหัส",
    note: "รหัสโรคของ AN ที่จำหน่ายในช่วงวันที่",
    checks: [
      { id: "dxi_blank", label: "รหัสโรคว่าง", severity: E, what: "DIAGCODE ว่าง", fix: `${FIX_IPD} > ลงรหัสโรค` },
      { id: "dxi_nomatch", label: "รหัสโรคไม่อยู่ในตาราง ICD-10", severity: E, what: "รหัสไม่มีในตาราง icd101", fix: `${FIX_IPD} > ลงรหัสโรค` },
      { id: "dxi_type", label: "ประเภทการวินิจฉัยผิด", severity: E, what: "DIAGTYPE ต้องเป็น 1–7", fix: `${FIX_IPD} > ลงรหัสโรค` },
      { id: "dxi_pdx_ext", label: "ใช้รหัสสาเหตุภายนอก (V–Y) เป็นโรคหลัก", severity: E, what: "V01–Y98 ห้ามเป็นโรคหลัก", fix: `${FIX_IPD} > ลงรหัสโรค` },
      { id: "dxi_ext_missing", label: "บาดเจ็บ (S/T) ไม่ลงรหัสสาเหตุภายนอก", severity: E, what: "โรคหลัก S/T ต้องมีรหัส V01–Y98", fix: `${FIX_IPD} > ลงรหัสโรค` },
      { id: "dxi_provider", label: "ไม่ระบุแพทย์ผู้วินิจฉัย", severity: E, what: "PROVIDER ว่างหรือไม่มีในแฟ้ม PROVIDER", fix: `${FIX_IPD} > ลงรหัสโรค` },
      { id: "dxi_sex", label: "รหัสโรคไม่ตรงกับเพศ", severity: E, what: "รหัสเฉพาะเพศหญิง/ชายลงให้ผู้ป่วยต่างเพศ", fix: `${FIX_IPD} > ลงรหัสโรค` },
      { id: "dxi_not_specific", label: "รหัสไม่ละเอียดถึงหลักสุดท้าย", severity: W, what: "ใช้รหัสระดับหมวดทั้งที่มีรหัสย่อย", fix: `${FIX_IPD} > ลงรหัสโรค` },
    ],
  },
  {
    code: "PROCEDURE_IPD",
    name: "การทำหัตถการผู้ป่วยใน",
    query: "proc_ipd",
    scope: "ipd",
    unitLabel: "รายการ",
    note: "หัตถการ (iptoprt) ของ AN ที่จำหน่ายในช่วงวันที่",
    checks: [
      { id: "proci_blank", label: "ไม่มีรหัส ICD-9-CM", severity: E, what: "PROCEDCODE ว่าง", fix: `${FIX_IPD} > หัตถการ` },
      { id: "proci_nomatch", label: "รหัสไม่อยู่ในตาราง ICD-9-CM", severity: E, what: "รหัสไม่มีในตาราง icd9cm1", fix: `${FIX_IPD} > หัตถการ` },
      { id: "proci_provider", label: "ไม่ระบุผู้ทำหัตถการ", severity: E, what: "PROVIDER ว่างหรือไม่มีในแฟ้ม PROVIDER", fix: `${FIX_IPD} > หัตถการ` },
      { id: "proci_date", label: "วันทำหัตถการอยู่นอกช่วง admit", severity: E, what: "วันที่ว่าง หรือก่อน admit / หลังจำหน่าย", fix: `${FIX_IPD} > หัตถการ` },
    ],
  },
  {
    code: "DRUG_IPD",
    name: "การจ่ายยาผู้ป่วยใน",
    query: "drug_ipd",
    scope: "ipd",
    unitLabel: "รายการ",
    note: "รายการยาของ AN ที่จำหน่ายในช่วงวันที่",
    checks: [
      { id: "drugi_did", label: "ยาไม่มีรหัสมาตรฐาน 24 หลัก", severity: E, what: "DIDSTD ว่างหรือไม่ใช่ 24 หลัก", fix: "ระบบห้องยา > กำหนดรายการยา > รหัส 24 หลัก" },
      { id: "drugi_provider", label: "ไม่ระบุผู้สั่งยา", severity: E, what: "PROVIDER ว่างหรือไม่มีในแฟ้ม PROVIDER", fix: "ระบบผู้ป่วยใน > คำสั่งแพทย์" },
      { id: "drugi_unit", label: "ยาไม่ได้ map หน่วยนับมาตรฐาน", severity: W, what: "UNIT ว่าง", fix: "ระบบห้องยา > กำหนดรายการยา > หน่วยมาตรฐาน" },
      { id: "drugi_qty", label: "จำนวนยา 0 หรือติดลบ", severity: W, what: "มักเป็นรายการคืนยา", fix: "ห้องยา IPD — ตรวจรายการคืนยา" },
    ],
  },
  {
    code: "CHARGE_IPD",
    name: "ค่าบริการผู้ป่วยใน",
    query: "charge_ipd",
    scope: "ipd",
    unitLabel: "รายการ",
    note: "ค่าใช้จ่ายของ AN ที่จำหน่ายในช่วงวันที่",
    checks: [
      { id: "chgi_item", label: "รายการไม่ได้ map หมวดค่าบริการ", severity: E, what: "หมวดค่าใช้จ่ายว่างหรือไม่มีกลุ่มมาตรฐาน", fix: "ตั้งค่า > หมวดค่าใช้จ่าย (income) — ผู้ดูแลระบบ" },
      { id: "chgi_price", label: "ราคาว่างหรือติดลบ", severity: E, what: "PRICE ต้องไม่ว่างและไม่ติดลบ", fix: "การเงิน IPD > แก้ไขรายการ" },
    ],
  },
  {
    code: "APPOINTMENT",
    name: "การนัด",
    query: "appointment",
    scope: "unit",
    unitLabel: "นัด",
    note: "นัดที่ออกใน visit ของช่วงวันที่ ผู้บันทึก = ผู้ออกนัด",
    checks: [
      { id: "app_nextdate", label: "วันนัดว่าง/ก่อนวันที่ออกนัด", severity: E, what: "APDATE ต้องไม่ว่างและไม่ก่อนวันรับบริการ", fix: "หน้าจอนัดหมาย (Appointment) > วันนัด" },
      { id: "app_provider", label: "ไม่ระบุผู้นัด", severity: E, what: "PROVIDER ว่างหรือไม่มีในแฟ้ม PROVIDER", fix: "หน้าจอนัดหมาย > แพทย์ผู้นัด" },
      { id: "app_no_service", label: "นัดไม่มี visit (SERVICE)", severity: E, what: "นัดอ้าง visit ที่ไม่มีในระบบ", fix: "แจ้งผู้ดูแลระบบ HOSxP" },
      { id: "app_type", label: "ไม่ระบุประเภทกิจกรรมนัด (APTYPE)", severity: W, what: "ไม่ได้เลือกประเภทนัดมาตรฐาน (HOSxP อาจใส่ค่าเริ่มต้นตอนส่งออก — ควรตรวจในหน้าส่งออก 43 แฟ้ม)", fix: "หน้าจอนัดหมาย > ประเภทนัด หรือ ตั้งค่า > คลินิก > กิจกรรมนัด" },
    ],
  },
  {
    code: "DENTAL",
    name: "ทันตกรรม",
    query: "dental",
    scope: "unit",
    unitLabel: "ครั้ง",
    note: "การตรวจสภาพช่องปาก (dental_care) ผู้บันทึก = ทันตบุคลากร",
    checks: [
      { id: "dent_type", label: "ไม่ระบุประเภทผู้รับบริการ", severity: E, what: "DENTTYPE ว่าง", fix: "ทันตกรรม > ตรวจสภาพช่องปาก" },
      { id: "dent_place", label: "ไม่ระบุสถานที่ให้บริการ", severity: E, what: "SERVPLACE ว่าง", fix: "ทันตกรรม > ตรวจสภาพช่องปาก" },
      { id: "dent_caries", label: "จำนวนฟันผุมากกว่าฟันที่มี", severity: E, what: "PCARIES > PTEETH หรือ DCARIES > DTEETH", fix: "ทันตกรรม > ตรวจสภาพช่องปาก > จำนวนฟัน" },
      { id: "dent_provider", label: "ไม่ระบุผู้ตรวจ", severity: E, what: "PROVIDER ว่างหรือไม่มีในแฟ้ม PROVIDER", fix: "ทันตกรรม > ตรวจสภาพช่องปาก" },
      { id: "dent_teeth", label: "ไม่ลงจำนวนฟัน", severity: W, what: "ฟันแท้และฟันน้ำนมเป็น 0 ทั้งคู่", fix: "ทันตกรรม > ตรวจสภาพช่องปาก > จำนวนฟัน" },
    ],
  },
  {
    code: "REHABILITATION",
    name: "การฟื้นฟูสมรรถภาพ",
    query: "rehabilitation",
    scope: "unit",
    unitLabel: "รายการ",
    note: "รายการกายภาพบำบัด/ฟื้นฟู (physic_list) ใน visit ของช่วงวันที่",
    checks: [
      { id: "rehab_code", label: "ไม่ระบุรหัสบริการฟื้นฟู", severity: E, what: "REHABCODE ว่าง", fix: "กายภาพบำบัด > บันทึกการรักษา" },
      { id: "rehab_provider", label: "ไม่ระบุผู้ให้บริการ", severity: E, what: "PROVIDER ว่างหรือไม่มีในแฟ้ม PROVIDER", fix: "กายภาพบำบัด > บันทึกการรักษา > ผู้ให้บริการ" },
    ],
  },
  {
    code: "NCDSCREEN",
    name: "การคัดกรองโรคเรื้อรัง",
    query: "ncdscreen",
    scope: "hospital",
    unitLabel: "ครั้ง",
    note: "แบบคัดกรองเบาหวาน/ความดัน (person_dmht_risk_screen_head) ไม่มี visit จึงแยกหน่วยบริการไม่ได้ — แยกตามผู้บันทึก",
    checks: [
      { id: "ncd_weight", label: "ไม่ลงน้ำหนัก", severity: E, what: "WEIGHT ว่าง", fix: "งานคัดกรอง NCD > บันทึกผลคัดกรอง" },
      { id: "ncd_height", label: "ไม่ลงส่วนสูง", severity: E, what: "HEIGHT ว่าง", fix: "งานคัดกรอง NCD > บันทึกผลคัดกรอง" },
      { id: "ncd_bp", label: "ไม่ลงความดันโลหิต", severity: E, what: "SBP/DBP ว่าง", fix: "งานคัดกรอง NCD > บันทึกผลคัดกรอง" },
      { id: "ncd_bp_bad", label: "ความดันตัวบนไม่มากกว่าตัวล่าง", severity: E, what: "SBP ต้องมากกว่า DBP (มักพิมพ์สลับช่อง)", fix: "งานคัดกรอง NCD > บันทึกผลคัดกรอง" },
      { id: "ncd_waist", label: "ไม่ลงรอบเอว", severity: W, what: "WAIST_CM ว่าง", fix: "งานคัดกรอง NCD > บันทึกผลคัดกรอง" },
      { id: "ncd_sugar", label: "ไม่ลงผลน้ำตาล", severity: W, what: "ไม่มีทั้ง FPG และ DTX", fix: "งานคัดกรอง NCD > บันทึกผลคัดกรอง" },
      { id: "ncd_height_bad", label: "ส่วนสูงผิดช่วง (ต่ำกว่า 50 หรือเกิน 230 ซม.)", severity: W, what: "มักพิมพ์เป็นเมตรหรือผิดหลัก", fix: "งานคัดกรอง NCD > บันทึกผลคัดกรอง" },
      { id: "ncd_provider", label: "ไม่ระบุผู้คัดกรอง", severity: W, what: "PROVIDER ว่าง", fix: "งานคัดกรอง NCD > บันทึกผลคัดกรอง" },
    ],
  },
  {
    code: "FP",
    name: "การวางแผนครอบครัว",
    query: "fp",
    scope: "unit",
    unitLabel: "ครั้ง",
    note: "บริการหญิงวัยเจริญพันธุ์ที่ระบุวิธีคุมกำเนิด (person_women_service)",
    checks: [
      { id: "fp_provider", label: "ไม่ระบุผู้ให้บริการ", severity: E, what: "PROVIDER ว่างหรือไม่มีในแฟ้ม PROVIDER", fix: "งานวางแผนครอบครัว > บันทึกบริการ > ผู้ให้บริการ" },
      { id: "fp_no_service", label: "บริการไม่มี visit (SERVICE)", severity: E, what: "บันทึกบริการไม่ได้ผูก visit", fix: "บันทึกบริการผ่านหน้าส่งตรวจของ visit" },
    ],
  },
  { code: "PRENATAL", name: "ข้อมูลการตั้งครรภ์", query: "anc", scope: "unit", unitLabel: "ครั้ง ANC", note: "ตรวจข้อมูลการตั้งครรภ์ (person_anc) ของ ANC ในช่วงวันที่",
    checks: [
      { id: "pre_lmp", label: "ไม่ระบุวันแรกของประจำเดือนครั้งสุดท้าย (LMP)", severity: E, what: "LMP ว่าง", fix: "งานฝากครรภ์ > ทะเบียนครรภ์ > LMP" },
      { id: "pre_edc", label: "วันกำหนดคลอด (EDC) ว่าง/ก่อน LMP", severity: E, what: "EDC ว่าง หรือไม่หลัง LMP", fix: "งานฝากครรภ์ > ทะเบียนครรภ์ > EDC" },
      { id: "pre_gravida", label: "ไม่ระบุครรภ์ที่", severity: E, what: "GRAVIDA ว่าง", fix: "งานฝากครรภ์ > ทะเบียนครรภ์" },
    ],
  },
  {
    code: "ANC",
    name: "การฝากครรภ์",
    query: "anc",
    scope: "unit",
    unitLabel: "ครั้ง",
    note: "การตรวจครรภ์ (person_anc_service) ในช่วงวันที่",
    checks: [
      { id: "anc_ga", label: "อายุครรภ์ว่าง/เกิน 45 สัปดาห์", severity: E, what: "GA ต้องอยู่ระหว่าง 1–45 สัปดาห์", fix: "งานฝากครรภ์ > บันทึกการตรวจครรภ์ > อายุครรภ์" },
      { id: "anc_no", label: "ไม่ระบุครั้งที่ฝากครรภ์", severity: E, what: "ANCNO ว่าง", fix: "งานฝากครรภ์ > บันทึกการตรวจครรภ์" },
      { id: "anc_no_service", label: "ANC ไม่มี visit (SERVICE)", severity: E, what: "บันทึก ANC ไม่ได้ผูก visit", fix: "บันทึก ANC ผ่านหน้าส่งตรวจของ visit" },
      { id: "anc_result", label: "ไม่ระบุผลการตรวจ", severity: W, what: "ANCRESULT ว่าง", fix: "งานฝากครรภ์ > บันทึกการตรวจครรภ์ > ผลการตรวจ" },
    ],
  },
  {
    code: "LABOR",
    name: "การคลอด",
    query: "labor",
    scope: "ipd",
    unitLabel: "ราย",
    note: "การคลอด (ipt_labour) ของ AN ที่จำหน่ายในช่วงวันที่",
    checks: [
      { id: "labor_gravida", label: "ไม่ระบุครรภ์ที่", severity: E, what: "GRAVIDA ว่าง", fix: "ห้องคลอด > ข้อมูลการคลอด" },
      { id: "labor_type", label: "ไม่ระบุวิธีคลอด", severity: E, what: "BTYPE ว่าง", fix: "ห้องคลอด > ข้อมูลการคลอด > วิธีคลอด" },
      { id: "labor_place", label: "ไม่ระบุสถานที่คลอด", severity: E, what: "BPLACE ว่าง", fix: "ห้องคลอด > ข้อมูลการคลอด" },
      { id: "labor_lmp", label: "ไม่ระบุ LMP", severity: W, what: "LMP ว่าง", fix: "ห้องคลอด > ข้อมูลการคลอด" },
      { id: "labor_ga", label: "อายุครรภ์ว่าง/นอกช่วง 20–45 สัปดาห์", severity: W, what: "GA ของการคลอดไม่สมเหตุสมผล", fix: "ห้องคลอด > ข้อมูลการคลอด > อายุครรภ์" },
    ],
  },
  {
    code: "POSTNATAL",
    name: "การดูแลมารดาหลังคลอด",
    query: "postnatal",
    scope: "unit",
    unitLabel: "ครั้ง",
    note: "การตรวจหลังคลอด (person_anc_preg_care) ในช่วงวันที่",
    checks: [
      { id: "pnc_place", label: "ไม่ระบุสถานที่ดูแล", severity: E, what: "PPPLACE ว่าง", fix: "งานฝากครรภ์ > ดูแลหลังคลอด" },
      { id: "pnc_provider", label: "ไม่ระบุผู้ให้บริการ", severity: E, what: "PROVIDER ว่างหรือไม่มีในแฟ้ม PROVIDER", fix: "งานฝากครรภ์ > ดูแลหลังคลอด" },
      { id: "pnc_no_service", label: "ไม่ได้ผูก visit", severity: W, what: "บันทึกหลังคลอดไม่มี visit (SEQ)", fix: "บันทึกผ่านหน้าส่งตรวจของ visit" },
    ],
  },
  {
    code: "NEWBORN",
    name: "ทารกแรกเกิด",
    query: "newborn",
    scope: "ipd",
    unitLabel: "คน",
    note: "ทารกจากการคลอดของ AN ที่จำหน่ายในช่วงวันที่",
    checks: [
      { id: "nb_bw", label: "น้ำหนักแรกคลอดว่าง/ผิด", severity: E, what: "BWEIGHT ว่างหรือเกิน 7,000 กรัม", fix: "ห้องคลอด > ข้อมูลทารก" },
      { id: "nb_sex", label: "ไม่ระบุเพศทารก", severity: E, what: "SEX ว่าง", fix: "ห้องคลอด > ข้อมูลทารก" },
      { id: "nb_birth", label: "ไม่ระบุวันเกิดทารก", severity: E, what: "BDATE ว่าง", fix: "ห้องคลอด > ข้อมูลทารก" },
      { id: "nb_apgar", label: "ไม่ลง APGAR นาทีที่ 1/5", severity: W, what: "ใช้คำนวณภาวะขาดออกซิเจน (ASPHYXIA)", fix: "ห้องคลอด > ข้อมูลทารก > APGAR" },
      { id: "nb_ga", label: "ไม่ระบุอายุครรภ์ของทารก", severity: W, what: "GA ว่าง", fix: "ห้องคลอด > ข้อมูลทารก" },
    ],
  },
  {
    code: "NEWBORNCARE",
    name: "การดูแลทารกหลังคลอด",
    query: "newborncare",
    scope: "hospital",
    unitLabel: "ครั้ง",
    note: "การดูแลทารกหลังคลอด (person_wbc_post_care) ไม่มี visit จึงไม่แยกหน่วยบริการ",
    checks: [
      { id: "nbc_place", label: "ไม่ระบุสถานที่ดูแล", severity: E, what: "BCPLACE ว่าง", fix: "งานอนามัยเด็ก > ดูแลทารกหลังคลอด" },
      { id: "nbc_result", label: "ไม่ระบุผลการดูแล", severity: E, what: "BCARERESULT ว่าง", fix: "งานอนามัยเด็ก > ดูแลทารกหลังคลอด" },
      { id: "nbc_provider", label: "ไม่ระบุผู้ให้บริการ", severity: E, what: "PROVIDER ว่างหรือไม่มีในแฟ้ม PROVIDER", fix: "งานอนามัยเด็ก > ดูแลทารกหลังคลอด" },
    ],
  },
  {
    code: "EPI",
    name: "การให้วัคซีน",
    query: "epi",
    scope: "unit",
    unitLabel: "เข็ม",
    note: "วัคซีนที่บันทึกใน visit ของช่วงวันที่ (ovst_vaccine) ผู้บันทึก = ผู้ลงวัคซีน",
    checks: [
      { id: "epi_code", label: "วัคซีนไม่มีรหัสส่งออก", severity: E, what: "VACCINETYPE ว่าง (วัคซีนไม่ได้ map รหัส 43 แฟ้ม)", fix: "ตั้งค่า > รายการวัคซีน > รหัสส่งออก — ผู้ดูแลระบบ" },
      { id: "epi_provider", label: "ไม่ระบุผู้ฉีด", severity: E, what: "PROVIDER ว่างหรือไม่มีในแฟ้ม PROVIDER", fix: "หน้าบันทึกวัคซีน > ผู้ให้บริการ" },
      { id: "epi_expired", label: "วัคซีนหมดอายุก่อนวันฉีด", severity: E, what: "วันหมดอายุที่ลงไว้ก่อนวันรับบริการ (มักลงวันผิด)", fix: "หน้าบันทึกวัคซีน > Lot/วันหมดอายุ" },
      { id: "epi_lot", label: "ไม่ระบุเลข Lot", severity: W, what: "LOTNUMBER ว่าง", fix: "หน้าบันทึกวัคซีน > Lot" },
    ],
  },
  {
    code: "NUTRITION",
    name: "ภาวะโภชนาการ",
    query: "nutrition",
    scope: "unit",
    unitLabel: "ครั้ง",
    note: "การชั่งน้ำหนัก/วัดส่วนสูงเด็ก (person_wbc_nutrition) ในช่วงวันที่",
    checks: [
      { id: "nutri_weight", label: "น้ำหนักว่าง/ผิด", severity: E, what: "WEIGHT ว่างหรือเกิน 150 กก.", fix: "งานอนามัยเด็ก > ภาวะโภชนาการ" },
      { id: "nutri_height", label: "ส่วนสูงว่าง/ผิด", severity: E, what: "HEIGHT ว่างหรือเกิน 230 ซม.", fix: "งานอนามัยเด็ก > ภาวะโภชนาการ" },
      { id: "nutri_level", label: "ไม่ระบุระดับโภชนาการ", severity: W, what: "NLEVEL ว่าง", fix: "งานอนามัยเด็ก > ภาวะโภชนาการ" },
      { id: "nutri_develop", label: "ไม่ระบุพัฒนาการ", severity: W, what: "CHILDDEVELOP ว่าง", fix: "งานอนามัยเด็ก > ภาวะโภชนาการ > พัฒนาการ" },
    ],
  },
  {
    code: "SPECIALPP",
    name: "การให้บริการส่งเสริมป้องกันเฉพาะ",
    query: "specialpp",
    scope: "unit",
    unitLabel: "รายการ",
    note: "รายการ PP พิเศษ (pp_special) ใน visit ของช่วงวันที่",
    checks: [
      { id: "spp_code", label: "ไม่มีรหัส PP มาตรฐาน", severity: E, what: "PPSPECIAL ว่าง / ประเภทไม่มีในตาราง", fix: "ตั้งค่า > ประเภท PP Special > รหัส — ผู้ดูแลระบบ" },
      { id: "spp_provider", label: "ไม่ระบุผู้ให้บริการ", severity: E, what: "PROVIDER ว่างหรือไม่มีในแฟ้ม PROVIDER", fix: "หน้าบันทึก PP Special" },
      { id: "spp_place", label: "ไม่ระบุสถานที่ให้บริการ", severity: W, what: "SERVPLACE ว่าง", fix: "หน้าบันทึก PP Special" },
    ],
  },
  {
    code: "COMMUNITY_ACTIVITY",
    name: "กิจกรรมในชุมชน",
    query: "community_activity",
    scope: "hospital",
    unitLabel: "กิจกรรม",
    note: "กิจกรรมระดับหมู่บ้าน (village_community_activity) ไม่แยกหน่วยบริการ",
    checks: [
      { id: "ca_type", label: "ไม่ระบุรหัสกิจกรรม", severity: E, what: "COMACTIVITY ว่าง", fix: "งานเชิงรุก > กิจกรรมในชุมชน" },
      { id: "ca_village", label: "ไม่ระบุหมู่บ้าน", severity: E, what: "VID ว่าง", fix: "งานเชิงรุก > กิจกรรมในชุมชน" },
      { id: "ca_provider", label: "ไม่ระบุผู้รับผิดชอบ", severity: E, what: "PROVIDER ว่างหรือไม่มีในแฟ้ม PROVIDER", fix: "งานเชิงรุก > กิจกรรมในชุมชน" },
    ],
  },
  {
    code: "COMMUNITY_SERVICE",
    name: "การให้บริการในชุมชน",
    query: "community_service",
    scope: "unit",
    unitLabel: "รายการ",
    note: "บริการในชุมชน (ovst_community_service) ใน visit ของช่วงวันที่",
    checks: [
      { id: "comm_code", label: "ไม่มีรหัสบริการชุมชน", severity: E, what: "COMSERVICE ว่าง", fix: "ตั้งค่า > ประเภทบริการชุมชน > รหัส" },
      { id: "comm_provider", label: "ไม่ระบุผู้ให้บริการ", severity: E, what: "PROVIDER ว่างหรือไม่มีในแฟ้ม PROVIDER", fix: "หน้าบันทึกบริการชุมชน" },
    ],
  },
  {
    code: "PROVIDER",
    name: "ข้อมูลผู้ให้บริการ",
    query: "provider",
    scope: "unit-distinct",
    unitLabel: "คน",
    note: "ผู้ให้บริการที่ถูกอ้างถึงใน visit / วินิจฉัย / หัตถการของช่วงวันที่",
    checks: [
      { id: "prov_nomatch", label: "รหัสผู้ให้บริการไม่มีในตาราง", severity: E, what: "ถูกอ้างถึงแต่ไม่มีในแฟ้ม PROVIDER", fix: FIX_PROVIDER_SETUP },
      { id: "prov_cid", label: "เลขบัตรประชาชนผู้ให้บริการว่าง/ผิด", severity: E, what: "CID ต้องเป็น 13 หลักและหลักตรวจสอบถูก", fix: FIX_PROVIDER_SETUP },
      { id: "prov_type", label: "ไม่ระบุประเภทผู้ให้บริการ", severity: E, what: "PROVIDERTYPE ว่าง/ไม่มีในตาราง", fix: FIX_PROVIDER_SETUP },
      { id: "prov_license", label: "แพทย์/ทันตแพทย์/พยาบาล ไม่มีเลขใบประกอบ", severity: E, what: "REGISTERNO ว่าง (ประเภท 01–03)", fix: FIX_PROVIDER_SETUP },
      { id: "prov_council", label: "ไม่ระบุสภาวิชาชีพ", severity: W, what: "COUNCIL ว่าง (ประเภท 01–03)", fix: FIX_PROVIDER_SETUP },
      { id: "prov_sex", label: "ไม่ระบุเพศ", severity: W, what: "SEX ว่าง", fix: FIX_PROVIDER_SETUP },
      { id: "prov_birth", label: "ไม่ระบุวันเกิด", severity: W, what: "BIRTH ว่าง", fix: FIX_PROVIDER_SETUP },
      { id: "prov_start", label: "ไม่ระบุวันเริ่มปฏิบัติงาน", severity: W, what: "STARTDATE ว่าง", fix: FIX_PROVIDER_SETUP },
    ],
  },
  { code: "WOMEN", name: "หญิงวัยเจริญพันธุ์", note: "ยังไม่รองรับ — ทะเบียนหญิงวัยเจริญพันธุ์ในเขต (ข้อมูลระดับทะเบียน ไม่ใช่รายเดือน)" },
  {
    code: "REFER_HISTORY",
    name: "ประวัติการส่งต่อ",
    query: "refer_out",
    scope: "unit",
    unitLabel: "ครั้ง",
    note: "การส่งต่อออก (referout) ที่วันส่งต่ออยู่ในช่วงวันที่",
    checks: [
      { id: "rfo_hosp", label: "ไม่ระบุสถานพยาบาลปลายทาง", severity: E, what: "HOSP_DESTINATION ว่าง", fix: FIX_REFER },
      { id: "rfo_provider", label: "ไม่ระบุแพทย์ผู้ส่งต่อ", severity: E, what: "PROVIDER ว่างหรือไม่มีในแฟ้ม PROVIDER", fix: FIX_REFER },
      { id: "rfo_cause", label: "ไม่ระบุสาเหตุการส่งต่อ", severity: E, what: "CAUSEOUT ว่าง", fix: FIX_REFER },
      { id: "rfo_type", label: "ไม่ระบุประเภทการส่งต่อ", severity: W, what: "ประเภทการส่ง (OPD/IPD/ER) ว่าง", fix: FIX_REFER },
      { id: "rfo_pdx", label: "ไม่ระบุการวินิจฉัยในใบส่งต่อ", severity: W, what: "DIAGFIRST ในใบส่งต่อว่าง (HOSxP อาจใช้รหัสจาก visit แทน)", fix: FIX_REFER },
      { id: "rfo_no_service", label: "ใบส่งต่อไม่มี visit OPD", severity: W, what: "มักเป็นการส่งต่อจากผู้ป่วยใน (อ้าง AN)", fix: "ตรวจในหน้าส่งต่อ" },
    ],
  },
  {
    code: "REFER_RESULT",
    name: "การรับส่งต่อ",
    query: "refer_in",
    scope: "unit",
    unitLabel: "ครั้ง",
    note: "การรับส่งต่อ (referin) ที่วันส่งต่ออยู่ในช่วงวันที่",
    checks: [
      { id: "rfi_hosp", label: "ไม่ระบุสถานพยาบาลต้นทาง", severity: E, what: "HOSP_SOURCE ว่าง", fix: "ระบบส่งต่อ > รับผู้ป่วยส่งต่อ (Refer in)" },
      { id: "rfi_cause", label: "ไม่ระบุสาเหตุการส่งต่อ", severity: E, what: "CAUSEIN ว่าง", fix: "ระบบส่งต่อ > รับผู้ป่วยส่งต่อ (Refer in)" },
      { id: "rfi_no_service", label: "ไม่ได้ผูก visit", severity: W, what: "ใบรับส่งต่อไม่มี visit", fix: "ระบบส่งต่อ > รับผู้ป่วยส่งต่อ" },
    ],
  },
  { code: "CARE_REFER", name: "รายละเอียดการส่งต่อ (CARE/CLINICAL/DRUG/INVESTIGATION/PROCEDURE_REFER)", note: "ยังไม่รองรับ — รายละเอียดระหว่างส่งต่อ (referout_drug/lab/treat) ตรวจเฉพาะใบส่งต่อหลักใน REFER_HISTORY" },
  { code: "DATA_CORRECT", name: "แฟ้มกำกับข้อมูล (DATA_CORRECT / POLICY)", note: "ไม่ต้องตรวจ — สร้างโดยโปรแกรมส่งออก" },
];

const FDH_FIX_LICENSE = "ตั้งค่าระบบ > ผู้ให้บริการ/แพทย์ (Doctor) > เลขใบประกอบวิชาชีพ — ผู้ดูแลระบบ";

/**
 * FDH OP (16-file claim export: PAT, INS, OPD, ODX, OOP, DRU, ADP, CHA,
 * CHT, AER, LABFU, ORF, PHDB). Field lists from the export header lines
 * only (no patient data read). Most checks reuse the HDC SQL columns
 * (`sqlId`); FDH-only checks have their own column.
 */
const FDH_FILES: readonly Omit<F43FileDef, "group">[] = [
  {
    code: "FDH-PAT",
    label: "PAT",
    name: "ข้อมูลผู้ป่วย",
    query: "person",
    scope: "unit-distinct",
    unitLabel: "คน",
    note: "ผู้มารับบริการในช่วงวันที่ (ไม่ซ้ำคน) — ฟิลด์ PERSON_ID, DOB, SEX, NATION, CHANGWAT, AMPHUR, TITLE, OCCUPA, MARRIAGE",
    checks: [
      { id: "fdh_pat_cid", sqlId: "person_cid_format", label: "PERSON_ID ว่าง/ไม่ครบ 13 หลัก", severity: E, what: "เลขบัตรประชาชนต้องครบ 13 หลัก", fix: FIX_PATIENT },
      { id: "fdh_pat_checksum", sqlId: "person_cid_checksum", label: "PERSON_ID หลักตรวจสอบผิด", severity: E, what: "เลขบัตรประชาชนพิมพ์ผิด", fix: FIX_PATIENT },
      { id: "fdh_pat_dob", sqlId: "person_birth", label: "DOB ว่าง/ผิด", severity: E, what: "วันเกิดว่างหรือไม่สมเหตุสมผล", fix: FIX_PATIENT },
      { id: "fdh_pat_sex", sqlId: "person_sex", label: "SEX ว่าง/ผิด", severity: E, what: "เพศต้องเป็น 1 หรือ 2", fix: FIX_PATIENT },
      { id: "fdh_pat_nation", sqlId: "person_nation", label: "NATION ว่าง/ไม่อยู่ในตาราง", severity: E, what: "สัญชาติว่าง", fix: FIX_PATIENT },
      { id: "fdh_pat_changwat", sqlId: "address_changwat", label: "CHANGWAT ว่าง", severity: E, what: "ไม่มีรหัสจังหวัดของที่อยู่", fix: `${FIX_PATIENT} > ที่อยู่` },
      { id: "fdh_pat_amphur", sqlId: "pat_amphur", label: "AMPHUR ว่าง", severity: E, what: "ไม่มีรหัสอำเภอของที่อยู่", fix: `${FIX_PATIENT} > ที่อยู่` },
      { id: "fdh_pat_title", sqlId: "person_pname", label: "TITLE ว่าง", severity: W, what: "คำนำหน้าว่าง", fix: FIX_PATIENT },
      { id: "fdh_pat_occupa", sqlId: "person_occupation", label: "OCCUPA ว่าง", severity: W, what: "อาชีพว่าง", fix: FIX_PATIENT },
      { id: "fdh_pat_marriage", sqlId: "person_marry", label: "MARRIAGE ว่าง", severity: W, what: "สถานะสมรสว่าง", fix: FIX_PATIENT },
    ],
  },
  {
    code: "FDH-INS",
    label: "INS",
    name: "สิทธิการรักษา",
    query: "service",
    scope: "unit",
    unitLabel: "visit",
    note: "สิทธิของแต่ละ visit — ฟิลด์ INSCL, SUBTYPE, HOSPMAIN, HOSPSUB, PERMITNO",
    checks: [
      { id: "fdh_ins_pttype", sqlId: "svc_pttype", label: "สิทธิว่าง/ไม่มีในระบบ", severity: E, what: "visit ไม่มีสิทธิการรักษา", fix: `${FIX_VISIT} > สิทธิ` },
      { id: "fdh_ins_inscl", sqlId: "ins_inscl", label: "INSCL ว่าง (สิทธิไม่ได้ map รหัส สปสช.)", severity: E, what: "สิทธิไม่มี hipdata_code (UCS/SSS/OFC/LGO…)", fix: "ตั้งค่าระบบ > สิทธิการรักษา (pttype) > รหัส สปสช. (hipdata) — ผู้ดูแลระบบ" },
      { id: "fdh_ins_hospmain", sqlId: "svc_hospmain", label: "สิทธิ UC ไม่มี HOSPMAIN", severity: E, what: "บัตรทองต้องมีหน่วยบริการหลัก", fix: `${FIX_VISIT} > สิทธิ > ตรวจสอบสิทธิ สปสช.` },
      { id: "fdh_ins_permit", sqlId: "ins_permit", label: "ข้าราชการ/อปท. ไม่มีเลขสิทธิ", severity: W, what: "PERMITNO (เลขที่บัตร/เลขอนุมัติ) ว่าง", fix: `${FIX_VISIT} > สิทธิ > เลขที่บัตร` },
    ],
  },
  {
    code: "FDH-OPD",
    label: "OPD",
    name: "การมารับบริการ",
    query: "service",
    scope: "unit",
    unitLabel: "visit",
    note: "ฟิลด์ CLINIC, DATEOPD, TIMEOPD, BTEMP, SBP, DBP, PR, RR, TYPEIN, TYPEOUT",
    checks: [
      { id: "fdh_opd_clinic", sqlId: "opd_clinic", label: "CLINIC (แผนก) ว่าง", severity: E, what: "visit ไม่มีแผนก (spclty)", fix: `${FIX_VISIT} > แผนก` },
      { id: "fdh_opd_bp", sqlId: "opd_bp", label: "SBP/DBP ว่าง", severity: W, what: "ความดันโลหิตว่าง", fix: FIX_SCREEN },
      { id: "fdh_opd_temp", sqlId: "opd_temp", label: "BTEMP ว่าง", severity: W, what: "อุณหภูมิว่าง", fix: FIX_SCREEN },
      { id: "fdh_opd_pr", sqlId: "opd_pr", label: "PR ว่าง", severity: W, what: "ชีพจรว่าง", fix: FIX_SCREEN },
      { id: "fdh_opd_rr", sqlId: "opd_rr", label: "RR ว่าง", severity: W, what: "อัตราการหายใจว่าง", fix: FIX_SCREEN },
      { id: "fdh_opd_typein", sqlId: "svc_typein", label: "TYPEIN ว่าง", severity: W, what: "ประเภทการมารับบริการว่าง", fix: `${FIX_VISIT} > ประเภทการมา` },
      { id: "fdh_opd_typeout", sqlId: "svc_typeout", label: "TYPEOUT ว่าง", severity: W, what: "สถานะการจำหน่ายว่าง", fix: `${FIX_VISIT} > จำหน่าย` },
    ],
  },
  {
    code: "FDH-ODX",
    label: "ODX",
    name: "การวินิจฉัย",
    query: "dx_opd",
    scope: "unit",
    unitLabel: "รหัส",
    note: "ฟิลด์ DIAG, DXTYPE, DRDX (เลขใบประกอบแพทย์ผู้วินิจฉัย) — visit ที่ไม่มี DXTYPE 1 ดูแฟ้ม SERVICE",
    checks: [
      { id: "fdh_odx_nomatch", sqlId: "dx_nomatch", label: "DIAG ไม่อยู่ในตาราง ICD-10", severity: E, what: "รหัสโรคไม่มีในตาราง icd101", fix: FIX_DX },
      { id: "fdh_odx_type", sqlId: "dx_type", label: "DXTYPE ผิด", severity: E, what: "ประเภทการวินิจฉัยต้องเป็น 1–7", fix: FIX_DX },
      { id: "fdh_odx_drdx", sqlId: "odx_drdx", label: "DRDX ว่าง (แพทย์ไม่มีเลขใบประกอบ)", severity: E, what: "ผู้วินิจฉัยไม่มีเลขใบประกอบวิชาชีพในตาราง doctor", fix: FDH_FIX_LICENSE },
      { id: "fdh_odx_provider", sqlId: "dx_provider", label: "ไม่ระบุแพทย์ผู้วินิจฉัย", severity: E, what: "ผู้วินิจฉัยว่างหรือไม่มีในตาราง", fix: FIX_DX },
    ],
  },
  {
    code: "FDH-OOP",
    label: "OOP",
    name: "หัตถการผู้ป่วยนอก",
    query: "proc_opd",
    scope: "unit",
    unitLabel: "รายการ",
    note: "ฟิลด์ OPER (ICD-9-CM), DROPID (เลขใบประกอบผู้ทำหัตถการ)",
    checks: [
      { id: "fdh_oop_oper", sqlId: "proc_nomap", label: "OPER ว่าง (ไม่ได้ผูก ICD-9-CM)", severity: E, what: "หัตถการไม่มีรหัส", fix: "ตั้งค่า > รายการหัตถการ > ICD-9-CM — ผู้ดูแลระบบ" },
      { id: "fdh_oop_nomatch", sqlId: "proc_nomatch", label: "OPER ไม่อยู่ในตาราง ICD-9-CM", severity: E, what: "รหัสไม่มีในตาราง icd9cm1", fix: "หน้าลงหัตถการ" },
      { id: "fdh_oop_provider", sqlId: "proc_provider", label: "ไม่ระบุผู้ทำหัตถการ", severity: E, what: "DROPID ว่าง เพราะไม่มีผู้ทำหัตถการ", fix: "หน้าลงหัตถการ > ผู้ทำหัตถการ" },
      { id: "fdh_oop_dropid", sqlId: "oop_dropid", label: "DROPID ว่าง (ผู้ทำไม่มีเลขใบประกอบ)", severity: E, what: "ผู้ทำหัตถการไม่มีเลขใบประกอบวิชาชีพ", fix: FDH_FIX_LICENSE },
    ],
  },
  {
    code: "FDH-DRU",
    label: "DRU",
    name: "การจ่ายยา",
    query: "drug_opd",
    scope: "unit",
    unitLabel: "รายการ",
    note: "ฟิลด์ DID, DIDSTD, UNIT, AMOUNT, DRUGPRICE, SIGCODE/SIGTEXT, PROVIDER",
    checks: [
      { id: "fdh_dru_didstd", sqlId: "drug_did", label: "DIDSTD ว่าง (ไม่มีรหัส 24 หลัก)", severity: E, what: "ยาไม่มีรหัสมาตรฐาน 24 หลัก", fix: "ระบบห้องยา > กำหนดรายการยา > รหัส 24 หลัก" },
      { id: "fdh_dru_provider", sqlId: "drug_provider", label: "ไม่ระบุผู้สั่งยา", severity: E, what: "PROVIDER ว่าง", fix: "หน้าสั่งยา > แพทย์ผู้สั่ง" },
      { id: "fdh_dru_unit", sqlId: "drug_unit", label: "UNIT ว่าง", severity: W, what: "หน่วยนับมาตรฐานว่าง", fix: "ระบบห้องยา > กำหนดรายการยา > หน่วย" },
      { id: "fdh_dru_sig", sqlId: "dru_sig", label: "SIGCODE/SIGTEXT ว่าง (ไม่มีวิธีใช้)", severity: W, what: "รายการยาไม่มีวิธีใช้", fix: "หน้าสั่งยา > วิธีใช้" },
      { id: "fdh_dru_lic", sqlId: "dru_provider_lic", label: "ผู้สั่งยาไม่มีเลขใบประกอบ", severity: W, what: "PROVIDER ไม่มีเลขใบประกอบวิชาชีพ", fix: FDH_FIX_LICENSE },
      { id: "fdh_dru_amount", sqlId: "drug_qty", label: "AMOUNT 0 หรือติดลบ", severity: W, what: "จำนวนยาไม่สมเหตุสมผล", fix: "หน้าสั่งยา/ห้องยา" },
    ],
  },
  {
    code: "FDH-ADP",
    label: "ADP",
    name: "ค่าใช้จ่ายเพิ่ม (ADP)",
    query: "adp",
    scope: "unit",
    unitLabel: "รายการ",
    note: "รายการที่ไม่ใช่ยา (nondrugitems) ฟิลด์ TYPE, CODE ของ สปสช.",
    checks: [
      { id: "adp_code", label: "มีประเภท ADP แต่ไม่มีรหัส ADP", severity: E, what: "รายการกำหนด TYPE แต่ CODE ว่าง FDH ส่งไม่ได้", fix: "ตั้งค่า > รายการค่าบริการ (nondrugitems) > รหัส ADP สปสช. — ผู้ดูแลระบบ" },
      { id: "adp_qty", label: "QTY 0 หรือติดลบ", severity: W, what: "จำนวนไม่สมเหตุสมผล", fix: "การเงิน > แก้ไขรายการ" },
    ],
  },
  {
    code: "FDH-CHA",
    label: "CHA",
    name: "ค่ารักษาแยกหมวด",
    query: "charge_opd",
    scope: "unit",
    unitLabel: "รายการ",
    note: "ฟิลด์ CHRGITEM, AMOUNT",
    checks: [
      { id: "fdh_cha_item", sqlId: "chg_item", label: "CHRGITEM ไม่ได้ map หมวด", severity: E, what: "หมวดค่าใช้จ่ายไม่มีกลุ่มมาตรฐาน", fix: "ตั้งค่า > หมวดค่าใช้จ่าย (income) — ผู้ดูแลระบบ" },
      { id: "fdh_cha_amount", sqlId: "chg_price", label: "AMOUNT ว่าง/ติดลบ", severity: E, what: "ราคาไม่ถูกต้อง", fix: "การเงิน > แก้ไขรายการ" },
    ],
  },
  {
    code: "FDH-CHT",
    label: "CHT",
    name: "ค่ารักษารวมต่อ visit",
    query: "charge_opd",
    scope: "unit",
    unitLabel: "รายการ",
    note: "ฟิลด์ TOTAL, PAID, PTTYPE",
    checks: [
      { id: "fdh_cht_pttype", sqlId: "chg_instype", label: "PTTYPE ของรายการไม่ได้ map", severity: E, what: "รายการคิดในสิทธิที่ไม่มีรหัสมาตรฐาน", fix: FIX_PTTYPE_SETUP },
    ],
  },
  {
    code: "FDH-AER",
    label: "AER",
    name: "อุบัติเหตุฉุกเฉิน",
    query: "accident",
    scope: "unit",
    unitLabel: "visit",
    note: "visit บาดเจ็บ (S/T) — ฟิลด์ AEDATE, AETIME, AETYPE",
    checks: [
      { id: "fdh_aer_date", sqlId: "acc_datetime", label: "AEDATE/AETIME ว่าง", severity: E, what: "วันเวลาเกิดเหตุว่าง", fix: "ห้องฉุกเฉิน (ER) > ข้อมูลอุบัติเหตุ" },
      { id: "fdh_aer_type", sqlId: "acc_type", label: "AETYPE ว่าง", severity: E, what: "ประเภทอุบัติเหตุว่าง", fix: "ห้องฉุกเฉิน (ER) > ข้อมูลอุบัติเหตุ" },
      { id: "fdh_aer_record", sqlId: "acc_no_record", label: "ไม่มีบันทึกอุบัติเหตุ", severity: W, what: "บาดเจ็บแต่ไม่บันทึกข้อมูลอุบัติเหตุ", fix: "ห้องฉุกเฉิน (ER) > ข้อมูลอุบัติเหตุ" },
    ],
  },
  {
    code: "FDH-LABFU",
    label: "LABFU",
    name: "ผลแลป",
    query: "labfu",
    scope: "unit",
    unitLabel: "รายการ",
    note: "ฟิลด์ LABTEST, LABRESULT ของแลปที่ map รหัส",
    checks: [
      { id: "fdh_lab_result", sqlId: "lab_result", label: "LABRESULT ว่าง", severity: W, what: "สั่งแลปแต่ไม่มีผล", fix: "ระบบ LAB > ลงผล" },
    ],
  },
  {
    code: "FDH-ORF",
    label: "ORF",
    name: "การส่งต่อ",
    query: "refer_out",
    scope: "unit",
    unitLabel: "ครั้ง",
    note: "ฟิลด์ REFER (รหัสสถานพยาบาลปลายทาง), REFERTYPE",
    checks: [
      { id: "fdh_orf_refer", sqlId: "rfo_hosp", label: "REFER ว่าง", severity: E, what: "ไม่ระบุสถานพยาบาลปลายทาง", fix: FIX_REFER },
      { id: "fdh_orf_type", sqlId: "rfo_type", label: "REFERTYPE ว่าง", severity: W, what: "ไม่ระบุประเภทการส่งต่อ", fix: FIX_REFER },
    ],
  },
  { code: "FDH-PHDB", label: "PHDB", name: "รายการยา/เวชภัณฑ์ (PHDB)", note: "ยังไม่รองรับ — ยังไม่ได้ยืนยันตารางต้นทางของ CODE ใน HOSxP" },
];

export const F43_FILES: readonly F43FileDef[] = [
  ...HDC_FILES.map((f) => ({ ...f, group: "hdc" as const })),
  ...FDH_FILES.map((f) => ({ ...f, group: "fdh" as const })),
];
