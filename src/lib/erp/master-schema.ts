/**
 * Master-data registry shared by /api/erp/admin/{entity} (server: column
 * mapping + validation) and the /erp/admin editor (client: form + table).
 * Pure module — the SQL table / column names live in master.ts.
 */

export const MASTER_ENTITIES = ["org-units", "stores", "categories", "items", "vendors", "staff"] as const;
export type MasterEntity = (typeof MASTER_ENTITIES)[number];

export function isMasterEntity(v: unknown): v is MasterEntity {
  return typeof v === "string" && (MASTER_ENTITIES as readonly string[]).includes(v);
}

export type MasterField =
  | { name: string; label: string; kind: "code"; max: number; required: boolean }
  | { name: string; label: string; kind: "text"; max: number; required: boolean; multiline?: boolean }
  | { name: string; label: string; kind: "ref"; ref: MasterEntity }
  | { name: string; label: string; kind: "bool"; default: boolean }
  | { name: string; label: string; kind: "decimal"; scale: number; max: number }
  | { name: string; label: string; kind: "enum"; options: readonly { value: string; label: string }[]; default: string };

export interface MasterEntitySpec {
  key: MasterEntity;
  label: string;
  /** Field shown as the row title / used in reference dropdowns. */
  titleField: string;
  fields: readonly MasterField[];
}

export const EMPLOYMENT_TYPES = [
  { value: "civil_servant", label: "ข้าราชการ" },
  { value: "government_employee", label: "พนักงานราชการ" },
  { value: "ministry_employee", label: "พนักงานกระทรวงสาธารณสุข" },
  { value: "permanent_employee", label: "ลูกจ้างประจำ" },
  { value: "temporary", label: "ลูกจ้างชั่วคราว" },
  { value: "other", label: "อื่นๆ" },
] as const;

const active = { name: "active", label: "ใช้งาน", kind: "bool", default: true } as const;

export const MASTER_SPECS: Record<MasterEntity, MasterEntitySpec> = {
  "org-units": {
    key: "org-units",
    label: "หน่วยงาน",
    titleField: "name",
    fields: [
      { name: "code", label: "รหัส", kind: "code", max: 20, required: true },
      { name: "name", label: "ชื่อหน่วยงาน", kind: "text", max: 200, required: true },
      { name: "parentId", label: "สังกัด (หน่วยงานแม่)", kind: "ref", ref: "org-units" },
      { name: "isCostCenter", label: "เป็นศูนย์ต้นทุน", kind: "bool", default: true },
      active,
    ],
  },
  stores: {
    key: "stores",
    label: "คลัง",
    titleField: "name",
    fields: [
      { name: "code", label: "รหัส", kind: "code", max: 20, required: true },
      { name: "name", label: "ชื่อคลัง", kind: "text", max: 200, required: true },
      { name: "orgUnitId", label: "หน่วยงานเจ้าของคลัง", kind: "ref", ref: "org-units" },
      active,
    ],
  },
  categories: {
    key: "categories",
    label: "หมวดพัสดุ",
    titleField: "name",
    fields: [
      { name: "code", label: "รหัส", kind: "code", max: 20, required: true },
      { name: "name", label: "ชื่อหมวด", kind: "text", max: 200, required: true },
      active,
    ],
  },
  items: {
    key: "items",
    label: "พัสดุ",
    titleField: "name",
    fields: [
      { name: "code", label: "รหัสพัสดุ", kind: "code", max: 30, required: true },
      { name: "name", label: "ชื่อพัสดุ", kind: "text", max: 300, required: true },
      { name: "unit", label: "หน่วยนับ", kind: "text", max: 30, required: true },
      { name: "categoryId", label: "หมวด", kind: "ref", ref: "categories" },
      { name: "spec", label: "รายละเอียด/ขนาด", kind: "text", max: 500, required: false },
      { name: "lastUnitCost", label: "ราคาต่อหน่วยล่าสุด (บาท)", kind: "decimal", scale: 4, max: 99_999_999 },
      { name: "reorderPoint", label: "จุดสั่งซื้อ", kind: "decimal", scale: 3, max: 999_999_999 },
      active,
    ],
  },
  vendors: {
    key: "vendors",
    label: "ผู้ขาย",
    titleField: "name",
    fields: [
      { name: "code", label: "รหัส", kind: "code", max: 20, required: false },
      { name: "name", label: "ชื่อผู้ขาย/บริษัท", kind: "text", max: 300, required: true },
      { name: "taxId", label: "เลขประจำตัวผู้เสียภาษี", kind: "text", max: 20, required: false },
      { name: "phone", label: "โทรศัพท์", kind: "text", max: 50, required: false },
      { name: "address", label: "ที่อยู่", kind: "text", max: 500, required: false, multiline: true },
      active,
    ],
  },
  staff: {
    key: "staff",
    label: "บุคลากร",
    titleField: "fullName",
    fields: [
      { name: "employeeCode", label: "รหัสบุคลากร", kind: "code", max: 20, required: false },
      { name: "fullName", label: "ชื่อ-สกุล", kind: "text", max: 200, required: true },
      { name: "position", label: "ตำแหน่ง", kind: "text", max: 200, required: false },
      {
        name: "employmentType",
        label: "ประเภทการจ้าง",
        kind: "enum",
        options: EMPLOYMENT_TYPES,
        default: "other",
      },
      { name: "orgUnitId", label: "สังกัด", kind: "ref", ref: "org-units" },
      { name: "sub", label: "Provider ID (sub) สำหรับผูกบัญชี", kind: "text", max: 256, required: false },
      active,
    ],
  },
};

/** A master-data row as returned by the API: id + field values + timestamps. */
export type MasterRow = { id: number; createdAt: string; updatedAt: string } & Record<
  string,
  string | number | boolean | null
>;

export interface MasterListResponse {
  rows: MasterRow[];
}
export interface MasterRowResponse {
  row: MasterRow;
}
