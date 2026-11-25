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
| `store_officer` เจ้าหน้าที่คลัง | คลังเดียว หรือทุกคลัง (`store_id` ว่าง) | จ่ายพัสดุ, รับเข้า, ปรับยอด/ตรวจนับ, ดูคงคลัง/เคลื่อนไหว, ดูใบเบิกที่ไม่ใช่ร่างของคลังตน, ยกเลิกใบที่อนุมัติแล้ว |
| `finance`, `director` | ทั้ง รพ. | ดูทุกใบเบิก/ทุกคลัง (อ่านอย่างเดียว) |
| `hr` | ทั้ง รพ. | สำรองไว้สำหรับระยะ 3 (ยังไม่มีสิทธิ์เพิ่มในระยะ 1) |
| `erp_admin` | ทั้ง รพ. | ข้อมูลหลัก + กำหนดบทบาท + ดูทั้งหมด |

- คนเดียวมีได้หลายบทบาท (หลายแถว) บทบาทผูกกับ `sub` ของ Provider ID และให้ได้เฉพาะบัญชีที่ `approved` แล้วใน `users.json`
- **ผู้ดูแลระบบเว็บ (`role=admin`) = `erp_admin` อัตโนมัติ** (แก้ปัญหาไก่กับไข่ตอนเริ่มระบบ) ผู้ตรวจภายนอก (access code) เข้า ERP ไม่ได้ (403)
- บทบาทที่หน่วยงาน/คลังถูกปิดใช้งาน (`active=false`) จะไม่มีผล
- ถอนบทบาท/ปฏิเสธบัญชีมีผลทันที (โหลดใหม่ทุก request)

## Workflow ใบเบิก (REQUISITION)

```
draft --submit--> submitted --approve--> approved --issue--> issued
  |                  |  \--reject (ต้องมีเหตุผล)--> rejected
  \--cancel--> cancelled <--cancel-- (approved: unit_head / store_officer)
```

- เลขที่เอกสารออกตอน **ส่ง** (ร่างไม่กินเลข): `RQ<ปีงบ พ.ศ.>-00001` รันต่อปีงบ (1 ต.ค. – 30 ก.ย.) ใบรับเข้า `RC...` ใบปรับยอด `AJ...` (ตาราง `document_sequence`, `INSERT .. ON CONFLICT DO UPDATE .. RETURNING` ใน transaction เดียวกับเอกสาร -> ไม่ซ้ำ ไม่ข้ามเลขเมื่อ rollback)
- พัสดุต้องไม่ซ้ำในใบเดียว, 1–100 รายการ, จำนวนทศนิยมได้ 3 ตำแหน่ง
- อนุมัติ: ส่ง `lines[{lineId, qty}]` ได้ (ไม่เกินจำนวนที่ขอ) ไม่ส่ง = อนุมัติเต็มจำนวน ต้องมีอย่างน้อย 1 รายการ > 0
- จ่าย: ค่าเริ่มต้น = จำนวนที่อนุมัติ จ่ายน้อยกว่าได้ (ของไม่พอ) ใบปิดเป็น `issued` ครั้งเดียว (ยังไม่มีการจ่ายหลายงวด) ถ้าของไม่พอได้ 409 `insufficient_stock`
- **กัน double-submit / race:** ทุก action ทำใน transaction เดียว เริ่มด้วย `SELECT .. FROM document .. FOR UPDATE` แล้วตรวจ `status` + `version` (client ส่ง version ที่เห็น) คลิกซ้ำ/สองคนจ่ายพร้อมกัน -> คนที่สองได้ 409 ไม่มีการตัดสต็อกซ้ำ
- ประวัติทุกการเปลี่ยนแปลงอยู่ใน `document_event` (ใคร เมื่อไร หมายเหตุ) + `approval_step` (ระยะ 1 มี 1 ขั้น: `unit_head`) + `audit_log`

## คลัง: ต้นทุนและการล็อก

**เลือก Moving Weighted Average (ถัวเฉลี่ยเคลื่อนที่) ต่อ (คลัง, พัสดุ)** เหตุผล: ต้นทุนต่อหน่วยงานคำนวณง่ายและคงที่ (ไม่ขึ้นกับว่าหยิบล็อตไหน), ล็อกแถวเดียวต่อพัสดุ, ตรงกับวิธีที่หน่วยงานรัฐใช้ทั่วไปกับวัสดุสิ้นเปลือง ส่วน **ล็อต/วันหมดอายุเก็บเฉพาะจำนวน** (`stock_lot`) และตัดแบบ **FEFO** (หมดอายุก่อนออกก่อน, ไม่มีวันหมดอายุออกท้าย) เพื่อรองรับคลังยา

- รับเข้า: `total_value += qty × ราคา`, `item.last_unit_cost` = ราคาล่าสุด
- ตัดออก: `มูลค่าออก = total_value × qty / qty_on_hand` (ถ้าตัดหมดคลังใช้มูลค่าที่เหลือทั้งหมด จึงไม่มีเศษค้าง) แยก movement ต่อล็อตที่ถูกตัด
- ทุกการเปลี่ยนยอดล็อกแถว `stock_balance (store_id, item_id)` ด้วย `FOR UPDATE` ก่อน; หลายรายการล็อกตาม item id จากน้อยไปมาก (กัน deadlock)
- ยอดติดลบไม่ได้: ตรวจในโค้ด + `CHECK (qty_on_hand >= 0)`, `CHECK (total_value >= 0)` ในฐาน
- `stock_movement`, `document_event`, `audit_log` เป็น **append-only** (trigger ปฏิเสธ UPDATE/DELETE) แก้ไขด้วยการปรับยอดใหม่เท่านั้น
- ต้นทุนต่อหน่วยงาน (ระยะ 4) = `-sum(value_change)` ของ `ISSUE` group by `org_unit_id` (มี index `stock_movement_cost_idx`)
- ตรวจนับ (`COUNT`): กรอกจำนวนที่นับได้ ระบบบันทึกส่วนต่าง; ปรับยอด (`ADJUST`): +/- พร้อมเหตุผล เพิ่มยอดใช้ต้นทุนเฉลี่ยปัจจุบัน (หรือราคาที่กรอก)

## Schema (migration `001_erp_core.sql`)

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
| `audit_log` | ทุก action ERP (actor, action, entity, detail jsonb, ip) เขียนใน transaction เดียวกับการเปลี่ยนแปลง |

ไม่มีการลบข้อมูลหลัก (ปิด `active` แทน) เพื่อให้เอกสารเดิมอ้างอิงได้

## API

ทุก response `private, no-store`, error `{ error: "<ไทย>", code? }`; 401 ไม่ได้ล็อกอิน, 403 ไม่มีสิทธิ์/ผู้ตรวจภายนอก/Origin ไม่ตรง, 409 สถานะ/เวอร์ชันไม่ตรง/ของไม่พอ/รหัสซ้ำ, 429 เกิน 120 ครั้ง/นาที/ผู้ใช้, 503 ฐาน ERP ไม่พร้อม (`erp_not_configured` ถ้ายังไม่ตั้ง env) POST/PATCH/DELETE ต้อง same-origin + `Content-Type: application/json` และ body ห้ามมี key อื่น type อยู่ที่ `src/lib/erp/types.ts`

| Method / path | สิทธิ์ | ผลลัพธ์ |
| --- | --- | --- |
| `GET /api/erp/summary` | ผู้ใช้ ERP | `ErpSummary` (บทบาท, รออนุมัติ, รอจ่าย, ใบล่าสุดของหน่วยงาน) |
| `GET /api/erp/lookups` | ผู้ใช้ ERP | `ErpLookups & { me }` ข้อมูลหลักที่ใช้งาน |
| `GET /api/erp/requisitions?scope=mine\|approve\|issue\|all&status=&page=` | ตาม scope | `{ items, total, page, pageSize }` (50/หน้า) |
| `POST /api/erp/requisitions` | recorder/unit_head ของ `orgUnitId` | 201 `{ id }` (ร่าง) |
| `GET /api/erp/requisitions/{id}` | ผู้ที่เห็นได้ (ไม่เห็น = 404) | `RequisitionDetail` (+ `permissions`, คงคลัง, ประวัติ) |
| `PATCH /api/erp/requisitions/{id}` body `RequisitionInput & { version }` | ร่างของหน่วยงานตน | `RequisitionDetail` |
| `POST /api/erp/requisitions/{id}/actions` body `{ action, version, note?, lines? }` | ตาม action | `RequisitionDetail` |
| `GET /api/erp/stock?storeId=&includeZero=1` | store_officer ของคลัง, finance, director, erp_admin | `{ rows: StockBalanceRow[] }` |
| `GET /api/erp/stock/movements?storeId=&itemId=&type=&from=&to=` | เหมือนบน | `{ rows, truncated, from, to }` (ค่าเริ่มต้น 30 วัน สูงสุด 366 วัน, 5,000 แถว) |
| `POST /api/erp/stock/receipts` body `ReceiptInput` | store_officer ของคลัง | 201 `{ id, docNo, movements }` |
| `POST /api/erp/stock/adjustments` body `AdjustmentInput` | store_officer ของคลัง | 201 `{ id, docNo, movements }` |
| `GET/POST /api/erp/admin/{entity}`, `PATCH /api/erp/admin/{entity}/{id}` | erp_admin | entity = `org-units` `stores` `categories` `items` `vendors` `staff` (ฟิลด์ตาม `master-schema.ts`) |
| `GET/POST /api/erp/admin/roles`, `DELETE /api/erp/admin/roles/{id}` | erp_admin | บทบาท + รายชื่อบัญชีที่อนุมัติแล้ว |

## หน้าจอ

| หน้า | เนื้อหา |
| --- | --- |
| `/erp` | บทบาทของฉัน, จำนวน/รายการรออนุมัติ, รอจ่าย, ใบเบิกล่าสุดของหน่วยงาน |
| `/erp/requisitions?scope=&status=&page=` | รายการใบเบิก |
| `/erp/requisitions/new` (`?id=` แก้ร่าง) | ฟอร์มใบเบิก (ค้นหาพัสดุด้วยรหัส/ชื่อ) "บันทึกร่าง" / "บันทึกและส่งขออนุมัติ" |
| `/erp/requisitions/view?id=` | รายละเอียด + ปุ่มตามสิทธิ์ (ส่ง/อนุมัติพร้อมแก้จำนวน/ไม่อนุมัติ/จ่าย/ยกเลิก) + ประวัติ (ใช้ query แทน `[id]` เพราะ Cache Components ต้องมี generateStaticParams) |
| `/erp/stock?store=&tab=balances\|receive\|movements\|adjust` | คงคลัง (Excel), รับเข้า, ประวัติเคลื่อนไหว (Excel), ปรับยอด/ตรวจนับ |
| `/erp/admin?tab=` | ข้อมูลหลักทุกชนิด + บทบาทผู้ใช้ |

## ติดตั้งบน server (ครั้งแรก)

1. ติดตั้ง PostgreSQL 14+ (ถ้ายังไม่มี) เช่น `sudo apt install postgresql` แล้วตรวจว่า listen เฉพาะ `localhost` (ค่าเริ่มต้นของ Ubuntu) และ `pg_hba.conf` มี `host all all 127.0.0.1/32 scram-sha-256`
2. สร้าง role + database (ดึงโค้ดล่าสุดมาก่อน):
   ```sh
   cd /var/www/kpi
   OWNER_PW=$(openssl rand -base64 32 | tr -d '/+=')
   APP_PW=$(openssl rand -base64 32 | tr -d '/+=')
   sudo -u postgres psql -v ON_ERROR_STOP=1 -v owner_pw="$OWNER_PW" -v app_pw="$APP_PW" -f db/erp/setup.sql
   ```
   ได้ `bkh_erp_owner` (เจ้าของ schema ใช้รัน migration เท่านั้น) และ `bkh_erp_app` (แอป: SELECT/INSERT/UPDATE/DELETE ใน schema `erp` เท่านั้น ไม่มี DDL ไม่มีสิทธิ์ฐานอื่น)
3. ใส่ใน `/var/www/kpi/.env` (ไฟล์ 0600, ห้าม commit, ห้าม `NEXT_PUBLIC_`):
   ```
   ERP_DATABASE_URL=postgres://bkh_erp_app:<APP_PW>@127.0.0.1:5432/bkh_erp
   ERP_MIGRATE_DATABASE_URL=postgres://bkh_erp_owner:<OWNER_PW>@127.0.0.1:5432/bkh_erp
   ```
   (`openssl ... | tr -d '/+='` ทำให้รหัสไม่มีอักขระที่ต้อง URL-encode)
4. สร้างตาราง: `cd /var/www/kpi && npm run erp:migrate` (ตรวจสถานะ: `npm run erp:migrate -- --status`)
5. `pm2 restart bkh-kpi --update-env` แล้วผู้ดูแลระบบเว็บเข้า `/erp/admin` สร้าง หน่วยงาน -> คลัง -> หมวด/พัสดุ -> ผู้ขาย -> กำหนดบทบาท

สำรองข้อมูล: `sudo -u postgres pg_dump -Fc bkh_erp > /backup/bkh_erp-$(date +%F).dump` (แนะนำ cron รายวัน)

## Migration

- ไฟล์ `db/erp/migrations/NNN_ชื่อ.sql` (3 หลัก, a-z0-9_) รันตามลำดับ ไฟล์ละ 1 transaction (ล้มทั้งไฟล์ถ้า error และหยุด)
- ตาราง `erp.schema_migrations` เก็บ version + sha256; **ห้ามแก้ไฟล์ที่รันแล้ว** (checksum ไม่ตรง = หยุด) ให้เพิ่มไฟล์ใหม่
- `pg_advisory_lock` กันรันซ้อน, ไม่พิมพ์ connection string/รหัสผ่าน
- script ใช้ `node --env-file-if-exists` (ต้อง Node >= 22.9) ถ้า Node บน server เก่ากว่า ให้รัน `set -a; . ./.env; set +a; node scripts/erp-migrate.mjs`
- **ข้อเสนอผูกกับ deploy** (ยังไม่ได้แก้ `scripts/deploy-kpi.sh`): หลัง `npm run build` ใน step 4/6 เพิ่ม
  ```sh
  if grep -Eq '^ERP_(MIGRATE_)?DATABASE_URL=.+' .env; then npm run erp:migrate; fi
  ```
  migration ทั้งหมดเป็นแบบเพิ่ม (additive) จึงรันก่อน `pm2 restart` ได้ ถ้า migration ล้ม `set -e` จะหยุด deploy ก่อนรีสตาร์ต (แอปเดิมยังทำงาน)

## สิ่งที่ทดสอบแล้ว (ระหว่างพัฒนา)

ยังไม่มี PostgreSQL จริง จึงทดสอบกับ PGlite (PostgreSQL 18 แบบ WASM ผ่าน wire protocol) ใน scratch: migration รันผ่าน/รันซ้ำไม่ทำซ้ำ, flow ครบ (ข้อมูลหลัก, รับเข้า 2 ล็อต, สร้าง/แก้/ส่ง/อนุมัติลดจำนวน/จ่าย FEFO, ต้นทุนถัวเฉลี่ย, จ่ายบางส่วน, ของไม่พอ, ไม่อนุมัติ, ยกเลิก, ตรวจนับ, ปรับยอด, สิทธิ์ข้ามหน่วยงาน, version ซ้ำ, append-only, CHECK ติดลบ, ผลรวม movement = ยอดคงเหลือ) และทดสอบผ่าน HTTP จริงกับ `next start` (login ฉุกเฉินในโฟลเดอร์ข้อมูลแยก) ทุก route ตอบถูก

ยังไม่ได้ทดสอบกับ PostgreSQL 14 จริง: `setup.sql` (psql variables, default privileges) และ startup options (`-c search_path=erp ...` — PGlite ไม่รองรับ จึงยังไม่ได้ยืนยัน) และ concurrency จริงหลาย connection (PGlite เป็น session เดียว)

## แผนระยะถัดไป

- **ระยะ 2 งบประมาณ/โครงการ + ขอซื้อขอจ้าง:** ตาราง `budget` (ปีงบ, หน่วยงาน, หมวดเงิน, วงเงิน), `project`; document type ใหม่ `PURCHASE_REQUEST`, `PURCHASE_ORDER` (migration เพิ่มแถวใน `document_type`) ใช้ `document`/`document_line`/`approval_step` เดิม (หลายขั้น: หัวหน้า -> พัสดุ -> การเงิน -> ผู้อำนวยการ ตามวงเงิน), กันงบ (commitment) ตอนอนุมัติ, `RECEIPT` อ้างอิง PO (`document.ref` เพิ่มคอลัมน์ `parent_document_id`)
- **ระยะ 3 ลา/เวร/OT:** ใช้ `staff` + `org_unit` + บทบาท `hr`/`unit_head`; ตาราง `leave_request` (document type `LEAVE`), `shift_roster`, `ot_claim`; ผูก `staff.sub` กับบัญชี SSO
- **ระยะ 4 dashboard ต้นทุนต่อหน่วยงาน:** สรุปจาก `stock_movement` (ISSUE ตาม `org_unit_id`, เดือน/ปีงบ) + ค่าแรง/OT (ระยะ 3) + ค่าใช้จ่ายจากขอซื้อขอจ้าง (ระยะ 2) แสดงใน `/erp/dashboard` และเชื่อมกับ KPI บริการจาก HOSxP (read-only) เพื่อคำนวณต้นทุนต่อหน่วยบริการ
