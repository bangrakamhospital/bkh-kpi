/**
 * Clinics of "ประมาณการรายได้แยกคลินิก" (/clinic/*), in menu order. Pure
 * module (no server-only): read by the sub-navigation (client), the
 * standard page's generateStaticParams and the standard loader.
 *
 *  - kind "special": a page of its own (/clinic/ncd, /clinic/pt,
 *    /clinic/dental, static segments) with its own definition; `depcodes`
 *    are informational (PT and dental count procedures, not ovst.main_dep).
 *  - kind "standard": the shared page /clinic/[clinic] (standard-clinic.ts):
 *    a visit of the clinic = ovst.main_dep IN depcodes. Every code is a
 *    constant validated by sqlCodeList when the SQL is built.
 *
 * Department codes verified with db-cli (kskdepartment, FY2569 visits,
 * 2026-11-18). Not clinics (never listed): 007 lab, 014 การเงิน, 009, 063,
 * 999, blank / NULL.
 */

export type ClinicKind = "special" | "standard";

export interface ClinicSubUnit {
  name: string;
  depcodes: readonly string[];
}

export interface ClinicDef {
  /** URL segment: /clinic/<slug>. */
  slug: string;
  /** Menu label (Thai). */
  label: string;
  /** ovst.main_dep codes of the clinic (all sub-units). */
  depcodes: readonly string[];
  /** Sub-units shown as rows on the page (each a set of depcodes). */
  subUnits?: readonly ClinicSubUnit[];
  kind: ClinicKind;
  /** One-line description (page header / notes, Thai). */
  note: string;
}

/** kskdepartment names of every code used below (Thai, without the code). */
export const DEPARTMENT_NAMES: Readonly<Record<string, string>> = {
  "001": "ห้องตรวจโรคทั่วไป (รอพบแพทย์)",
  "008": "ห้องตรวจทันตกรรม",
  "011": "ห้องฉุกเฉิน",
  "012": "ห้องแพทย์ฉุกเฉิน (ปิดใช้งาน)",
  "017": "คลินิกใจประสานใจ",
  "018": "คลินิกตา",
  "019": "คลินิกบำบัด",
  "020": "จุดซักประวัติคลินิกจิตเวช",
  "021": "คลินิกรักษ์ปอด",
  "022": "คลินิกตรวจครรภ์",
  "027": "กายภาพบำบัด",
  "029": "ห้องแพทย์แผนไทย",
  "030": "PCU ตรวจโรคทั่วไป",
  "031": "PCU คลินิกโรคเบาหวาน",
  "032": "PCU คลินิกโรคความดันโลหิตสูง",
  "033": "PCU คลินิกฝากครรภ์",
  "034": "PCU อนามัยเด็ก",
  "035": "PCU นรีเวชกรรม",
  "036": "PCU เมืองใหม่ ตรวจโรคทั่วไป",
  "037": "PCU เมืองใหม่ คลินิกเบาหวาน",
  "038": "PCU เมืองใหม่ คลินิกความดันโลหิตสูง",
  "039": "PCU เมืองใหม่ คลินิกฝากครรภ์ (ปิดใช้งาน)",
  "040": "PCU เมืองใหม่ อนามัยเด็ก (ปิดใช้งาน)",
  "041": "PCU เมืองใหม่ นรีเวชกรรม (ปิดใช้งาน)",
  "046": "ห้องฟันออกหน่วย",
  "047": "ห้องตรวจโรค NCD",
  "050": "คลินิก ARI",
  "053": "คลินิกพรีเมียม",
  "054": "คลินิกรักษ์ตับ",
  "055": "คลินิกแพทย์อายุรกรรม",
  "056": "คลินิกเฝ้าระวัง MDR",
  "057": "PCU เมืองใหม่ ทันตกรรม",
  "058": "คลินิกสุขภาพดี",
  "061": "จุดซักประวัติตรวจโรคทั่วไป",
  "062": "จุดซักประวัติโรคไม่ติดต่อเรื้อรัง",
  "064": "ห้องตรวจคลินิกจิตเวช",
  "065": "คลินิกบำบัดบุหรี่-สุรา",
  "066": "PCU ทันตกรรม",
  "067": "คลินิก Telemedicine",
};

const PCU_CITY: ClinicSubUnit = {
  name: "PCU ในเมือง",
  depcodes: ["030", "031", "032", "033", "034", "035", "066"],
};
const PCU_NEW_TOWN: ClinicSubUnit = {
  name: "PCU เมืองใหม่",
  depcodes: ["036", "037", "038", "039", "040", "041", "057"],
};

const PSYCH_UNITS: readonly ClinicSubUnit[] = [
  { name: "คลินิกจิตเวช", depcodes: ["020", "064"] },
  { name: "คลินิกบำบัด (ยาเสพติด)", depcodes: ["019"] },
  { name: "คลินิกบำบัดบุหรี่-สุรา", depcodes: ["065"] },
  { name: "คลินิกใจประสานใจ", depcodes: ["017"] },
];

const OTHER_UNITS: readonly ClinicSubUnit[] = [
  { name: "คลินิก Telemedicine", depcodes: ["067"] },
  { name: "คลินิกแพทย์อายุรกรรม", depcodes: ["055"] },
  { name: "คลินิกเฝ้าระวัง MDR", depcodes: ["056"] },
];

const allOf = (units: readonly ClinicSubUnit[]) => units.flatMap((u) => u.depcodes);

export const CLINICS: readonly ClinicDef[] = [
  {
    slug: "ncd",
    label: "คลินิกโรคเรื้อรัง",
    depcodes: ["062", "047"],
    kind: "special",
    note: "คลินิก NCD (DM / HT / DLP) ตัวชี้วัดคุณภาพและระยะเวลารอคอย",
  },
  {
    slug: "pt",
    label: "คลินิกกายภาพ",
    depcodes: ["027"],
    kind: "special",
    note: "นับตามรายการกายภาพ (physic_list) ทุก visit ไม่ใช่ตาม main_dep",
  },
  {
    slug: "dental",
    label: "คลินิกทันตกรรม",
    depcodes: ["008", "046"],
    kind: "special",
    note: "นับตามหัตถการทันตกรรม (dtmain) ทุก visit ไม่ใช่ตาม main_dep",
  },
  {
    slug: "opd",
    label: "OPD ทั่วไป",
    depcodes: ["061", "001"],
    kind: "standard",
    note: "ผู้ป่วยนอกทั่วไป: จุดซักประวัติตรวจโรคทั่วไป (061) และห้องตรวจโรคทั่วไป (001)",
  },
  {
    slug: "er",
    label: "ห้องฉุกเฉิน (ER)",
    depcodes: ["011", "012"],
    kind: "standard",
    note: "ห้องฉุกเฉิน (011) รวมรหัส 012 ที่ปิดใช้งานแล้ว",
  },
  {
    slug: "eye",
    label: "คลินิกตา",
    depcodes: ["018"],
    kind: "standard",
    note: "คลินิกตา (018)",
  },
  {
    slug: "thai-med",
    label: "แพทย์แผนไทย",
    depcodes: ["029"],
    kind: "standard",
    note: "ห้องแพทย์แผนไทย (029)",
  },
  {
    slug: "psych",
    label: "จิตเวช / บำบัด",
    depcodes: allOf(PSYCH_UNITS),
    subUnits: PSYCH_UNITS,
    kind: "standard",
    note: "คลินิกจิตเวช คลินิกบำบัด บุหรี่-สุรา และใจประสานใจ แยกรายแผนกในหน้า",
  },
  {
    slug: "premium",
    label: "คลินิกพรีเมียม",
    depcodes: ["053"],
    kind: "standard",
    note: "คลินิกพรีเมียม (053)",
  },
  {
    slug: "ari",
    label: "คลินิก ARI",
    depcodes: ["050"],
    kind: "standard",
    note: "คลินิกโรคติดเชื้อทางเดินหายใจ ARI (050)",
  },
  {
    slug: "wellness",
    label: "คลินิกสุขภาพดี",
    depcodes: ["058"],
    kind: "standard",
    note: "คลินิกสุขภาพดี (058)",
  },
  {
    slug: "liver",
    label: "คลินิกรักษ์ตับ",
    depcodes: ["054"],
    kind: "standard",
    note: "คลินิกรักษ์ตับ (054)",
  },
  {
    slug: "anc",
    label: "คลินิกตรวจครรภ์",
    depcodes: ["022"],
    kind: "standard",
    note: "คลินิกตรวจครรภ์ (022) ของโรงพยาบาล (PCU ฝากครรภ์อยู่ในแท็บ PCU)",
  },
  {
    slug: "lung",
    label: "คลินิกรักษ์ปอด",
    depcodes: ["021"],
    kind: "standard",
    note: "คลินิกรักษ์ปอด (021)",
  },
  {
    slug: "other",
    label: "คลินิกอื่นๆ",
    depcodes: allOf(OTHER_UNITS),
    subUnits: OTHER_UNITS,
    kind: "standard",
    note: "Telemedicine อายุรกรรม และเฝ้าระวัง MDR แยกรายแผนกในหน้า",
  },
  {
    slug: "pcu",
    label: "PCU",
    depcodes: allOf([PCU_CITY, PCU_NEW_TOWN]),
    subUnits: [PCU_CITY, PCU_NEW_TOWN],
    kind: "standard",
    note: "หน่วยบริการปฐมภูมิ PCU ในเมือง และ PCU เมืองใหม่ แยกรายแผนกในหน้า",
  },
];

export const clinicHref = (slug: string) => `/clinic/${slug}`;

export function findClinic(slug: string): ClinicDef | undefined {
  return CLINICS.find((c) => c.slug === slug);
}

/** A "standard" clinic by slug, or undefined (unknown slug or a special page). */
export function findStandardClinic(slug: string): ClinicDef | undefined {
  const c = findClinic(slug);
  return c?.kind === "standard" ? c : undefined;
}

export const STANDARD_CLINICS: readonly ClinicDef[] = CLINICS.filter((c) => c.kind === "standard");

/**
 * Units shown in the "แยกตามแผนก" table: the sub-units, or one row per
 * depcode when the clinic has several codes, or none (single code).
 */
export function clinicUnits(c: ClinicDef): readonly ClinicSubUnit[] {
  if (c.subUnits) return c.subUnits;
  if (c.depcodes.length > 1) {
    return c.depcodes.map((d) => ({ name: `${DEPARTMENT_NAMES[d] ?? d} (${d})`, depcodes: [d] }));
  }
  return [];
}
