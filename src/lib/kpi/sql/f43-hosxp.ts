import "server-only";

/**
 * SQL of "ตรวจ 43 แฟ้ม" (/f43) against HOSxP (hospital HIS, never HDC).
 * Every query returns aggregate rows only:
 *   dep    ovst.main_dep of the visit (kskdepartment.depcode), 'IPD' for
 *          admissions, '*' for whole-hospital rows
 *   rec    recorder key: 'u:<opduser.loginname>' or 'd:<doctor.code>'
 *          ('' when the table has no recorder column)
 *   total  records checked
 *   c_<id> records failing check <id> (ids: ../f43-registry.ts)
 * No HN / CID / name is selected: identifying columns are used only
 * inside SQL conditions.
 *
 * All SQL is static (check expressions are source constants); only the
 * month bounds are bound as named parameters:
 *   :start  'YYYY-MM-DD'  first day of the range
 *   :end    'YYYY-MM-DD'  day after the last day of the range (exclusive)
 * The range is chosen on the page (at most F43_MAX_RANGE_DAYS days).
 * Each query is bounded by an indexed date column (ovst.vstdate,
 * ovstdiag.vstdate, opitemrece.vstdate, ipt.dchdate, oapp.vstdate,
 * lab_head.order_date, …). Columns and codes verified with db-cli
 * (2026-11-19, October 2026 data).
 */

export interface F43CheckSql {
  id: string;
  /** SQL boolean expression: true = the record fails the check. */
  expr: string;
}

export interface F43QuerySql {
  key: string;
  sql: string;
  checkIds: string[];
}

/** Records whose date column is in [:start, :end). */
const IN_MONTH = (col: string) => `${col} >= :start AND ${col} < :end`;

const sumCols = (checks: readonly F43CheckSql[]) =>
  checks
    .map((c) => `SUM(CASE WHEN ${c.expr} THEN 1 ELSE 0 END) AS c_${c.id}`)
    .join(",\n  ");

/** One aggregate SELECT grouped by (dep, rec). */
function agg(
  dep: string,
  rec: string,
  checks: readonly F43CheckSql[],
  from: string,
  hint = "",
): string {
  return `SELECT ${hint}${dep} AS dep, ${rec} AS rec, COUNT(*) AS total,
  ${sumCols(checks)}
${from}
GROUP BY dep, rec`;
}

function query(key: string, checks: readonly F43CheckSql[], sql: string): F43QuerySql {
  for (const c of checks) {
    if (!/^[a-z0-9_]{1,50}$/.test(c.id)) throw new Error(`invalid check id: ${c.id}`);
  }
  return { key, sql, checkIds: checks.map((c) => c.id) };
}

/**
 * Distinct-entity query (people, providers): flags are computed once per
 * entity in CTE x, then counted per unit (pairs in CTE v) and once for the
 * whole hospital (dep '*'), so a person seen by two units is one person
 * in the hospital total.
 */
function distinctQuery(
  key: string,
  withs: string,
  keyCol: string,
  xFrom: string,
  checks: readonly F43CheckSql[],
): F43QuerySql {
  const flags = checks
    .map((c) => `CASE WHEN ${c.expr} THEN 1 ELSE 0 END AS f_${c.id}`)
    .join(",\n    ");
  const counted = checks.map((c) => ({ id: c.id, expr: `x.f_${c.id} = 1` }));
  const sql = `WITH ${withs},
x AS (
  SELECT k.${keyCol} AS k,
    ${flags}
  ${xFrom}
)
${agg("v.dep", "''", counted, `FROM v JOIN x ON x.k = v.${keyCol}`)}
UNION ALL
${agg("'*'", "''", counted, "FROM x")}`;
  return query(key, checks, sql);
}

/** 13-digit CID with a wrong check digit (mod 11). */
const cidChecksumBad = (c: string) => `(${c} REGEXP '^[0-9]{13}$' AND MOD(11 - MOD(
      SUBSTRING(${c},1,1)*13 + SUBSTRING(${c},2,1)*12 + SUBSTRING(${c},3,1)*11 +
      SUBSTRING(${c},4,1)*10 + SUBSTRING(${c},5,1)*9 + SUBSTRING(${c},6,1)*8 +
      SUBSTRING(${c},7,1)*7 + SUBSTRING(${c},8,1)*6 + SUBSTRING(${c},9,1)*5 +
      SUBSTRING(${c},10,1)*4 + SUBSTRING(${c},11,1)*3 + SUBSTRING(${c},12,1)*2, 11), 10)
      <> SUBSTRING(${c},13,1))`;
const cidFormatBad = (c: string) => `(${c} IS NULL OR ${c} NOT REGEXP '^[0-9]{13}$')`;
const blank = (c: string) => `COALESCE(${c}, '') = ''`;
const zero = (c: string) => `COALESCE(${c}, 0) = 0`;

/** Provider exists but has no licence number (FDH DRDX / DROPID / PROVIDER). */
const noLicense = (col: string, alias: string) =>
  `(${col} <> '' AND EXISTS (SELECT 1 FROM doctor ${alias} WHERE ${alias}.code = ${col} AND ${blank(`${alias}.licenseno`)}))`;

/** Provider code blank or not in the doctor table (PROVIDER cross-file). */
const providerBad = (col: string, alias: string) =>
  `(${blank(col)} OR NOT EXISTS (SELECT 1 FROM doctor ${alias} WHERE ${alias}.code = ${col}))`;

/** pttype without a 4-digit INSTYPE code of the standard list. */
const instypeBad = (stdCol: string) =>
  `(${blank(stdCol)} OR NOT EXISTS (SELECT 1 FROM provis_instype pi WHERE pi.pttype_std_code = ${stdCol}))`;

/** ICD-10 categories that have sub-codes (code is not the most specific). */
const ICD_PARENTS = `(SELECT DISTINCT LEFT(code, LENGTH(code) - 1) AS pcode FROM icd101 WHERE LENGTH(code) >= 4)`;
/** Female-only / male-only ICD-10 groups (pregnancy, female/male genital organs). */
const FEMALE_DX = `'^(O|C5[1-8]|N7[0-9]|N8|N9[0-8]|D2[5-8]|Z3[2-7]|Z39)'`;
const MALE_DX = `'^(C6[0-3]|N4[0-9]|N5[01]|D29|D40)'`;
const ageYears = (birth: string, at: string) => `TIMESTAMPDIFF(YEAR, ${birth}, ${at})`;

// ---------------------------------------------------------------- PERSON / ADDRESS
const PERSON_CHECKS: F43CheckSql[] = [
  { id: "person_no_person", expr: "pp.hn IS NULL" },
  { id: "person_multi_person", expr: "pp.n > 1" },
  { id: "person_cid_format", expr: cidFormatBad("p.cid") },
  { id: "person_cid_checksum", expr: cidChecksumBad("p.cid") },
  {
    id: "person_cid_dup",
    expr: "p.cid REGEXP '^[0-9]{13}$' AND EXISTS (SELECT 1 FROM patient p2 WHERE p2.cid = p.cid AND p2.hn <> p.hn)",
  },
  { id: "person_cid_mismatch", expr: "ps.person_id IS NOT NULL AND COALESCE(ps.cid, '') <> COALESCE(p.cid, '')" },
  {
    id: "person_birth",
    expr: "COALESCE(ps.birthdate, p.birthday) IS NULL OR COALESCE(ps.birthdate, p.birthday) < '1900-01-01' OR COALESCE(ps.birthdate, p.birthday) > CURDATE()",
  },
  { id: "person_birth_mismatch", expr: "ps.birthdate IS NOT NULL AND p.birthday IS NOT NULL AND ps.birthdate <> p.birthday" },
  { id: "person_sex", expr: "COALESCE(ps.sex, p.sex, '') NOT IN ('1', '2')" },
  { id: "person_nation", expr: `${blank("COALESCE(ps.nationality, p.nationality)")} OR n.nationality IS NULL` },
  { id: "person_typearea", expr: "COALESCE(ps.house_regist_type_id, '') NOT IN ('1', '2', '3', '4', '5')" },
  { id: "person_village", expr: `ps.house_regist_type_id IN ('1', '3') AND ${zero("ps.village_id")}` },
  { id: "person_occupation", expr: blank("COALESCE(ps.occupation, p.occupation)") },
  { id: "person_education", expr: blank("ps.education") },
  { id: "person_marry", expr: blank("COALESCE(ps.marrystatus, p.marrystatus)") },
  { id: "person_religion", expr: blank("COALESCE(ps.religion, p.religion)") },
  { id: "person_pname", expr: blank("p.pname") },
  { id: "person_death_date", expr: "p.death = 'Y' AND p.deathday IS NULL" },
  {
    id: "address_out_area",
    expr: `ps.house_regist_type_id IN ('3', '4') AND (${blank("p.tmbpart")} OR ${blank("p.amppart")} OR ${blank("p.chwpart")})`,
  },
  { id: "address_changwat", expr: `${blank("p.chwpart")}` },
  { id: "pat_amphur", expr: `${blank("p.amppart")}` },
];

const PERSON_SQL = distinctQuery(
  "person",
  `v AS (
  SELECT DISTINCT COALESCE(o.main_dep, '') AS dep, o.hn
  FROM ovst o
  WHERE ${IN_MONTH("o.vstdate")}
),
h AS (SELECT DISTINCT hn FROM v),
pp AS (
  SELECT ps0.patient_hn AS hn, COUNT(*) AS n, MIN(ps0.person_id) AS pid
  FROM h JOIN person ps0 ON ps0.patient_hn = h.hn
  GROUP BY ps0.patient_hn
)`,
  "hn",
  `FROM h k
  LEFT JOIN patient p ON p.hn = k.hn
  LEFT JOIN pp ON pp.hn = k.hn
  LEFT JOIN person ps ON ps.person_id = pp.pid
  LEFT JOIN nationality n ON n.nationality = COALESCE(ps.nationality, p.nationality)`,
  PERSON_CHECKS,
);

// ---------------------------------------------------------------- PROVIDER
const PROVIDER_CHECKS: F43CheckSql[] = [
  { id: "prov_nomatch", expr: "d.code IS NULL" },
  { id: "prov_cid", expr: `d.code IS NOT NULL AND (${cidFormatBad("d.cid")} OR ${cidChecksumBad("d.cid")})` },
  { id: "prov_type", expr: `d.code IS NOT NULL AND (${blank("d.provider_type_code")} OR t.provider_type_code IS NULL)` },
  { id: "prov_license", expr: `d.provider_type_code IN ('01', '02', '03') AND ${blank("d.licenseno")}` },
  { id: "prov_council", expr: `d.provider_type_code IN ('01', '02', '03') AND ${blank("d.council_code")}` },
  { id: "prov_sex", expr: "d.code IS NOT NULL AND COALESCE(d.sex, '') NOT IN ('1', '2')" },
  { id: "prov_birth", expr: "d.code IS NOT NULL AND d.birth_date IS NULL" },
  { id: "prov_start", expr: "d.code IS NOT NULL AND d.start_date IS NULL" },
];

const PROVIDER_SQL = distinctQuery(
  "provider",
  `v AS (
  SELECT u.dep, u.code FROM (
    SELECT COALESCE(o.main_dep, '') AS dep, o.doctor AS code
    FROM ovst o WHERE ${IN_MONTH("o.vstdate")}
    UNION
    SELECT COALESCE(o.main_dep, ''), x.doctor
    FROM ovstdiag x JOIN ovst o ON o.vn = x.vn
    WHERE ${IN_MONTH("x.vstdate")}
    UNION
    SELECT COALESCE(o.main_dep, ''), op.doctor
    FROM ovst o JOIN doctor_operation op ON op.vn = o.vn
    WHERE ${IN_MONTH("o.vstdate")}
  ) u
  WHERE COALESCE(u.code, '') <> ''
),
c AS (SELECT DISTINCT code FROM v)`,
  "code",
  `FROM c k
  LEFT JOIN doctor d ON d.code = k.code
  LEFT JOIN provider_type t ON t.provider_type_code = d.provider_type_code`,
  PROVIDER_CHECKS,
);

// ---------------------------------------------------------------- SERVICE
const SERVICE_CHECKS: F43CheckSql[] = [
  { id: "svc_person", expr: "p.hn IS NULL" },
  { id: "svc_no_dx", expr: "NOT EXISTS (SELECT 1 FROM ovstdiag x1 WHERE x1.vn = o.vn)" },
  {
    id: "svc_no_pdx",
    expr: "EXISTS (SELECT 1 FROM ovstdiag x2 WHERE x2.vn = o.vn) AND NOT EXISTS (SELECT 1 FROM ovstdiag x3 WHERE x3.vn = o.vn AND x3.diagtype = '1')",
  },
  { id: "svc_multi_pdx", expr: "(SELECT COUNT(*) FROM ovstdiag x4 WHERE x4.vn = o.vn AND x4.diagtype = '1') > 1" },
  { id: "svc_pttype", expr: `${blank("o.pttype")} OR pt.pttype IS NULL` },
  { id: "svc_instype", expr: `pt.pttype IS NOT NULL AND ${instypeBad("pt.pttype_std_code")}` },
  { id: "svc_hospmain", expr: `pt.hipdata_code = 'UCS' AND ${blank("o.hospmain")}` },
  { id: "svc_typein", expr: blank("o.ovstist") },
  { id: "svc_typeout", expr: blank("o.ovstost") },
  { id: "svc_doctor", expr: providerBad("o.doctor", "dv") },
  { id: "opd_no_screen", expr: "s.vn IS NULL" },
  { id: "opd_cc", expr: `s.vn IS NOT NULL AND ${blank("s.cc")}` },
  { id: "opd_bp", expr: `s.vn IS NOT NULL AND (${zero("s.bps")} OR ${zero("s.bpd")})` },
  { id: "opd_temp", expr: `s.vn IS NOT NULL AND ${zero("s.temperature")}` },
  { id: "opd_pr", expr: `s.vn IS NOT NULL AND ${zero("s.pulse")}` },
  { id: "opd_rr", expr: `s.vn IS NOT NULL AND ${zero("s.rr")}` },
  { id: "opd_clinic", expr: blank("o.spclty") },
  { id: "ins_inscl", expr: `pt.pttype IS NOT NULL AND ${blank("pt.hipdata_code")}` },
  { id: "ins_permit", expr: `pt.hipdata_code IN ('OFC', 'LGO') AND ${blank("o.pttypeno")}` },
];

const SERVICE_SQL = query(
  "service",
  SERVICE_CHECKS,
  agg(
    "COALESCE(o.main_dep, '')",
    "CONCAT('u:', COALESCE(o.staff, ''))",
    SERVICE_CHECKS,
    `FROM ovst o
LEFT JOIN patient p ON p.hn = o.hn
LEFT JOIN pttype pt ON pt.pttype = o.pttype
LEFT JOIN opdscreen s ON s.vn = o.vn
WHERE ${IN_MONTH("o.vstdate")}`,
  ),
);

// ---------------------------------------------------------------- DIAGNOSIS_OPD
const DX_CHECKS: F43CheckSql[] = [
  { id: "dx_no_service", expr: "o.vn IS NULL" },
  { id: "dx_blank", expr: blank("x.icd10") },
  { id: "dx_nomatch", expr: "x.icd10 <> '' AND i.code IS NULL" },
  { id: "dx_inactive", expr: "i.active_status = 'N'" },
  { id: "dx_not_specific", expr: "i.code IS NOT NULL AND par.pcode IS NOT NULL" },
  { id: "dx_type", expr: "COALESCE(x.diagtype, '') NOT IN ('1', '2', '3', '4', '5', '6', '7')" },
  { id: "dx_pdx_ext", expr: "x.diagtype = '1' AND x.icd10 REGEXP '^[V-Y]'" },
  {
    id: "dx_ext_missing",
    expr: "x.diagtype = '1' AND x.icd10 REGEXP '^[ST]' AND NOT EXISTS (SELECT 1 FROM ovstdiag y WHERE y.vn = x.vn AND y.icd10 REGEXP '^[V-Y]')",
  },
  { id: "dx_provider", expr: providerBad("x.doctor", "dd") },
  {
    id: "dx_sex",
    expr: `(p.sex = '1' AND x.icd10 REGEXP ${FEMALE_DX}) OR (p.sex = '2' AND x.icd10 REGEXP ${MALE_DX})`,
  },
  {
    id: "dx_age_preg",
    expr: `x.icd10 LIKE 'O%' AND (${ageYears("p.birthday", "x.vstdate")} < 10 OR ${ageYears("p.birthday", "x.vstdate")} > 60)`,
  },
  { id: "odx_drdx", expr: noLicense("x.doctor", "dl1") },
  { id: "dx_age_perinatal", expr: `x.icd10 LIKE 'P%' AND ${ageYears("p.birthday", "x.vstdate")} >= 1` },
];

/** ovstdiag rows with a numeric code are procedures (PROCEDURE_OPD). */
const DX_SQL = query(
  "dx_opd",
  DX_CHECKS,
  agg(
    "COALESCE(o.main_dep, '')",
    "CONCAT('u:', COALESCE(x.staff, ''))",
    DX_CHECKS,
    `FROM ovstdiag x
LEFT JOIN ovst o ON o.vn = x.vn
LEFT JOIN patient p ON p.hn = x.hn
LEFT JOIN icd101 i ON i.code = x.icd10
LEFT JOIN ${ICD_PARENTS} par ON par.pcode = x.icd10
WHERE ${IN_MONTH("x.vstdate")}
  AND COALESCE(x.icd10, '') NOT REGEXP '^[0-9]'`,
  ),
);

// ---------------------------------------------------------------- PROCEDURE_OPD
const PROC_CHECKS: F43CheckSql[] = [
  { id: "proc_no_service", expr: "q.has_visit = 0" },
  { id: "proc_nomap", expr: "q.code IS NULL" },
  { id: "proc_nomatch", expr: "q.code IS NOT NULL AND c9.code IS NULL" },
  { id: "proc_provider", expr: providerBad("q.doctor", "dp") },
  { id: "oop_dropid", expr: noLicense("q.doctor", "dl2") },
];

/**
 * Two HOSxP sources: numeric codes in ovstdiag (ICD-9-CM keyed at the
 * diagnosis screen) and doctor_operation (หัตถการ/ER procedures; the code
 * is doctor_operation.icd9, else er_oper_code.icd9cm; '0' = none).
 */
const PROC_SQL = query(
  "proc_opd",
  PROC_CHECKS,
  agg(
    "q.dep",
    "q.rec",
    PROC_CHECKS,
    `FROM (
  SELECT COALESCE(o.main_dep, '') AS dep, CONCAT('u:', COALESCE(x.staff, '')) AS rec,
         x.icd10 AS code, x.doctor, o.vn IS NOT NULL AS has_visit
  FROM ovstdiag x
  LEFT JOIN ovst o ON o.vn = x.vn
  WHERE ${IN_MONTH("x.vstdate")} AND x.icd10 REGEXP '^[0-9]'
  UNION ALL
  SELECT COALESCE(o.main_dep, ''), CONCAT('u:', COALESCE(op.staff, '')),
         COALESCE(NULLIF(NULLIF(op.icd9, ''), '0'), NULLIF(NULLIF(e.icd9cm, ''), '0')),
         op.doctor, 1
  FROM ovst o
  JOIN doctor_operation op ON op.vn = o.vn
  LEFT JOIN er_oper_code e ON e.er_oper_code = op.er_oper_code
  WHERE ${IN_MONTH("o.vstdate")}
) q
LEFT JOIN icd9cm1 c9 ON c9.code = q.code`,
  ),
);

// ---------------------------------------------------------------- DRUG_OPD / CHARGE_OPD
const DRUG_OPD_CHECKS: F43CheckSql[] = [
  { id: "drug_no_service", expr: "o.vn IS NULL" },
  { id: "drug_did", expr: `${blank("d.did")} OR d.did NOT REGEXP '^[0-9]{24}$'` },
  { id: "drug_unit", expr: blank("d.provis_medication_unit_code") },
  { id: "drug_qty", expr: "oi.qty IS NULL OR oi.qty <= 0" },
  { id: "drug_price", expr: "oi.unitprice IS NULL OR oi.unitprice < 0" },
  { id: "drug_provider", expr: providerBad("oi.doctor", "dr") },
  { id: "dru_sig", expr: blank("oi.drugusage") },
  { id: "dru_provider_lic", expr: noLicense("oi.doctor", "dl3") },
];

/** STRAIGHT_JOIN: drive from opitemrece by vstdate (else the optimizer starts from drugitems and times out). */
const DRUG_OPD_SQL = query(
  "drug_opd",
  DRUG_OPD_CHECKS,
  agg(
    "COALESCE(o.main_dep, '')",
    "CONCAT('u:', COALESCE(oi.staff, ''))",
    DRUG_OPD_CHECKS,
    `FROM opitemrece oi
JOIN drugitems d ON d.icode = oi.icode
LEFT JOIN ovst o ON o.vn = oi.vn
WHERE ${IN_MONTH("oi.vstdate")} AND oi.an IS NULL`,
    "STRAIGHT_JOIN ",
  ),
);

const CHARGE_OPD_CHECKS: F43CheckSql[] = [
  { id: "chg_no_service", expr: "o.vn IS NULL" },
  { id: "chg_item", expr: `${blank("oi.income")} OR inc.income IS NULL OR ${blank("inc.std_group")}` },
  { id: "chg_price", expr: "oi.sum_price IS NULL OR oi.sum_price < 0" },
  { id: "chg_instype", expr: `${blank("oi.pttype")} OR pt.pttype IS NULL OR ${instypeBad("pt.pttype_std_code")}` },
];

const CHARGE_OPD_SQL = query(
  "charge_opd",
  CHARGE_OPD_CHECKS,
  agg(
    "COALESCE(o.main_dep, '')",
    "CONCAT('u:', COALESCE(oi.staff, ''))",
    CHARGE_OPD_CHECKS,
    `FROM opitemrece oi
LEFT JOIN ovst o ON o.vn = oi.vn
LEFT JOIN income inc ON inc.income = oi.income
LEFT JOIN pttype pt ON pt.pttype = oi.pttype
WHERE ${IN_MONTH("oi.vstdate")} AND oi.an IS NULL`,
    "STRAIGHT_JOIN ",
  ),
);

// ---------------------------------------------------------------- ACCIDENT
const ACC_CHECKS: F43CheckSql[] = [
  { id: "acc_no_record", expr: "e.vn IS NULL" },
  { id: "acc_datetime", expr: "e.vn IS NOT NULL AND e.accident_datetime IS NULL" },
  { id: "acc_place", expr: "e.vn IS NOT NULL AND e.accident_place_type_id IS NULL" },
  { id: "acc_type", expr: "e.vn IS NOT NULL AND e.er_accident_type_id IS NULL" },
  { id: "acc_transport", expr: "e.vn IS NOT NULL AND e.accident_transport_type_id IS NULL" },
];

/** Visits whose principal diagnosis is an injury (S00–T98). */
const ACC_SQL = query(
  "accident",
  ACC_CHECKS,
  agg(
    "COALESCE(o.main_dep, '')",
    "CONCAT('u:', COALESCE(o.staff, ''))",
    ACC_CHECKS,
    `FROM ovst o
LEFT JOIN er_nursing_detail e ON e.vn = o.vn
WHERE ${IN_MONTH("o.vstdate")}
  AND EXISTS (SELECT 1 FROM ovstdiag x WHERE x.vn = o.vn AND x.diagtype = '1' AND x.icd10 REGEXP '^[ST]')`,
  ),
);

// ---------------------------------------------------------------- APPOINTMENT
const APP_CHECKS: F43CheckSql[] = [
  { id: "app_no_service", expr: "o.vn IS NULL" },
  { id: "app_nextdate", expr: "a.nextdate IS NULL OR a.nextdate < a.vstdate" },
  { id: "app_type", expr: blank("a.provis_aptype_code") },
  { id: "app_provider", expr: providerBad("a.doctor", "da") },
];

const APP_SQL = query(
  "appointment",
  APP_CHECKS,
  agg(
    "COALESCE(o.main_dep, '')",
    "CONCAT('u:', COALESCE(a.app_user, ''))",
    APP_CHECKS,
    `FROM oapp a
LEFT JOIN ovst o ON o.vn = a.vn
WHERE ${IN_MONTH("a.vstdate")}`,
  ),
);

// ---------------------------------------------------------------- LABFU
const LAB_CHECKS: F43CheckSql[] = [{ id: "lab_result", expr: blank("lo.lab_order_result") }];

/** OPD lab orders of items mapped to a 43-file lab code (lab_items.provis_labcode). */
const LAB_SQL = query(
  "labfu",
  LAB_CHECKS,
  agg(
    "COALESCE(o.main_dep, '')",
    "CONCAT('u:', COALESCE(lo.staff, ''))",
    LAB_CHECKS,
    `FROM lab_head h
JOIN ovst o ON o.vn = h.vn
JOIN lab_order lo ON lo.lab_order_number = h.lab_order_number
JOIN lab_items li ON li.lab_items_code = lo.lab_items_code
WHERE ${IN_MONTH("h.order_date")} AND COALESCE(li.provis_labcode, '') <> ''`,
  ),
);

// ---------------------------------------------------------------- IPD
const IPD_FROM = `FROM ipt i
WHERE ${IN_MONTH("i.dchdate")}`;

const ADM_CHECKS: F43CheckSql[] = [
  { id: "adm_no_service", expr: "NOT EXISTS (SELECT 1 FROM ovst o WHERE o.vn = i.vn)" },
  { id: "adm_dch_before", expr: "i.dchdate < i.regdate OR (i.dchdate = i.regdate AND i.dchtime < i.regtime)" },
  { id: "adm_future", expr: "i.dchdate > CURDATE()" },
  { id: "adm_dchstts", expr: blank("i.dchstts") },
  { id: "adm_dchtype", expr: blank("i.dchtype") },
  { id: "adm_ward", expr: blank("i.ward") },
  { id: "adm_no_pdx", expr: "NOT EXISTS (SELECT 1 FROM iptdiag d1 WHERE d1.an = i.an AND d1.diagtype = '1')" },
  { id: "adm_multi_pdx", expr: "(SELECT COUNT(*) FROM iptdiag d2 WHERE d2.an = i.an AND d2.diagtype = '1') > 1" },
  { id: "adm_instype", expr: `NOT EXISTS (SELECT 1 FROM pttype pt WHERE pt.pttype = i.pttype AND NOT ${instypeBad("pt.pttype_std_code")})` },
  { id: "adm_dchdoc", expr: providerBad("i.dch_doctor", "dh") },
  { id: "adm_admdoc", expr: blank("i.admdoctor") },
];

const ADM_SQL = query(
  "admission",
  ADM_CHECKS,
  agg("'IPD'", "CONCAT('u:', COALESCE(i.staff, ''))", ADM_CHECKS, IPD_FROM),
);

const DX_IPD_CHECKS: F43CheckSql[] = [
  { id: "dxi_blank", expr: blank("d.icd10") },
  { id: "dxi_nomatch", expr: "d.icd10 <> '' AND c.code IS NULL" },
  { id: "dxi_not_specific", expr: "c.code IS NOT NULL AND par.pcode IS NOT NULL" },
  { id: "dxi_type", expr: "COALESCE(d.diagtype, '') NOT IN ('1', '2', '3', '4', '5', '6', '7')" },
  { id: "dxi_pdx_ext", expr: "d.diagtype = '1' AND d.icd10 REGEXP '^[V-Y]'" },
  {
    id: "dxi_ext_missing",
    expr: "d.diagtype = '1' AND d.icd10 REGEXP '^[ST]' AND NOT EXISTS (SELECT 1 FROM iptdiag y WHERE y.an = d.an AND y.icd10 REGEXP '^[V-Y]')",
  },
  { id: "dxi_provider", expr: providerBad("d.doctor", "dq") },
  {
    id: "dxi_sex",
    expr: `(p.sex = '1' AND d.icd10 REGEXP ${FEMALE_DX}) OR (p.sex = '2' AND d.icd10 REGEXP ${MALE_DX})`,
  },
];

const DX_IPD_SQL = query(
  "dx_ipd",
  DX_IPD_CHECKS,
  agg(
    "'IPD'",
    "CONCAT('u:', COALESCE(d.staff, ''))",
    DX_IPD_CHECKS,
    `FROM ipt i
JOIN iptdiag d ON d.an = i.an
LEFT JOIN patient p ON p.hn = i.hn
LEFT JOIN icd101 c ON c.code = d.icd10
LEFT JOIN ${ICD_PARENTS} par ON par.pcode = d.icd10
WHERE ${IN_MONTH("i.dchdate")}`,
  ),
);

const PROC_IPD_CHECKS: F43CheckSql[] = [
  { id: "proci_blank", expr: `${blank("op.icd9")} OR op.icd9 = '0'` },
  { id: "proci_nomatch", expr: "op.icd9 NOT IN ('', '0') AND c9.code IS NULL" },
  { id: "proci_provider", expr: providerBad("op.doctor", "dz") },
  { id: "proci_date", expr: "op.opdate IS NULL OR op.opdate < i.regdate OR op.opdate > i.dchdate" },
];

const PROC_IPD_SQL = query(
  "proc_ipd",
  PROC_IPD_CHECKS,
  agg(
    "'IPD'",
    "CONCAT('u:', COALESCE(op.staff, ''))",
    PROC_IPD_CHECKS,
    `FROM ipt i
JOIN iptoprt op ON op.an = i.an
LEFT JOIN icd9cm1 c9 ON c9.code = op.icd9
WHERE ${IN_MONTH("i.dchdate")}`,
  ),
);

const DRUG_IPD_CHECKS: F43CheckSql[] = [
  { id: "drugi_did", expr: `${blank("d.did")} OR d.did NOT REGEXP '^[0-9]{24}$'` },
  { id: "drugi_unit", expr: blank("d.provis_medication_unit_code") },
  { id: "drugi_qty", expr: "oi.qty IS NULL OR oi.qty <= 0" },
  { id: "drugi_provider", expr: providerBad("oi.doctor", "dy") },
];

const DRUG_IPD_SQL = query(
  "drug_ipd",
  DRUG_IPD_CHECKS,
  agg(
    "'IPD'",
    "CONCAT('u:', COALESCE(oi.staff, ''))",
    DRUG_IPD_CHECKS,
    `FROM ipt i
JOIN opitemrece oi ON oi.an = i.an
JOIN drugitems d ON d.icode = oi.icode
WHERE ${IN_MONTH("i.dchdate")}`,
    "STRAIGHT_JOIN ",
  ),
);

const CHARGE_IPD_CHECKS: F43CheckSql[] = [
  { id: "chgi_item", expr: `${blank("oi.income")} OR inc.income IS NULL OR ${blank("inc.std_group")}` },
  { id: "chgi_price", expr: "oi.sum_price IS NULL OR oi.sum_price < 0" },
];

const CHARGE_IPD_SQL = query(
  "charge_ipd",
  CHARGE_IPD_CHECKS,
  agg(
    "'IPD'",
    "CONCAT('u:', COALESCE(oi.staff, ''))",
    CHARGE_IPD_CHECKS,
    `FROM ipt i
JOIN opitemrece oi ON oi.an = i.an
LEFT JOIN income inc ON inc.income = oi.income
WHERE ${IN_MONTH("i.dchdate")}`,
    "STRAIGHT_JOIN ",
  ),
);

const LABOR_CHECKS: F43CheckSql[] = [
  { id: "labor_lmp", expr: "l.lmp IS NULL" },
  { id: "labor_ga", expr: `${zero("l.ga")} OR l.ga < 20 OR l.ga > 45` },
  { id: "labor_gravida", expr: `${zero("l.g")} AND ${zero("l.preg_no")}` },
  { id: "labor_type", expr: "l.labour_type_id IS NULL AND l.delivery_type_id IS NULL" },
  { id: "labor_place", expr: "l.ipt_labour_place_id IS NULL AND l.labour_place_id IS NULL" },
];

const LABOR_SQL = query(
  "labor",
  LABOR_CHECKS,
  agg(
    "'IPD'",
    "CONCAT('u:', COALESCE(l.entry_staff, ''))",
    LABOR_CHECKS,
    `FROM ipt i
JOIN ipt_labour l ON l.an = i.an
WHERE ${IN_MONTH("i.dchdate")}`,
  ),
);

const NEWBORN_CHECKS: F43CheckSql[] = [
  { id: "nb_bw", expr: `${zero("f.birth_weight")} OR f.birth_weight > 7000` },
  { id: "nb_sex", expr: "COALESCE(f.sex, '') NOT IN ('1', '2')" },
  { id: "nb_birth", expr: "f.birth_date IS NULL" },
  { id: "nb_apgar", expr: "f.apgar_score_min1 IS NULL OR f.apgar_score_min5 IS NULL" },
  { id: "nb_ga", expr: zero("f.ga") },
];

const NEWBORN_SQL = query(
  "newborn",
  NEWBORN_CHECKS,
  agg(
    "'IPD'",
    "CONCAT('u:', COALESCE(f.entry_staff, ''))",
    NEWBORN_CHECKS,
    `FROM ipt i
JOIN ipt_labour l ON l.an = i.an
JOIN ipt_labour_infant f ON f.ipt_labour_id = l.ipt_labour_id
WHERE ${IN_MONTH("i.dchdate")}`,
  ),
);

// ---------------------------------------------------------------- PP files (visit-based)
const EPI_CHECKS: F43CheckSql[] = [
  { id: "epi_code", expr: `pv.person_vaccine_id IS NULL OR ${blank("pv.export_vaccine_code")}` },
  { id: "epi_lot", expr: blank("v.vaccine_lot_no") },
  { id: "epi_expired", expr: "v.expire_date IS NOT NULL AND v.expire_date < o.vstdate" },
  { id: "epi_provider", expr: providerBad("v.doctor_code", "de") },
];

const EPI_SQL = query(
  "epi",
  EPI_CHECKS,
  agg(
    "COALESCE(o.main_dep, '')",
    "CONCAT('u:', COALESCE(v.staff, ''))",
    EPI_CHECKS,
    `FROM ovst o
JOIN ovst_vaccine v ON v.vn = o.vn
LEFT JOIN person_vaccine pv ON pv.person_vaccine_id = v.person_vaccine_id
WHERE ${IN_MONTH("o.vstdate")}`,
  ),
);

const ANC_CHECKS: F43CheckSql[] = [
  { id: "anc_no_service", expr: "o.vn IS NULL" },
  { id: "anc_ga", expr: `${zero("s.pa_week")} OR s.pa_week > 45` },
  { id: "anc_no", expr: zero("s.anc_service_number") },
  { id: "anc_result", expr: blank("s.service_result") },
  { id: "pre_lmp", expr: "a.lmp IS NULL" },
  { id: "pre_edc", expr: "a.edc IS NULL OR (a.lmp IS NOT NULL AND a.edc <= a.lmp)" },
  { id: "pre_gravida", expr: zero("a.preg_no") },
];

/** ANC visits of the month; PRENATAL checks are on their pregnancy (person_anc). */
const ANC_SQL = query(
  "anc",
  ANC_CHECKS,
  agg(
    "COALESCE(o.main_dep, '')",
    "''",
    ANC_CHECKS,
    `FROM person_anc_service s
JOIN person_anc a ON a.person_anc_id = s.person_anc_id
LEFT JOIN ovst o ON o.vn = s.vn
WHERE ${IN_MONTH("s.anc_service_date")}`,
  ),
);

const DENTAL_CHECKS: F43CheckSql[] = [
  { id: "dent_type", expr: "dc.dental_care_type_id IS NULL" },
  { id: "dent_place", expr: "dc.dental_care_service_place_type_id IS NULL" },
  { id: "dent_teeth", expr: `${zero("dc.pteeth")} AND ${zero("dc.dteeth")}` },
  { id: "dent_caries", expr: "dc.pcaries > dc.pteeth OR dc.dcaries > dc.dteeth" },
  { id: "dent_provider", expr: providerBad("dc.doctor", "dt") },
];

const DENTAL_SQL = query(
  "dental",
  DENTAL_CHECKS,
  agg(
    "COALESCE(o.main_dep, '')",
    "CONCAT('d:', COALESCE(dc.doctor, ''))",
    DENTAL_CHECKS,
    `FROM ovst o
JOIN dental_care dc ON dc.vn = o.vn
WHERE ${IN_MONTH("o.vstdate")}`,
  ),
);

const SPP_CHECKS: F43CheckSql[] = [
  { id: "spp_code", expr: `t.pp_special_type_id IS NULL OR (${blank("sp.pp_special_code")} AND ${blank("t.pp_special_code")})` },
  { id: "spp_place", expr: "sp.pp_special_service_place_type_id IS NULL" },
  { id: "spp_provider", expr: providerBad("sp.doctor", "ds") },
];

const SPP_SQL = query(
  "specialpp",
  SPP_CHECKS,
  agg(
    "COALESCE(o.main_dep, '')",
    "CONCAT('d:', COALESCE(sp.doctor, ''))",
    SPP_CHECKS,
    `FROM ovst o
JOIN pp_special sp ON sp.vn = o.vn
LEFT JOIN pp_special_type t ON t.pp_special_type_id = sp.pp_special_type_id
WHERE ${IN_MONTH("o.vstdate")}`,
  ),
);

const NUTRI_CHECKS: F43CheckSql[] = [
  { id: "nutri_weight", expr: `${zero("nu.body_weight")} OR nu.body_weight > 150` },
  { id: "nutri_height", expr: `${zero("nu.height")} OR nu.height > 230` },
  { id: "nutri_level", expr: "nu.nutrition_level IS NULL" },
  { id: "nutri_develop", expr: "nu.person_nutrition_childdevelop_type_id IS NULL" },
];

const NUTRI_SQL = query(
  "nutrition",
  NUTRI_CHECKS,
  agg(
    "COALESCE(o.main_dep, '')",
    "CONCAT('d:', COALESCE(nu.doctor_code, ''))",
    NUTRI_CHECKS,
    `FROM person_wbc_nutrition nu
LEFT JOIN ovst o ON o.vn = nu.vn
WHERE ${IN_MONTH("nu.nutrition_date")}`,
  ),
);

const FP_CHECKS: F43CheckSql[] = [
  { id: "fp_no_service", expr: "o.vn IS NULL" },
  { id: "fp_provider", expr: providerBad("ws.doctor_code", "dw") },
];

/** Women services with a contraception method (FP). */
const FP_SQL = query(
  "fp",
  FP_CHECKS,
  agg(
    "COALESCE(o.main_dep, '')",
    "''",
    FP_CHECKS,
    `FROM person_women_service ws
LEFT JOIN ovst o ON o.vn = ws.vn
WHERE ${IN_MONTH("ws.service_date")} AND ws.women_birth_control_id IS NOT NULL`,
  ),
);

const SURV_CHECKS: F43CheckSql[] = [
  { id: "surv_code506", expr: blank("sv.code506") },
  { id: "surv_pdx", expr: blank("sv.pdx") },
  { id: "surv_begin", expr: "sv.begin_date IS NULL OR sv.begin_date > sv.vstdate" },
  { id: "surv_ptstat", expr: blank("sv.ptstat") },
  { id: "surv_area", expr: `${blank("sv.tmbpart")} OR ${blank("sv.amppart")} OR ${blank("sv.chwpart")}` },
];

const SURV_SQL = query(
  "surveillance",
  SURV_CHECKS,
  agg(
    "COALESCE(o.main_dep, '')",
    "CONCAT('u:', COALESCE(sv.staff, ''))",
    SURV_CHECKS,
    `FROM surveil_member sv
LEFT JOIN ovst o ON o.vn = sv.vn
WHERE ${IN_MONTH("sv.vstdate")}`,
  ),
);

const COMM_CHECKS: F43CheckSql[] = [
  {
    id: "comm_code",
    expr: `${blank("cs.ovst_community_service_type_code")} AND ${blank("ct.ovst_community_service_type_code")}`,
  },
  { id: "comm_provider", expr: providerBad("cs.doctor", "dc2") },
];

const COMM_SQL = query(
  "community_service",
  COMM_CHECKS,
  agg(
    "COALESCE(o.main_dep, '')",
    "CONCAT('d:', COALESCE(cs.doctor, ''))",
    COMM_CHECKS,
    `FROM ovst o
JOIN ovst_community_service cs ON cs.vn = o.vn
LEFT JOIN ovst_community_service_type ct ON ct.ovst_community_service_type_id = cs.ovst_community_service_type_id
WHERE ${IN_MONTH("o.vstdate")}`,
  ),
);

const ALLERGY_CHECKS: F43CheckSql[] = [
  { id: "alg_code24", expr: `${blank("al.agent_code24")} OR al.agent_code24 NOT REGEXP '^[0-9]{24}$'` },
  { id: "alg_level", expr: "al.seriousness_id IS NULL" },
  { id: "alg_type", expr: "al.opd_allergy_type_id IS NULL AND al.allergy_type IS NULL" },
  { id: "alg_informant", expr: "al.allergy_relation_id IS NULL" },
];

/** Drug allergies reported in the month; unit = opd_allergy.depcode (reporting point). */
const ALLERGY_SQL = query(
  "drugallergy",
  ALLERGY_CHECKS,
  agg(
    "COALESCE(al.depcode, '')",
    "''",
    ALLERGY_CHECKS,
    `FROM opd_allergy al
WHERE ${IN_MONTH("al.report_date")}`,
  ),
);

// ---------------------------------------------------------------- whole-hospital files
const DEATH_CHECKS: F43CheckSql[] = [
  { id: "death_cause", expr: `${blank("dt.death_diag_1")} AND ${blank("dt.death_diag_icd10")}` },
  { id: "death_place", expr: blank("dt.death_place") },
  { id: "death_future", expr: "dt.death_date > CURDATE()" },
  { id: "death_patient", expr: "NOT EXISTS (SELECT 1 FROM patient p WHERE p.hn = dt.hn AND p.death = 'Y')" },
];

const DEATH_SQL = query(
  "death",
  DEATH_CHECKS,
  agg(
    "'*'",
    "CONCAT('u:', COALESCE(dt.staff, ''))",
    DEATH_CHECKS,
    `FROM death dt
WHERE ${IN_MONTH("dt.death_date")}`,
  ),
);

const CHRONIC_CHECKS: F43CheckSql[] = [
  { id: "chr_dxdate", expr: "m.dx_date IS NULL AND m.regdate IS NULL" },
  { id: "chr_dxdate_future", expr: "COALESCE(m.dx_date, m.regdate) > CURDATE()" },
  { id: "chr_status", expr: "m.clinic_member_status_id IS NULL" },
  { id: "chr_icd", expr: blank("m.ncd_icd10_list") },
];

/** Chronic-clinic memberships (clinic.chronic = 'Y') of patients seen in the month. */
const CHRONIC_SQL = query(
  "chronic",
  CHRONIC_CHECKS,
  agg(
    "'*'",
    "''",
    CHRONIC_CHECKS,
    `FROM (SELECT DISTINCT o.hn FROM ovst o WHERE ${IN_MONTH("o.vstdate")}) h
JOIN clinicmember m ON m.hn = h.hn
JOIN clinic c ON c.clinic = m.clinic AND c.chronic = 'Y'`,
  ),
);

const NCD_CHECKS: F43CheckSql[] = [
  { id: "ncd_weight", expr: zero("ns.body_weight") },
  { id: "ncd_height", expr: zero("ns.body_height") },
  { id: "ncd_height_bad", expr: "ns.body_height > 0 AND (ns.body_height < 50 OR ns.body_height > 230)" },
  { id: "ncd_waist", expr: zero("ns.waist") },
  { id: "ncd_bp", expr: `${zero("ns.last_bps")} OR ${zero("ns.last_bpd")}` },
  { id: "ncd_bp_bad", expr: "ns.last_bps > 0 AND ns.last_bps <= ns.last_bpd" },
  { id: "ncd_sugar", expr: `${zero("ns.last_fpg")} AND ${zero("ns.last_fgc")}` },
  { id: "ncd_provider", expr: blank("ns.doctor_code") },
];

/** DM/HT risk screening (person_dmht_risk_screen_head has no visit: whole hospital). */
const NCD_SQL = query(
  "ncdscreen",
  NCD_CHECKS,
  agg(
    "'*'",
    "CONCAT('u:', COALESCE(ns.staff, ''))",
    NCD_CHECKS,
    `FROM person_dmht_risk_screen_head ns
WHERE ${IN_MONTH("ns.screen_date")}`,
  ),
);

// ---------------------------------------------------------------- ADP (FDH)
const ADP_CHECKS: F43CheckSql[] = [
  { id: "adp_code", expr: `nd.nhso_adp_type_id IS NOT NULL AND ${blank("nd.nhso_adp_code")}` },
  { id: "adp_qty", expr: "oi.qty IS NULL OR oi.qty <= 0" },
];

/** Non-drug OPD items (nondrugitems): FDH ADP needs the NHSO ADP type + code. */
const ADP_SQL = query(
  "adp",
  ADP_CHECKS,
  agg(
    "COALESCE(o.main_dep, '')",
    "CONCAT('u:', COALESCE(oi.staff, ''))",
    ADP_CHECKS,
    `FROM opitemrece oi
JOIN nondrugitems nd ON nd.icode = oi.icode
LEFT JOIN ovst o ON o.vn = oi.vn
WHERE ${IN_MONTH("oi.vstdate")} AND oi.an IS NULL`,
    "STRAIGHT_JOIN ",
  ),
);

// ---------------------------------------------------------------- CHRONICFU
const CFU_CHECKS: F43CheckSql[] = [
  { id: "cfu_no_screen", expr: "s.vn IS NULL" },
  { id: "cfu_weight", expr: `s.vn IS NOT NULL AND ${zero("s.bw")}` },
  { id: "cfu_height", expr: `s.vn IS NOT NULL AND ${zero("s.height")}` },
  { id: "cfu_waist", expr: `s.vn IS NOT NULL AND ${zero("s.waist")}` },
  { id: "cfu_bp", expr: `s.vn IS NOT NULL AND (${zero("s.bps")} OR ${zero("s.bpd")})` },
];

/** Visits of chronic-clinic members (clinic.chronic = 'Y') with DM/HT principal Dx. */
const CFU_SQL = query(
  "chronicfu",
  CFU_CHECKS,
  agg(
    "COALESCE(o.main_dep, '')",
    "CONCAT('u:', COALESCE(o.staff, ''))",
    CFU_CHECKS,
    `FROM ovst o
LEFT JOIN opdscreen s ON s.vn = o.vn
WHERE ${IN_MONTH("o.vstdate")}
  AND EXISTS (SELECT 1 FROM ovstdiag x WHERE x.vn = o.vn AND x.diagtype = '1' AND x.icd10 REGEXP '^(E1[0-4]|I1[0-5])')
  AND EXISTS (SELECT 1 FROM clinicmember m JOIN clinic c ON c.clinic = m.clinic AND c.chronic = 'Y' WHERE m.hn = o.hn)`,
  ),
);

// ---------------------------------------------------------------- POSTNATAL / NEWBORNCARE
const PNC_CHECKS: F43CheckSql[] = [
  { id: "pnc_place", expr: "pc.anc_preg_care_location_id IS NULL" },
  { id: "pnc_provider", expr: providerBad("pc.doctor_code", "dpn") },
  { id: "pnc_no_service", expr: "o.vn IS NULL" },
];

const PNC_SQL = query(
  "postnatal",
  PNC_CHECKS,
  agg(
    "COALESCE(o.main_dep, '')",
    "CONCAT('d:', COALESCE(pc.doctor_code, ''))",
    PNC_CHECKS,
    `FROM person_anc_preg_care pc
LEFT JOIN ovst o ON o.vn = pc.vn
WHERE ${IN_MONTH("pc.care_date")}`,
  ),
);

const NBC_CHECKS: F43CheckSql[] = [
  { id: "nbc_place", expr: "wc.anc_preg_care_location_id IS NULL" },
  { id: "nbc_result", expr: "wc.person_wbc_post_care_result_type_id IS NULL" },
  { id: "nbc_provider", expr: providerBad("wc.doctor_code", "dnb") },
];

/** person_wbc_post_care has no visit: whole hospital. */
const NBC_SQL = query(
  "newborncare",
  NBC_CHECKS,
  agg(
    "'*'",
    "CONCAT('d:', COALESCE(wc.doctor_code, ''))",
    NBC_CHECKS,
    `FROM person_wbc_post_care wc
WHERE ${IN_MONTH("wc.care_date")}`,
  ),
);

// ---------------------------------------------------------------- REHABILITATION / FUNCTIONAL / ICF
const REHAB_CHECKS: F43CheckSql[] = [
  { id: "rehab_code", expr: "pl.physic_items_id IS NULL" },
  { id: "rehab_provider", expr: providerBad("pl.doctor", "drh") },
];

const REHAB_SQL = query(
  "rehabilitation",
  REHAB_CHECKS,
  agg(
    "COALESCE(o.main_dep, '')",
    "CONCAT('d:', COALESCE(pl.doctor, ''))",
    REHAB_CHECKS,
    `FROM ovst o
JOIN physic_list pl ON pl.vn = o.vn
WHERE ${IN_MONTH("o.vstdate")}`,
  ),
);

const FUNC_CHECKS: F43CheckSql[] = [
  { id: "func_type", expr: "fn.ovst_functional_type_id IS NULL" },
  { id: "func_dependent", expr: "fn.ovst_functional_dependent_type_id IS NULL" },
  { id: "func_score", expr: "fn.ovst_functional_score IS NULL" },
  { id: "func_provider", expr: providerBad("fn.doctor", "dfn") },
];

const FUNC_SQL = query(
  "functional",
  FUNC_CHECKS,
  agg(
    "COALESCE(o.main_dep, '')",
    "CONCAT('d:', COALESCE(fn.doctor, ''))",
    FUNC_CHECKS,
    `FROM ovst o
JOIN ovst_functional fn ON fn.vn = o.vn
WHERE ${IN_MONTH("o.vstdate")}`,
  ),
);

const ICF_CHECKS: F43CheckSql[] = [
  { id: "icf_code", expr: "ic.ovst_icf_type_id IS NULL" },
  { id: "icf_level", expr: "ic.ovst_icf_level_type_id IS NULL" },
  { id: "icf_provider", expr: providerBad("ic.doctor", "dic") },
];

const ICF_SQL = query(
  "icf",
  ICF_CHECKS,
  agg(
    "COALESCE(o.main_dep, '')",
    "CONCAT('d:', COALESCE(ic.doctor, ''))",
    ICF_CHECKS,
    `FROM ovst o
JOIN ovst_icf ic ON ic.vn = o.vn
WHERE ${IN_MONTH("o.vstdate")}`,
  ),
);

// ---------------------------------------------------------------- COMMUNITY_ACTIVITY
const CA_CHECKS: F43CheckSql[] = [
  { id: "ca_type", expr: "va.village_community_activity_type_id IS NULL" },
  { id: "ca_village", expr: zero("va.village_id") },
  { id: "ca_provider", expr: providerBad("va.doctor", "dca") },
];

const CA_SQL = query(
  "community_activity",
  CA_CHECKS,
  agg(
    "'*'",
    "CONCAT('d:', COALESCE(va.doctor, ''))",
    CA_CHECKS,
    `FROM village_community_activity va
WHERE ${IN_MONTH("va.activity_start_date")}`,
  ),
);

// ---------------------------------------------------------------- REFER (HDC REFER_HISTORY / REFER_RESULT, FDH ORF)
const REFER_OUT_CHECKS: F43CheckSql[] = [
  { id: "rfo_hosp", expr: blank("r.refer_hospcode") + ` AND ${blank("r.hospcode")}` },
  { id: "rfo_pdx", expr: blank("r.pdx") },
  { id: "rfo_cause", expr: blank("r.rfrcs") },
  { id: "rfo_type", expr: "r.referout_type_id IS NULL" },
  { id: "rfo_provider", expr: providerBad("r.doctor", "drf") },
  { id: "rfo_no_service", expr: "o.vn IS NULL" },
];

const REFER_OUT_SQL = query(
  "refer_out",
  REFER_OUT_CHECKS,
  agg(
    "COALESCE(o.main_dep, '')",
    "CONCAT('d:', COALESCE(r.doctor, ''))",
    REFER_OUT_CHECKS,
    `FROM referout r
LEFT JOIN ovst o ON o.vn = r.vn
WHERE ${IN_MONTH("r.refer_date")}`,
  ),
);

const REFER_IN_CHECKS: F43CheckSql[] = [
  { id: "rfi_hosp", expr: `${blank("ri.refer_hospcode")} AND ${blank("ri.hospcode")}` },
  { id: "rfi_cause", expr: `${blank("ri.rfrcs")} AND ri.f43_causein_id IS NULL` },
  { id: "rfi_no_service", expr: "o.vn IS NULL" },
];

const REFER_IN_SQL = query(
  "refer_in",
  REFER_IN_CHECKS,
  agg(
    "COALESCE(o.main_dep, '')",
    "CONCAT('u:', COALESCE(ri.staff, ''))",
    REFER_IN_CHECKS,
    `FROM referin ri
LEFT JOIN ovst o ON o.vn = ri.vn
WHERE ${IN_MONTH("ri.refer_date")}`,
  ),
);

/** Every check query, run in parallel per date range. */
export const F43_QUERIES: readonly F43QuerySql[] = [
  PERSON_SQL,
  PROVIDER_SQL,
  SERVICE_SQL,
  DX_SQL,
  PROC_SQL,
  DRUG_OPD_SQL,
  CHARGE_OPD_SQL,
  ACC_SQL,
  APP_SQL,
  LAB_SQL,
  ADM_SQL,
  DX_IPD_SQL,
  PROC_IPD_SQL,
  DRUG_IPD_SQL,
  CHARGE_IPD_SQL,
  LABOR_SQL,
  NEWBORN_SQL,
  EPI_SQL,
  ANC_SQL,
  DENTAL_SQL,
  SPP_SQL,
  NUTRI_SQL,
  FP_SQL,
  SURV_SQL,
  COMM_SQL,
  ALLERGY_SQL,
  DEATH_SQL,
  CHRONIC_SQL,
  NCD_SQL,
  ADP_SQL,
  CFU_SQL,
  PNC_SQL,
  NBC_SQL,
  REHAB_SQL,
  FUNC_SQL,
  ICF_SQL,
  CA_SQL,
  REFER_OUT_SQL,
  REFER_IN_SQL,
];

/** Service-unit names (kskdepartment). */
export const F43_UNITS_SQL = `SELECT depcode AS code, department AS name FROM kskdepartment`;

/** Recorder display names: staff logins and providers (staff, not patients). */
export const F43_STAFF_SQL = `SELECT CONCAT('u:', loginname) AS rec, name FROM opduser
UNION ALL
SELECT CONCAT('d:', code), name FROM doctor`;
