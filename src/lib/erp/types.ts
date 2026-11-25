/**
 * ERP contract shared by the API (server) and the /erp pages (client).
 * Pure module: constants + types only, safe to import from client code.
 * See docs/erp/README.md.
 */

// --- roles -------------------------------------------------------------------

export const ERP_ROLES = [
  "recorder",
  "unit_head",
  "store_officer",
  "finance",
  "hr",
  "director",
  "erp_admin",
] as const;
export type ErpRole = (typeof ERP_ROLES)[number];

export const ERP_ROLE_LABELS: Record<ErpRole, string> = {
  recorder: "ผู้บันทึกของหน่วยงาน",
  unit_head: "หัวหน้าหน่วยงาน",
  store_officer: "เจ้าหน้าที่คลัง/พัสดุ",
  finance: "การเงิน/บัญชี",
  hr: "งานบุคลากร",
  director: "ผู้บริหาร",
  erp_admin: "ผู้ดูแลระบบ ERP",
};

/** Roles that need an org unit (recorder / unit_head). */
export const UNIT_SCOPED_ROLES: readonly ErpRole[] = ["recorder", "unit_head"];

export function isErpRole(v: unknown): v is ErpRole {
  return typeof v === "string" && (ERP_ROLES as readonly string[]).includes(v);
}

export interface ErpRoleGrant {
  role: ErpRole;
  /** recorder / unit_head only. */
  orgUnitId: number | null;
  /** store_officer only: null = every store. */
  storeId: number | null;
}

export interface ErpMe {
  sub: string;
  name: string;
  /** Web-app admin (users.json): implicit erp_admin. */
  appAdmin: boolean;
  roles: ErpRoleGrant[];
}

// --- role admin (GET /api/erp/admin/roles) ---------------------------------

export interface RoleGrantRow {
  id: number;
  sub: string;
  displayName: string;
  role: ErpRole;
  orgUnitId: number | null;
  orgUnitName: string | null;
  storeId: number | null;
  storeName: string | null;
  grantedAt: string;
}

export interface RoleCandidate {
  sub: string;
  name: string;
  orgName: string;
  jobPosition: string;
}

export interface RolesResponse {
  grants: RoleGrantRow[];
  users: RoleCandidate[];
}

// --- documents ---------------------------------------------------------------

export const DOC_STATUSES = [
  "draft",
  "submitted",
  "approved",
  "rejected",
  "issued",
  "posted",
  "cancelled",
] as const;
export type DocStatus = (typeof DOC_STATUSES)[number];

export const DOC_STATUS_LABELS: Record<DocStatus, string> = {
  draft: "ร่าง",
  submitted: "รออนุมัติ",
  approved: "อนุมัติแล้ว รอจ่าย",
  rejected: "ไม่อนุมัติ",
  issued: "จ่ายแล้ว",
  posted: "บันทึกแล้ว",
  cancelled: "ยกเลิก",
};

export function isDocStatus(v: unknown): v is DocStatus {
  return typeof v === "string" && (DOC_STATUSES as readonly string[]).includes(v);
}

export type DocType = "REQUISITION" | "RECEIPT" | "ADJUSTMENT";

export const REQUISITION_ACTIONS = ["submit", "approve", "reject", "issue", "cancel"] as const;
export type RequisitionAction = (typeof REQUISITION_ACTIONS)[number];

export const DOC_EVENT_LABELS: Record<string, string> = {
  create: "สร้างใบเบิก",
  update: "แก้ไขร่าง",
  submit: "ส่งขออนุมัติ",
  approve: "อนุมัติ",
  reject: "ไม่อนุมัติ",
  issue: "จ่ายพัสดุ",
  cancel: "ยกเลิก",
  post: "บันทึกรับเข้าคลัง",
  adjust: "ปรับปรุงยอด",
  count: "บันทึกผลตรวจนับ",
};

/** Requisition list scopes (GET /api/erp/requisitions?scope=). */
export const REQUISITION_SCOPES = ["mine", "approve", "issue", "all"] as const;
export type RequisitionScope = (typeof REQUISITION_SCOPES)[number];

export interface RequisitionSummary {
  id: number;
  docNo: string | null;
  status: DocStatus;
  orgUnitId: number;
  orgUnitName: string;
  storeId: number;
  storeName: string;
  purpose: string;
  lineCount: number;
  totalAmount: number | null;
  createdByName: string;
  createdAt: string;
  submittedAt: string | null;
  updatedAt: string;
}

export interface RequisitionLine {
  id: number;
  lineNo: number;
  itemId: number;
  itemCode: string;
  itemName: string;
  unit: string;
  qty: number;
  qtyApproved: number | null;
  qtyIssued: number | null;
  unitCost: number | null;
  amount: number | null;
  note: string;
  /** Store officers / approvers only: current quantity in the requisition's store. */
  onHand: number | null;
}

export interface DocEvent {
  id: number;
  action: string;
  fromStatus: string | null;
  toStatus: string | null;
  actorName: string;
  note: string;
  createdAt: string;
}

export interface RequisitionPermissions {
  canEdit: boolean;
  canSubmit: boolean;
  canApprove: boolean;
  canIssue: boolean;
  canCancel: boolean;
  /** unit_head who created this requisition: someone else must approve. */
  selfApprovalBlocked: boolean;
  /** store officer who created / approved it: another officer must issue. */
  selfIssueBlocked: boolean;
}

export interface RequisitionDetail extends RequisitionSummary {
  version: number;
  fiscalYear: number | null;
  createdBy: string;
  decidedByName: string | null;
  decidedAt: string | null;
  completedByName: string | null;
  completedAt: string | null;
  lines: RequisitionLine[];
  events: DocEvent[];
  permissions: RequisitionPermissions;
}

export interface RequisitionLineInput {
  itemId: number;
  qty: number;
  note?: string;
}

/** POST /api/erp/requisitions, PATCH /api/erp/requisitions/{id} (+ version). */
export interface RequisitionInput {
  orgUnitId: number;
  storeId: number;
  purpose: string;
  lines: RequisitionLineInput[];
  /** POST (create) only: UUID per form submission. */
  idempotencyKey?: string;
}

/** POST /api/erp/requisitions/{id}/actions */
export interface RequisitionActionInput {
  action: RequisitionAction;
  version: number;
  note?: string;
  /** approve: qtyApproved per line; issue: qtyIssued per line (default = approved). */
  lines?: { lineId: number; qty: number }[];
}

// --- stock -------------------------------------------------------------------

export const MOVEMENT_TYPES = ["RECEIVE", "ISSUE", "ADJUST", "COUNT"] as const;
export type MovementType = (typeof MOVEMENT_TYPES)[number];

export const MOVEMENT_TYPE_LABELS: Record<MovementType, string> = {
  RECEIVE: "รับเข้า",
  ISSUE: "จ่ายออก",
  ADJUST: "ปรับปรุงยอด",
  COUNT: "ตรวจนับ",
};

export interface StockBalanceRow {
  storeId: number;
  itemId: number;
  itemCode: string;
  itemName: string;
  unit: string;
  categoryName: string | null;
  qtyOnHand: number;
  totalValue: number;
  avgCost: number;
  reorderPoint: number;
  /** Earliest expiry among lots with stock ("YYYY-MM-DD"). */
  nearestExpiry: string | null;
}

export interface StockMovementRow {
  id: number;
  type: MovementType;
  storeId: number;
  storeName: string;
  itemId: number;
  itemCode: string;
  itemName: string;
  unit: string;
  qtyChange: number;
  valueChange: number;
  unitCost: number;
  qtyAfter: number;
  lotNo: string;
  expiryDate: string | null;
  docId: number | null;
  docNo: string | null;
  orgUnitName: string | null;
  vendorName: string | null;
  note: string;
  createdByName: string;
  createdAt: string;
}

export interface ReceiptLineInput {
  itemId: number;
  qty: number;
  unitCost: number;
  lotNo?: string;
  /** "YYYY-MM-DD" */
  expiryDate?: string | null;
}

/** POST /api/erp/stock/receipts */
export interface ReceiptInput {
  storeId: number;
  vendorId: number | null;
  /** เลขที่ใบส่งของ */
  refNo: string;
  /** วันที่ใบส่งของ "YYYY-MM-DD" */
  refDate: string | null;
  note: string;
  lines: ReceiptLineInput[];
  /** UUID per form submission (crypto.randomUUID()): retries return the first document. */
  idempotencyKey: string;
}

/**
 * POST /api/erp/stock/adjustments: creates an ADJUSTMENT request (status
 * submitted) that posts only after a second person (finance / director,
 * not the creator) approves it.
 */
export interface AdjustmentInput {
  storeId: number;
  itemId: number;
  /** "adjust": qty = +/- change; "count": qty = counted quantity (>= 0). */
  mode: "adjust" | "count";
  qty: number;
  /**
   * Balance the officer saw (system quantity at count time). Checked at
   * creation AND again when the adjustment posts: a different balance -> 409.
   */
  expectedQty: number;
  /** Empty = FEFO over all lots (decrease) / no-lot bucket (increase). */
  lotNo?: string;
  expiryDate?: string | null;
  note: string;
  idempotencyKey: string;
}

export const ADJUSTMENT_ACTIONS = ["approve", "reject", "cancel"] as const;
export type AdjustmentAction = (typeof ADJUSTMENT_ACTIONS)[number];

/** GET /api/erp/stock/adjustments?status=submitted|all&storeId= */
export interface AdjustmentRow {
  id: number;
  docNo: string;
  status: DocStatus;
  version: number;
  storeId: number;
  storeName: string;
  itemId: number;
  itemCode: string;
  itemName: string;
  unit: string;
  mode: "adjust" | "count";
  /** Signed change requested. */
  delta: number;
  expectedQty: number;
  countedQty: number | null;
  /** Current balance (to compare with expectedQty). */
  onHand: number;
  lotNo: string;
  expiryDate: string | null;
  note: string;
  totalAmount: number | null;
  createdBy: string;
  createdByName: string;
  createdAt: string;
  decidedByName: string | null;
  decidedAt: string | null;
  canApprove: boolean;
  canCancel: boolean;
}

export type StockDocType = "RECEIPT" | "ADJUSTMENT";

export interface StockDocumentRow {
  id: number;
  docNo: string | null;
  status: DocStatus;
  docType: StockDocType;
  storeId: number;
  vendorName: string | null;
  refNo: string;
  /** Receipt: note; adjustment: reason. */
  note: string;
  lineCount: number;
  totalAmount: number;
  createdByName: string;
  createdAt: string;
}

export interface AuditLogRow {
  id: number;
  occurredAt: string;
  actorName: string;
  action: string;
  entity: string;
  entityId: string | null;
  /** JSON text of the detail column (ids / codes / quantities only). */
  detail: string;
  ip: string | null;
}

export interface PostedDocResponse {
  id: number;
  docNo: string;
  movements: number;
  /** true = same idempotencyKey as an earlier request: nothing new was created. */
  replayed?: boolean;
}

// --- lookups (GET /api/erp/lookups) ------------------------------------------

export interface OrgUnitOption {
  id: number;
  code: string;
  name: string;
  parentId: number | null;
}
export interface StoreOption {
  id: number;
  code: string;
  name: string;
}
export interface ItemOption {
  id: number;
  code: string;
  name: string;
  unit: string;
  categoryId: number | null;
  lastUnitCost: number;
}
export interface NamedOption {
  id: number;
  code: string | null;
  name: string;
}

export interface ErpLookups {
  orgUnits: OrgUnitOption[];
  stores: StoreOption[];
  items: ItemOption[];
  categories: NamedOption[];
  vendors: NamedOption[];
}

// --- home (GET /api/erp/summary) ---------------------------------------------

export interface ErpSummary {
  me: ErpMe;
  toApprove: RequisitionSummary[];
  toIssue: RequisitionSummary[];
  mine: RequisitionSummary[];
  /** finance / director: stock adjustments waiting for a second approval. */
  adjustmentsToApprove: AdjustmentRow[];
  counts: { toApprove: number; toIssue: number; drafts: number; adjustmentsToApprove: number };
}

// --- errors ------------------------------------------------------------------

export const ERP_NOT_CONFIGURED_CODE = "erp_not_configured";
export const ERP_NOT_CONFIGURED_MESSAGE = "ยังไม่ได้ตั้งค่าฐานข้อมูล ERP";

export interface ErpErrorResponse {
  error: string;
  code?: string;
}
