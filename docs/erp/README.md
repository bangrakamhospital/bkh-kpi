# ระบบ ERP (คน-เงิน-ของ) — ระยะ 1: ข้อมูลหลัก + ใบเบิกพัสดุ/คลัง

ERP อยู่ในแอป bkh-kpi เดียวกัน (เมนู "ระบบ ERP" บนหัวเว็บ, หน้า `/erp/*`) ใช้ SSO และการอนุมัติผู้ใช้เดิม (`users.json`) แล้วเพิ่ม **บทบาท ERP** ต่อหน่วยงาน
ข้อมูล ERP เก็บในฐาน **PostgreSQL `bkh_erp` (schema `erp`)** ซึ่งเป็นฐานเดียวที่แอปนี้เขียนได้ ฐาน HOSxP / HDC ยังเป็น read-only เหมือนเดิม (ไม่มีโค้ด ERP แตะ)

## สถาปัตยกรรม

```
browser (/erp/*, client components)  --fetch-->  /api/erp/* (route handlers)
                                                   |  erpGate(): requireSession (users.json approved)
                                                   |   + ปฏิเสธผู้ตรวจภายนอก + ERP configured + rate limit
                                                   |   + Origin check (mutation) + โหลดบทบาทจาก erp_user_role ทุก request
                                                   v
                                         src/lib/erp/* (server-only)  --pg Pool-->  PostgreSQL bkh_erp.erp
```

| ไฟล์ | หน้าที่ |
| --- | --- |
| `src/lib/erp/db.ts` | pool `pg` (env `ERP_DATABASE_URL` หรือ `ERP_PG_*`), `erpQuery()`, `withErpTransaction()`, แปลง type (bigint/numeric -> number, date -> `YYYY-MM-DD`, timestamptz -> ISO) ทุก connection ตั้ง `search_path=erp`, `TimeZone=Asia/Bangkok`, `statement_timeout=30s`, `lock_timeout=5s` ผ่าน startup options error มีแค่ SQLSTATE |
| `src/lib/erp/gate.ts` | `erpGate()` / `erpAdminGate()`, `ErpError`, `erpFailure()` (แปลง SQLSTATE เป็นข้อความไทย), helper สิทธิ์ (`hasUnitRole`, `isStoreOfficer`, `canViewAll`) |
| `src/lib/erp/requisitions.ts` | workflow ใบเบิก + สิทธิ์ราย action + รายการ/รายละเอียด/หน้าแรก |
| `src/lib/erp/stock.ts` | stock engine (lock, รับเข้า, ตัดจ่าย FEFO, ปรับยอด/ตรวจนับ), เลขที่เอกสาร, รายงานคงคลัง/เคลื่อนไหว |
| `src/lib/erp/units.ts` | คณิตศาสตร์ทศนิยมแบบ BigInt (qty 3 ตำแหน่ง, มูลค่า 4 ตำแหน่ง) ไม่มี float ในบัญชีคลัง |
| `src/lib/erp/master.ts`, `master-schema.ts` | CRUD ข้อมูลหลักแบบ registry (ชื่อตาราง/คอลัมน์เป็นค่าคงที่ในโค้ด) schema ฟิลด์ใช้ร่วมกับหน้า admin |
| `src/lib/erp/roles.ts` | กำหนด/ถอนบทบาท ERP |
| `src/lib/erp/lookups.ts` | dropdown ข้อมูลหลัก + ตรวจ body ของรับเข้า/ปรับยอด |
| `src/lib/erp/audit.ts` | เขียน `audit_log` ใน transaction เดียวกับการเปลี่ยนแปลง |
| `src/lib/erp/types.ts` | contract ของ API (client import ได้) |
| `src/components/erp/*` | หน้าจอ (native TSX + Tailwind, `ui.tsx` = class/คอมโพเนนต์ร่วม, `erp-client.ts` = fetch hook + formatter) |
| `db/erp/setup.sql` | สร้าง role/database (ครั้งเดียว, superuser) |
| `db/erp/migrations/NNN_*.sql` + `scripts/erp-migrate.mjs` | migration |

หน้า `/erp` อยู่ใน `LOGIN_REQUIRED_PAGES` + proxy matcher (`/erp/:path*`) + `<RequireLogin>` + `<PageViewAudit>` ตามกฎเดิม แต่การตรวจบทบาทจริงอยู่ที่ API ทุก request (หน้าเว็บซ่อนปุ่มตาม `permissions` ที่ server คำนวณให้เท่านั้น)
ถ้ายังไม่ตั้ง env ฐาน ERP: API ตอบ 503 `{ code: "erp_not_configured" }` และหน้าเว็บแสดง "ยังไม่ได้ตั้งค่าฐานข้อมูล ERP" (ส่วนอื่นของเว็บใช้งานได้ปกติ)

## บทบาทและสิทธิ์

| บทบาท (`erp_user_role.role`) | ขอบเขต | ทำอะไรได้ |
| --- | --- | --- |
| `recorder` ผู้บันทึกของหน่วยงาน | หน่วยงาน (ต้องระบุ) | สร้าง/แก้ร่าง/ส่ง/ยกเลิกใบเบิกของหน่วยงาน ดูใบเบิกของหน่วยงาน |
| `unit_head` หัวหน้าหน่วยงาน | หน่วยงาน (ต้องระบุ) | เหมือน recorder + อนุมัติ (ลดจำนวนได้)/ไม่อนุมัติ, ยกเลิกใบที่อนุมัติแล้ว |
| `store_officer` เจ้าหน้าที่คลัง | คลังเดียว หรือทุกคลัง (`store_id` ว่าง) | จ่ายพัสดุ, รับเข้า, **ขอ**ปรับยอด/ตรวจนับ, ดูคงคลัง/เคลื่อนไหว, ดูใบเบิกที่ไม่ใช่ร่างของคลังตน, ยกเลิกใบที่อนุมัติแล้ว |
| `finance`, `director` | ทั้ง รพ. | ดูทุกใบเบิก/ทุกคลัง + **อนุมัติ/ไม่อนุมัติใบปรับยอดคลัง** (ต้องไม่ใช่ผู้บันทึก) |
| `hr` | ทั้ง รพ. | สำรองไว้สำหรับระยะ 3 (ยังไม่มีสิทธิ์เพิ่มในระยะ 1) |
| `erp_admin` | ทั้ง รพ. | ข้อมูลหลัก + กำหนดบทบาท (ให้ตัวเองไม่ได้) + ดูทั้งหมด + ยกเลิกเอกสารค้าง (รออนุมัติ/รอจ่าย/ใบปรับยอดรออนุมัติ) |

- คนเดียวมีได้หลายบทบาท (หลายแถว) บทบาทผูกกับ `sub` ของ Provider ID และให้ได้เฉพาะบัญชีที่ `approved` แล้วใน `users.json`
- **ผู้ดูแลระบบเว็บ (`role=admin`) = `erp_admin` อัตโนมัติ** (แก้ปัญหาไก่กับไข่ตอนเริ่มระบบ) ผู้ตรวจภายนอก (access code) เข้า ERP ไม่ได้ (403)
- บทบาทที่หน่วยงาน/คลังถูกปิดใช้งาน (`active=false`) จะไม่มีผล
- ถอนบทบาท/ปฏิเสธบัญชีมีผลทันที (โหลดใหม่ทุก request)
- ผู้ที่ไม่มีบทบาท ERP เลย (และไม่ใช่ admin) เรียก `/api/erp/lookups` ไม่ได้ (403 `no_erp_role`)
- **แยกหน้าที่ (segregation of duties)** ตรวจที่ server ทั้งใน `permissions` และหลังล็อกเอกสาร:
  - ผู้สร้างใบเบิกอนุมัติ/ไม่อนุมัติใบของตนไม่ได้ (403 `self_approval`) และใบนั้นไม่ขึ้นในคิว "รออนุมัติ" ของตน
  - ผู้จ่ายต้องไม่ใช่ผู้สร้างหรือผู้อนุมัติใบเบิก (403 `self_issue`) และไม่ขึ้นในคิว "รอจ่าย" ของตน
  - ใบปรับยอด/ตรวจนับต้องให้ finance/director ที่ไม่ใช่ผู้บันทึกอนุมัติ
  - erp_admin กำหนดบทบาทให้ตัวเองไม่ได้ (403 `self_grant`)

## Workflow ใบเบิก (REQUISITION)

```
draft --submit--> submitted --approve--> approved --issue--> issued
  |                  |  \--reject (ต้องมีเหตุผล)--> rejected
  \--cancel--> cancelled <--cancel-- (approved: unit_head / store_officer; submitted/approved: erp_admin)
```

- เลขที่เอกสารออกตอน **ส่ง** (ร่างไม่กินเลข): `RQ<ปีงบ พ.ศ.>-00001` รันต่อปีงบ (1 ต.ค. – 30 ก.ย.) ใบรับเข้า `RC...` ใบปรับยอด `AJ...` (ตาราง `document_sequence`, `INSERT .. ON CONFLICT DO UPDATE .. RETURNING` ใน transaction เดียวกับเอกสาร -> ไม่ซ้ำ ไม่ข้ามเลขเมื่อ rollback)
- พัสดุต้องไม่ซ้ำในใบเดียว, 1–100 รายการ, จำนวนทศนิยมได้ 3 ตำแหน่ง
- อนุมัติ: ส่ง `lines[{lineId, qty}]` ได้ (ไม่เกินจำนวนที่ขอ) ไม่ส่ง = อนุมัติเต็มจำนวน ต้องมีอย่างน้อย 1 รายการ > 0
- จ่าย: ค่าเริ่มต้น = จำนวนที่อนุมัติ จ่ายน้อยกว่าได้ (ของไม่พอ) ใบปิดเป็น `issued` ครั้งเดียว — **ส่วนที่ขาดไม่ถูกค้างจ่าย ต้องเบิกใหม่** (หน้ารายละเอียดและใบพิมพ์แสดงหมายเหตุนี้) ถ้าของไม่พอได้ 409 `insufficient_stock`; ถ้าของที่ยังไม่หมดอายุไม่พอได้ 409 `expired_stock` (ต้องตัดยอดล็อตหมดอายุด้วยใบปรับยอดก่อน)
- สร้างใบเบิก: client ส่ง `idempotencyKey` (UUID ต่อฟอร์ม) ส่งซ้ำ = ได้ใบเดิม (200 `replayed: true`)
- **กัน double-submit / race:** ทุก action ทำใน transaction เดียว เริ่มด้วย `SELECT .. FROM document .. FOR UPDATE` แล้วตรวจ `status` + `version` (client ส่ง version ที่เห็น) คลิกซ้ำ/สองคนจ่ายพร้อมกัน -> คนที่สองได้ 409 ไม่มีการตัดสต็อกซ้ำ
- ประวัติทุกการเปลี่ยนแปลงอยู่ใน `document_event` (ใคร เมื่อไร หมายเหตุ) + `approval_step` (ระยะ 1 มี 1 ขั้น: `unit_head`) + `audit_log`

## คลัง: ต้นทุนและการล็อก

**เลือก Moving Weighted Average (ถัวเฉลี่ยเคลื่อนที่) ต่อ (คลัง, พัสดุ)** เหตุผล: ต้นทุนต่อหน่วยงานคำนวณง่ายและคงที่ (ไม่ขึ้นกับว่าหยิบล็อตไหน), ล็อกแถวเดียวต่อพัสดุ, ตรงกับวิธีที่หน่วยงานรัฐใช้ทั่วไปกับวัสดุสิ้นเปลือง ส่วน **ล็อต/วันหมดอายุเก็บเฉพาะจำนวน** (`stock_lot`) และตัดแบบ **FEFO** (หมดอายุก่อนออกก่อน, ไม่มีวันหมดอายุออกท้าย) เพื่อรองรับคลังยา

- รับเข้า: `total_value += qty × ราคา`, `item.last_unit_cost` = ราคาล่าสุด
- ตัดออก: `มูลค่าออก = total_value × qty / qty_on_hand` (ถ้าตัดหมดคลังใช้มูลค่าที่เหลือทั้งหมด จึงไม่มีเศษค้าง) แยก movement ต่อล็อตที่ถูกตัด มูลค่าต่อล็อตปัดลง (floor) และล็อตสุดท้ายรับเศษ ผลรวมจึงไม่เกินมูลค่าออก
- **จ่าย (ISSUE) ไม่จ่ายล็อตที่หมดอายุแล้ว** (`expiry_date < วันนี้` ตามเวลา Asia/Bangkok) เฉพาะ ADJUST/COUNT ตัดล็อตหมดอายุได้
- ยอดรวมหัวเอกสาร = ผลรวมยอดรายการที่ปัดเป็นสตางค์แล้ว (ตรงกับที่แสดงในรายการ)
- ทุกการเปลี่ยนยอดล็อกแถว `stock_balance (store_id, item_id)` ด้วย `FOR UPDATE` ก่อน; หลายรายการล็อกตาม item id จากน้อยไปมาก (กัน deadlock)
- ยอดติดลบไม่ได้: ตรวจในโค้ด + `CHECK (qty_on_hand >= 0)`, `CHECK (total_value >= 0)` ในฐาน
- `stock_movement`, `document_event`, `audit_log` เป็น **append-only** (trigger ปฏิเสธ UPDATE/DELETE) แก้ไขด้วยการปรับยอดใหม่เท่านั้น
- ต้นทุนต่อหน่วยงาน (ระยะ 4) = `-sum(value_change)` ของ `ISSUE` group by `org_unit_id` (มี index `stock_movement_cost_idx`)
### ใบปรับยอด / ตรวจนับ (ADJUSTMENT) — สองคน

```
store_officer สร้าง --> submitted (ได้เลข AJ..., ยอดคลังยังไม่เปลี่ยน)
   finance/director (ไม่ใช่ผู้บันทึก): approve --> posted (ลงบัญชีคลังตอนนี้) | reject (ต้องมีเหตุผล) --> rejected
   ผู้บันทึก / store_officer ของคลัง / erp_admin: cancel --> cancelled
```

- client ส่ง `expectedQty` = ยอดในระบบที่เห็นตอนนับ/ขอปรับ ถ้าไม่ตรงยอดจริงตอนสร้าง -> 409 `stale_count` (หน้าจอโหลดยอดใหม่ให้นับใหม่)
- **ตรวจนับ (`COUNT`)**: ส่วนต่าง = จำนวนที่นับได้ - expectedQty และตอนอนุมัติตรวจ expectedQty กับยอดที่ล็อกอยู่อีกครั้ง ถ้าระหว่างรออนุมัติมีรับ/จ่าย -> 409 `stale_count` ต้องยกเลิกแล้วนับใหม่
- **ปรับยอด (`ADJUST`)**: +/- พร้อมเหตุผล
- เพิ่มยอด**กำหนดราคาเองไม่ได้**: ใช้ต้นทุนถัวเฉลี่ยปัจจุบัน ถ้ายอดเป็น 0 ใช้ `item.last_unit_cost`
- ลดยอดที่ระบุ Lot (และวันหมดอายุ) ตัด**เฉพาะล็อตนั้น** (ไม่พอ -> 409 `insufficient_lot`) ไม่ระบุ = FEFO รวมล็อตหมดอายุ (ใช้ตัดของหมดอายุ)
- ข้อมูลที่ขออยู่ใน `document_line` (`adjust_mode`, `adjust_delta`, `expected_qty`, `counted_qty`, lot) + `approval_step` (`finance|director`)
- รับเข้า / ปรับยอด ส่ง `idempotencyKey` (UUID ต่อการกดส่ง) ส่งซ้ำ = ได้เอกสารเดิม ไม่รับ/ปรับซ้ำ

## Schema (migration `001_erp_core.sql` + `002_adjust_approval_idempotency.sql`)

| ตาราง | สาระสำคัญ |
| --- | --- |
| `org_unit` | หน่วยงาน/ศูนย์ต้นทุน `code` unique, `parent_id` สายบังคับบัญชา (กันวนในโค้ด), `is_cost_center`, `active` |
| `store` | คลัง + หน่วยงานเจ้าของ |
| `erp_user_role` | `sub`, `role`, `org_unit_id` (recorder/unit_head), `store_id` (store_officer), unique ต่อ (sub, role, unit, store) |
| `staff` | ชื่อ-สกุล ตำแหน่ง ประเภทการจ้าง สังกัด `sub` (ผูกบัญชี, ไม่บังคับ) — **ไม่เก็บเลขบัตรประชาชน** |
| `item_category`, `item`, `vendor` | หมวด, พัสดุ (รหัส ชื่อ หน่วยนับ หมวด ราคาล่าสุด จุดสั่งซื้อ), ผู้ขาย |
| `document_type`, `document_sequence` | ชนิดเอกสาร (REQUISITION/RECEIPT/ADJUSTMENT) + เลขรันต่อปีงบ |
| `document`, `document_line` | หัวเอกสารทั่วไป (สถานะ, หน่วยงาน, คลัง, ผู้ขาย, เลขที่ใบส่งของ, version, ผู้สร้าง/ผู้อนุมัติ/ผู้จ่าย) + รายการ (qty, qty_approved, qty_issued, unit_cost, amount, lot, expiry) |
| `approval_step`, `document_event` | ขั้นอนุมัติ + ประวัติสถานะ |
| `stock_balance`, `stock_lot`, `stock_movement` | ยอดคงเหลือ/มูลค่า, จำนวนต่อล็อต, สมุดคลัง |
| `audit_log` | ทุก action ERP (actor, action, entity, detail jsonb, ip) เขียนใน transaction เดียวกับการเปลี่ยนแปลง ข้อมูลหลักเก็บเฉพาะ**ชื่อฟิลด์ที่เปลี่ยน** (ไม่เก็บค่า เช่น ชื่อบุคลากร/sub/เบอร์/ที่อยู่/เลขภาษีผู้ขาย) |
| (002) | `document.idempotency_key uuid UNIQUE`, คอลัมน์ใบปรับยอดใน `document_line`, `REVOKE ALL ON schema_migrations FROM bkh_erp_app` |

ไม่มีการลบข้อมูลหลัก (ปิด `active` แทน) เพื่อให้เอกสารเดิมอ้างอิงได้ ปิดหน่วยงาน/คลังที่ยังมีเอกสารค้าง (ร่าง/รออนุมัติ/รอจ่าย) ไม่ได้ (409 `pending_documents`) ให้ erp_admin ยกเลิกเอกสารก่อน

## API

ทุก response `private, no-store`, error `{ error: "<ไทย>", code? }`; 401 ไม่ได้ล็อกอิน, 403 ไม่มีสิทธิ์/ผู้ตรวจภายนอก/Origin ไม่ตรง, 409 สถานะ/เวอร์ชันไม่ตรง/ของไม่พอ/รหัสซ้ำ, 429 เกิน 120 ครั้ง/นาที/ผู้ใช้, 503 ฐาน ERP ไม่พร้อม (`erp_not_configured` ถ้ายังไม่ตั้ง env) POST/PATCH/DELETE ต้อง same-origin + `Content-Type: application/json` และ body ห้ามมี key อื่น type อยู่ที่ `src/lib/erp/types.ts`

| Method / path | สิทธิ์ | ผลลัพธ์ |
| --- | --- | --- |
| `GET /api/erp/summary` | ผู้ใช้ ERP | `ErpSummary` (บทบาท, รออนุมัติ, รอจ่าย, ใบล่าสุดของหน่วยงาน) |
| `GET /api/erp/lookups` | ผู้ใช้ ERP | `ErpLookups & { me }` ข้อมูลหลักที่ใช้งาน |
| `GET /api/erp/requisitions?scope=mine\|approve\|issue\|all&status=&page=` | ตาม scope | `{ items, total, page, pageSize }` (50/หน้า) |
| `POST /api/erp/requisitions` body `RequisitionInput & { idempotencyKey }` | recorder/unit_head ของ `orgUnitId` | 201 `{ id, replayed: false }` (ร่าง) / 200 `replayed: true` |
| `GET /api/erp/requisitions/{id}` | ผู้ที่เห็นได้ (ไม่เห็น = 404) | `RequisitionDetail` (+ `permissions`, คงคลัง, ประวัติ) |
| `PATCH /api/erp/requisitions/{id}` body `RequisitionInput & { version }` | ร่างของหน่วยงานตน | `RequisitionDetail` |
| `POST /api/erp/requisitions/{id}/actions` body `{ action, version, note?, lines? }` | ตาม action | `RequisitionDetail` |
| `GET /api/erp/stock?storeId=&includeZero=1` | store_officer ของคลัง, finance, director, erp_admin | `{ rows: StockBalanceRow[] }` |
| `GET /api/erp/stock/movements?storeId=&itemId=&type=&from=&to=` | เหมือนบน | `{ rows, truncated, from, to }` (ค่าเริ่มต้น 30 วัน สูงสุด 366 วัน, 5,000 แถว) |
| `POST /api/erp/stock/receipts` body `ReceiptInput` (มี `idempotencyKey`) | store_officer ของคลัง | 201 `{ id, docNo, movements }` / 200 `replayed: true` |
| `GET /api/erp/stock/adjustments?status=submitted\|all&storeId=` | store_officer (คลังตน), finance, director, erp_admin | `{ rows: AdjustmentRow[], total }` (+ `canApprove`, `canCancel`) |
| `POST /api/erp/stock/adjustments` body `AdjustmentInput` (`expectedQty`, `idempotencyKey`, ไม่มีราคา) | store_officer ของคลัง | 201 `{ id, docNo, movements: 0 }` (submitted) |
| `POST /api/erp/stock/adjustments/{id}/actions` body `{ action: approve\|reject\|cancel, version, note? }` | approve/reject: finance/director ไม่ใช่ผู้บันทึก; cancel: ผู้บันทึก/เจ้าหน้าที่คลัง/erp_admin | `{ ok: true }` |
| `GET /api/erp/stock/documents?storeId=&type=RECEIPT\|ADJUSTMENT&from=&to=` | เหมือน `/api/erp/stock` | `{ rows: StockDocumentRow[] (มี status), truncated }` |
| `GET/POST /api/erp/admin/{entity}`, `PATCH /api/erp/admin/{entity}/{id}` | erp_admin | entity = `org-units` `stores` `categories` `items` `vendors` `staff` (ฟิลด์ตาม `master-schema.ts`) |
| `GET/POST /api/erp/admin/roles`, `DELETE /api/erp/admin/roles/{id}` | erp_admin | บทบาท + รายชื่อบัญชีที่อนุมัติแล้ว |

## หน้าจอ

| หน้า | เนื้อหา |
| --- | --- |
| `/erp` | บทบาทของฉัน, จำนวน/รายการรออนุมัติ, รอจ่าย, ใบปรับยอดรออนุมัติ (finance/director), แจ้งเตือนคลัง, ใบเบิกล่าสุดของหน่วยงาน |
| `/erp/requisitions?scope=&status=&page=` | รายการใบเบิก |
| `/erp/requisitions/new` (`?id=` แก้ร่าง) | ฟอร์มใบเบิก (ค้นหาพัสดุด้วยรหัส/ชื่อ) "บันทึกร่าง" / "บันทึกและส่งขออนุมัติ" |
| `/erp/requisitions/view?id=` | รายละเอียด + ปุ่มตามสิทธิ์ (ส่ง/อนุมัติพร้อมแก้จำนวน/ไม่อนุมัติ/จ่าย/ยกเลิก) + ประวัติ (ใช้ query แทน `[id]` เพราะ Cache Components ต้องมี generateStaticParams) |
| `/erp/stock?store=&tab=balances\|receive\|movements\|adjust\|documents\|pending` | คงคลัง (Excel), รับเข้า, ประวัติเคลื่อนไหว (Excel), ขอปรับยอด/ตรวจนับ (แสดงยอดในระบบ + รายการรออนุมัติ), เอกสารรับ/ปรับยอด, รออนุมัติปรับยอด (finance/director) |
| `/erp/admin?tab=` | ข้อมูลหลักทุกชนิด + บทบาทผู้ใช้ |

## ติดตั้งบน server (ครั้งแรก)

1. ติดตั้ง PostgreSQL 14+ ถ้ายังไม่มี: `sudo apt install postgresql` (ค่าเริ่มต้น Ubuntu: listen เฉพาะ localhost และ `pg_hba.conf` มี `host all all 127.0.0.1/32 scram-sha-256`)
2. หลัง deploy โค้ดนี้แล้ว รันคำสั่งเดียว:
   ```sh
   cd /var/www/kpi && bash scripts/erp-db-setup.sh && pm2 restart bkh-kpi --update-env
   ```
   script นี้ (ถาม sudo password ครั้งเดียว):
   - สุ่มรหัสผ่าน 2 ชุดเก็บในตัวแปรของ script เท่านั้น ส่งให้ `psql` ทาง **stdin** (ไม่อยู่บน command line จึงไม่ค้างใน shell history / `ps`) และไม่พิมพ์รหัสออกจอ
   - รัน `db/erp/setup.sql` ด้วย postgres superuser: role `bkh_erp_owner` (เจ้าของ schema ใช้รัน migration เท่านั้น) และ `bkh_erp_app` (แอป: SELECT/INSERT/UPDATE/DELETE ใน schema `erp` เท่านั้น ไม่มี DDL ไม่มีสิทธิ์ฐานอื่น ไม่เห็น `schema_migrations`)
   - เขียน `ERP_DATABASE_URL` / `ERP_MIGRATE_DATABASE_URL` ต่อท้าย `.env` (0600) แล้วรัน migration
   - ไม่ทำซ้ำถ้ามี role หรือ `ERP_DATABASE_URL` อยู่แล้ว
3. ผู้ดูแลระบบเว็บเข้า `/erp/admin` สร้าง หน่วยงาน -> คลัง -> หมวด/พัสดุ -> ผู้ขาย -> กำหนดบทบาท (การเงิน/ผู้บริหารอย่างน้อย 1 คนสำหรับอนุมัติใบปรับยอด)

ตรวจสถานะ migration: `npm run erp:migrate -- --status`

สำรองข้อมูล: `sudo -u postgres pg_dump -Fc bkh_erp > /backup/bkh_erp-$(date +%F).dump` (แนะนำ cron รายวัน)

## Migration

- ไฟล์ `db/erp/migrations/NNN_ชื่อ.sql` (3 หลัก, a-z0-9_) รันตามลำดับ ไฟล์ละ 1 transaction (ล้มทั้งไฟล์ถ้า error และหยุด)
- ตาราง `erp.schema_migrations` เก็บ version + sha256 (คำนวณหลังแปลง CRLF -> LF และ `.gitattributes` กำหนด `*.sql eol=lf`) **ห้ามแก้ไฟล์ที่รันแล้ว** (checksum ไม่ตรง = หยุด) ให้เพิ่มไฟล์ใหม่
- `pg_advisory_lock` กันรันซ้อน, ไม่พิมพ์ connection string/รหัสผ่าน
- script ใช้ `node --env-file-if-exists` (ต้อง Node >= 22.9) ถ้า Node บน server เก่ากว่า ให้รัน `set -a; . ./.env; set +a; node scripts/erp-migrate.mjs`
- **ข้อเสนอผูกกับ deploy** (ยังไม่ได้แก้ `scripts/deploy-kpi.sh`): หลัง `npm run build` ใน step 4/6 เพิ่ม
  ```sh
  if grep -Eq '^ERP_(MIGRATE_)?DATABASE_URL=.+' .env; then npm run erp:migrate; fi
  ```
  migration ทั้งหมดเป็นแบบเพิ่ม (additive) จึงรันก่อน `pm2 restart` ได้ ถ้า migration ล้ม `set -e` จะหยุด deploy ก่อนรีสตาร์ต (แอปเดิมยังทำงาน)

## สิ่งที่ทดสอบแล้ว (ระหว่างพัฒนา)

ยังไม่มี PostgreSQL จริง จึงทดสอบกับ PGlite (PostgreSQL 18 แบบ WASM ผ่าน wire protocol) ใน scratch:
- รอบ 1: migration 001, flow ใบเบิก/รับเข้า/ต้นทุนถัวเฉลี่ย/FEFO/จ่ายบางส่วน/ไม่อนุมัติ/ยกเลิก/append-only/CHECK และ HTTP จริงกับ `next start`
- รอบ 2 (หลังรีวิว, 36 checks): migration 001+002 (มี role `bkh_erp_app` + default privileges จำลอง setup: ไม่มีสิทธิ์ `schema_migrations`), idempotency ของสร้างใบเบิก/รับเข้า/ปรับยอด (+ key ของคนอื่น = 409), แยกหน้าที่ อนุมัติ/จ่าย/ปรับยอด/กำหนดบทบาท, ISSUE ข้ามล็อตหมดอายุ (409 `expired_stock`), ปรับยอดเฉพาะล็อต, ตรวจนับ expectedQty ไม่ตรงทั้งตอนสร้างและตอนอนุมัติ, เพิ่มยอดใช้ต้นทุนเฉลี่ย/ราคาล่าสุดเมื่อยอด 0, ไม่อนุมัติไม่เปลี่ยนยอด, ปิดหน่วยงานที่มีเอกสารค้าง = 409, admin ยกเลิกใบค้าง, audit ข้อมูลหลักไม่มีค่าข้อมูลบุคคล, ยอดรวมหัว = ผลรวมรายการ, ผลรวม movement = ยอดคงเหลือ = ผลรวมล็อต ทุกพัสดุ

ยังไม่ได้ทดสอบกับ PostgreSQL 14 จริง: `scripts/erp-db-setup.sh` + `setup.sql` (psql \\set ผ่าน stdin, sudo), startup options (`-c search_path=erp ...` — PGlite ไม่รองรับ) และ concurrency จริงหลาย connection (PGlite เป็น session เดียว)

## แผนระยะถัดไป

- **ระยะ 2 งบประมาณ/โครงการ + ขอซื้อขอจ้าง:** ตาราง `budget` (ปีงบ, หน่วยงาน, หมวดเงิน, วงเงิน), `project`; document type ใหม่ `PURCHASE_REQUEST`, `PURCHASE_ORDER` (migration เพิ่มแถวใน `document_type`) ใช้ `document`/`document_line`/`approval_step` เดิม (หลายขั้น: หัวหน้า -> พัสดุ -> การเงิน -> ผู้อำนวยการ ตามวงเงิน), กันงบ (commitment) ตอนอนุมัติ, `RECEIPT` อ้างอิง PO (`document.ref` เพิ่มคอลัมน์ `parent_document_id`)
- **ระยะ 3 ลา/เวร/OT:** ใช้ `staff` + `org_unit` + บทบาท `hr`/`unit_head`; ตาราง `leave_request` (document type `LEAVE`), `shift_roster`, `ot_claim`; ผูก `staff.sub` กับบัญชี SSO
- **ระยะ 4 dashboard ต้นทุนต่อหน่วยงาน:** สรุปจาก `stock_movement` (ISSUE ตาม `org_unit_id`, เดือน/ปีงบ) + ค่าแรง/OT (ระยะ 3) + ค่าใช้จ่ายจากขอซื้อขอจ้าง (ระยะ 2) แสดงใน `/erp/dashboard` และเชื่อมกับ KPI บริการจาก HOSxP (read-only) เพื่อคำนวณต้นทุนต่อหน่วยบริการ
