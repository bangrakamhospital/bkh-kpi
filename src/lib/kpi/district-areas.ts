/**
 * อ.บางระกำ จ.พิษณุโลก (6504): sub-districts (ตำบล) and the health units
 * that serve them. Client-safe (constants only).
 *
 * Data source: the district page uses the HDC database (43 files,
 * `sub_hdc`) ONLY, for all 11 sub-districts incl. 650401 (the hospital
 * 11252 sends its data to HDC too). The hospital page keeps HOSxP.
 *
 * `units` = hospcodes as used in SERVICE (5 digits). Some units appear in
 * PERSON / VILLAGE with a "GA00" prefix (GA0007535 = 07535,
 * GA0014056 = 14056); the SQL normalises with RIGHT(hospcode, 5).
 * 07537 serves villages in both 650407 and 650411 — people are assigned
 * by their HOME address, so it is listed under both.
 * Verified with db-cli (village.vid, c_hospital.tmb_code).
 */

import type { DistrictCode, DistrictKpiCode } from "@/lib/kpi/types";

export interface DistrictUnit {
  hospcode: string;
  name: string;
}

export interface TambonDef {
  /** 6-digit sub-district code, e.g. "650402". */
  code: string;
  name: string;
  units: readonly DistrictUnit[];
}

export const DISTRICT_CODE = "6504";
export const DISTRICT_NAME = "บางระกำ";

/** The hospital (sub-district 650401). See the typedisch rule in ../sql/hdc-screening. */
export const HOSPITAL_HOSPCODE = "11252";

const U = (hospcode: string, name: string): DistrictUnit => ({
  hospcode,
  name,
});

export const DISTRICT_TAMBONS: readonly TambonDef[] = [
  {
    code: "650401",
    name: "บางระกำ",
    units: [U("11252", "โรงพยาบาลบางระกำ")],
  },
  {
    code: "650402",
    name: "ปลักแรด",
    units: [U("07526", "รพ.สต.ปลักแรด"), U("07527", "รพ.สต.บ้านดงโคกขาม")],
  },
  {
    code: "650403",
    name: "พันเสา",
    units: [U("07528", "รพ.สต.พันเสา"), U("14056", "รพ.สต.บ้านแหลมมะค่า")],
  },
  {
    code: "650404",
    name: "วังอิทก",
    units: [U("07529", "รพ.สต.วังอิทก"), U("11803", "รพ.สต.บ้านกรับพวง")],
  },
  {
    code: "650405",
    name: "บึงกอก",
    units: [
      U("07530", "รพ.สต.บ้านปรือกระเทียม"),
      U("07531", "รพ.สต.บึงกอก"),
    ],
  },
  {
    code: "650406",
    name: "หนองกุลา",
    units: [
      U("07532", "รพ.สต.หนองกุลา"),
      U("07533", "รพ.สต.ในนิคมบางระกำ"),
      U("07534", "รพ.สต.บ้านหนองนา"),
      U("07535", "รพ.สต.บ้านหนองไผ่"),
    ],
  },
  {
    code: "650407",
    name: "ชุมแสงสงคราม",
    units: [
      U("07536", "รพ.สต.บ้านชุมแสง"),
      U("07537", "รพ.สต.ชุมแสงสงคราม"),
      U("07538", "รพ.สต.บ้านหนองอ้อ"),
    ],
  },
  {
    code: "650408",
    name: "นิคมพัฒนา",
    units: [
      U("07539", "รพ.สต.นิคมพัฒนา"),
      U("07540", "รพ.สต.บ้านใหม่เจริญผล"),
    ],
  },
  {
    code: "650409",
    name: "บ่อทอง",
    units: [U("07541", "รพ.สต.บ่อทอง")],
  },
  {
    code: "650410",
    name: "ท่านางงาม",
    units: [U("07542", "รพ.สต.ท่านางงาม")],
  },
  {
    code: "650411",
    name: "คุยม่วง",
    units: [U("07543", "รพ.สต.บ้านดง"), U("07537", "รพ.สต.ชุมแสงสงคราม")],
  },
];

/** Every unit hospcode of the district (5 digits, de-duplicated, incl. 11252). */
export const HDC_UNIT_HOSPCODES: readonly string[] = [
  ...new Set(DISTRICT_TAMBONS.flatMap((t) => t.units.map((u) => u.hospcode))),
];

/**
 * First fiscal year (BE) loaded in the HDC database (service / ncdscreen
 * start 2025-10). Earlier years are rejected by the district API.
 */
export const HDC_MIN_FISCAL_YEAR = 2569;

/** Ratio indicators of the district page, in hospital-page order. */
export const DISTRICT_CODES: readonly DistrictCode[] = [
  "DM",
  "HT",
  "CX",
  "BR",
  "DMC",
  "HTC",
  "RLU_HBA1C",
  "RLU_LDL",
  "RLU_CR",
];

export function isDistrictCode(value: unknown): value is DistrictCode {
  return (DISTRICT_CODES as readonly unknown[]).includes(value);
}

/** Every district indicator in hospital-page order (ratio + CKD5 + STEMI). */
export const DISTRICT_KPI_CODES: readonly DistrictKpiCode[] = [
  ...DISTRICT_CODES,
  "CKD5",
  "STEMI",
];

export function isDistrictKpiCode(value: unknown): value is DistrictKpiCode {
  return (DISTRICT_KPI_CODES as readonly unknown[]).includes(value);
}
