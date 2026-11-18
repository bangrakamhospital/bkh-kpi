import "server-only";

import type { ClinicPayGroupCode, ClinicSchemeCode } from "@/lib/kpi/clinic-scheme-types";
import { PTTYPE_GROUPS } from "@/lib/kpi/overview";

import { sqlCodeList } from "./screening-common";

/**
 * Scheme of a visit, shared by every /clinic/* page (NCD, กายภาพ, ทันตกรรม
 * and the standard clinic page). HOSxP only.
 *
 * Scheme = first matching rule on (pttype.hipdata_code of ovst.pttype,
 * vn_stat.hospmain = own hospcode). Capitation ("รายรับเรียกเก็บไม่เต็ม
 * จำนวน") = the hospital is the patient's registered main unit of a
 * capitated fund: UC (เหมาจ่ายรายหัว), SSS/SSI (สถานพยาบาลหลัก) and NRH
 * (ประกันสุขภาพต่างด้าว). Everything else is billed per service ("เกิด
 * รายได้เต็มจำนวน"). Rule order matters; OTHER = no rule matched (NRD,
 * INS, NRH registered elsewhere, blank).
 *
 * The SQL fragments expect the aliases `pt` (pttype, LEFT JOINed on
 * ovst.pttype) and `vs` (vn_stat), and the named parameter :hospcode.
 */

const hip = (code: string): readonly string[] =>
  PTTYPE_GROUPS.find((g) => g.code === code)?.hipdata ?? [];

export const CLINIC_SCHEME_RULES: readonly {
  code: ClinicSchemeCode;
  payGroup: ClinicPayGroupCode;
  hipdata: readonly string[];
  /** "own" = vn_stat.hospmain is this hospital, "other" = it is not, "any". */
  hospmain: "own" | "other" | "any";
}[] = [
  { code: "UC_OWN", payGroup: "CAPITATION", hipdata: hip("UC"), hospmain: "own" },
  { code: "SSS_OWN", payGroup: "CAPITATION", hipdata: hip("SSS"), hospmain: "own" },
  { code: "NRH_OWN", payGroup: "CAPITATION", hipdata: ["NRH"], hospmain: "own" },
  { code: "OFC", payGroup: "FULL", hipdata: hip("OFC"), hospmain: "any" },
  { code: "LGO", payGroup: "FULL", hipdata: hip("LGO"), hospmain: "any" },
  { code: "GOV", payGroup: "FULL", hipdata: hip("GOV"), hospmain: "any" },
  { code: "SSS_OTHER", payGroup: "FULL", hipdata: hip("SSS"), hospmain: "other" },
  { code: "UC_OTHER", payGroup: "FULL", hipdata: hip("UC"), hospmain: "other" },
  { code: "CSH", payGroup: "FULL", hipdata: hip("CSH"), hospmain: "any" },
];

/** Scheme codes by index (rule order, OTHER last), for the person bitmasks. */
export const CLINIC_SCHEME_INDEX: readonly ClinicSchemeCode[] = [
  ...CLINIC_SCHEME_RULES.map((r) => r.code),
  "OTHER",
];

/** Thai labels of the scheme rows. */
export const SCHEME_NAMES: Readonly<Record<ClinicSchemeCode, string>> = {
  UC_OWN: "UC / บัตรทอง ลงทะเบียน รพ.บางระกำ (เหมาจ่ายรายหัว)",
  SSS_OWN: "ประกันสังคม รพ.บางระกำเป็นสถานพยาบาลหลัก",
  NRH_OWN: "ต่างด้าวประกันสุขภาพ ขึ้นทะเบียน รพ.บางระกำ",
  OFC: "ข้าราชการ / เบิกกรมบัญชีกลาง",
  LGO: "อปท.",
  GOV: "หน่วยงานรัฐอื่น (กทม. พัทยา รฟท. ฯลฯ)",
  SSS_OTHER: "ประกันสังคมต่างพื้นที่",
  UC_OTHER: "UC / บัตรทอง ต่างพื้นที่",
  CSH: "ชำระเงินเอง",
  OTHER: "อื่นๆ (ต่างด้าวไม่มีประกัน, พ.ร.บ., ไม่ระบุ)",
};

/** The two payment groups, display order (FULL first). */
export const PAY_GROUPS: readonly { code: ClinicPayGroupCode; name: string; rule: string }[] = [
  {
    code: "FULL",
    name: "สิทธิเกิดรายได้เต็มจำนวน",
    rule: "เรียกเก็บตามรายการบริการ: ข้าราชการ, อปท., หน่วยงานรัฐอื่น, ประกันสังคม/UC ต่างพื้นที่, ชำระเงินเอง, อื่นๆ (ต่างด้าวไม่มีประกัน, พ.ร.บ.)",
  },
  {
    code: "CAPITATION",
    name: "รายรับเรียกเก็บไม่เต็มจำนวน",
    rule: "รพ.บางระกำเป็นหน่วยบริการหลัก (hospmain 11252) ของกองทุนเหมาจ่าย: UC, ประกันสังคม, ต่างด้าวประกันสุขภาพ",
  },
];

export const payGroupOf = (code: ClinicSchemeCode): ClinicPayGroupCode =>
  CLINIC_SCHEME_RULES.find((r) => r.code === code)?.payGroup ?? "FULL";

export function isSchemeCode(code: string): code is ClinicSchemeCode {
  return (CLINIC_SCHEME_INDEX as readonly string[]).includes(code);
}

/** Scheme codes of a payment group, rule order. */
export const schemesOf = (group: ClinicPayGroupCode): ClinicSchemeCode[] =>
  CLINIC_SCHEME_INDEX.filter((s) => payGroupOf(s) === group);

// --- SQL fragments ---------------------------------------------------------------

const OWN_MAIN = "COALESCE(vs.hospmain, '') = :hospcode";

/** CASE over the scheme rules, on `pt` (pttype) and `vs` (vn_stat). */
function schemeCase(value: (index: number) => string): string {
  const whens = CLINIC_SCHEME_RULES.map((r, i) => {
    const main =
      r.hospmain === "own"
        ? ` AND ${OWN_MAIN}`
        : r.hospmain === "other"
          ? ` AND NOT (${OWN_MAIN})`
          : "";
    return `    WHEN pt.hipdata_code IN (${sqlCodeList(r.hipdata)})${main} THEN ${value(i)}`;
  });
  return `CASE
${whens.join("\n")}
    ELSE ${value(CLINIC_SCHEME_RULES.length)} END`;
}

/** -> scheme code ('UC_OWN', …, 'OTHER'). */
export const SCHEME_CODE_EXPR = schemeCase((i) => `'${CLINIC_SCHEME_INDEX[i]}'`);
/** -> scheme index in CLINIC_SCHEME_INDEX. */
export const SCHEME_INDEX_EXPR = schemeCase((i) => String(i));

/** Bits (of a person's scheme_mask) of the capitation schemes. */
export const CAPITATION_MASK = CLINIC_SCHEME_INDEX.reduce(
  (m, code, i) => (payGroupOf(code) === "CAPITATION" ? m | (1 << i) : m),
  0,
);
/** Bits of the fee-for-service schemes (OTHER included). */
export const FULL_MASK = ((1 << CLINIC_SCHEME_INDEX.length) - 1) & ~CAPITATION_MASK;

/**
 * People columns over `<alias>.scheme_mask` (BIT_OR(1 << SCHEME_INDEX_EXPR)
 * per person): s0..s9 per scheme, then pay_full / pay_capitation. Each line
 * ends with a comma.
 */
export function schemePersonColumns(alias = "c", indent = "  "): string {
  return [
    ...CLINIC_SCHEME_INDEX.map((_, i) => `${indent}SUM((${alias}.scheme_mask & ${1 << i}) <> 0) AS s${i},`),
    `${indent}SUM((${alias}.scheme_mask & ${FULL_MASK}) <> 0) AS pay_full,`,
    `${indent}SUM((${alias}.scheme_mask & ${CAPITATION_MASK}) <> 0) AS pay_capitation,`,
  ].join("\n");
}
