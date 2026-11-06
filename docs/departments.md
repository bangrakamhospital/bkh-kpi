# แผนก (ตัวกรองมุมมองหน้าแรก)

แผนกเป็น **ตัวกรองการแสดงผล (view filter) เท่านั้น** ทุกคนเห็นตัวชี้วัดทั้งหมดเหมือนกัน แผนกไม่มีผลต่อสิทธิ์ใดๆ และไม่มีข้อมูลผู้ป่วย
ผู้ดูแลระบบจัดการแผนกได้ที่ `/admin/departments`

## ที่เก็บ

- ไฟล์ `${KPI_DATA_DIR || <cwd>/data}/departments.json` (`src/lib/departments/store.ts`) ใช้ helper เดียวกับ `users.json` (`src/lib/data/json-store.ts`: mutex ต่อไฟล์, เขียนแบบ atomic, cache ตาม mtime, ไฟล์ 0600) รูปแบบไฟล์คือ `{ "version": 1, "departments": [{ id, name, color, codes }] }`
- ถ้ายังไม่มีไฟล์ จะใช้ค่าเริ่มต้นด้านล่าง (id คงที่) โดยยังไม่เขียนไฟล์ ไฟล์จะถูกสร้างเมื่อผู้ดูแลแก้ไขครั้งแรก

  | id | ชื่อ | สี | codes |
  | --- | --- | --- | --- |
  | `ncd` | NCD | `sky` | DM, HT, DMC, HTC, RLU_HBA1C, RLU_LDL, RLU_CR |
  | `health-promotion` | งานส่งเสริมสุขภาพ / มะเร็ง | `rose` | CX, BR |
  | `lab` | ห้องปฏิบัติการ (Lab) | `amber` | RLU_HBA1C, RLU_LDL, RLU_CR, DMC |

- code ที่ไม่รู้จักในไฟล์ (เช่นตัวชี้วัดที่ถูกถอดออกภายหลัง) ระบบจะข้ามไปตอนอ่าน ส่วนสีที่ไม่อยู่ใน palette จะอ่านเป็น `null` ถ้าโครงสร้างไฟล์เสีย ระบบจะไม่เขียนทับ `GET /api/departments` จะตอบ 503 (หน้าแรกจะไม่แสดง chip) และ admin route จะตอบ 503
- แผนกใหม่ได้ id แบบสุ่มสั้น `d-xxxxxxxx` ลำดับการแสดงผลคือลำดับในไฟล์ (แผนกใหม่ต่อท้าย) และลำดับ `codes` เป็นไปตามที่บันทึก
- เรื่องการ deploy และการสำรองข้อมูล ให้ดูหัวข้อ "Deploy" ใน `docs/auth.md` (อยู่ในโฟลเดอร์ `data/` เดียวกัน)

## API

type อยู่ที่ `src/lib/departments/types.ts` (import ได้จากฝั่ง client) error เป็น `{ "error": "<ข้อความภาษาไทย>" }`

| Method / path | สิทธิ์ | ผลลัพธ์ |
| --- | --- | --- |
| `GET /api/departments` | สาธารณะ | 200 `{ "departments": [{ "id", "name", "color", "codes" }] }` (`Cache-Control: no-store` แก้แล้วเห็นผลทันที หน้าแรกโหลดฝั่ง client จึงไม่กระทบ PPR) |
| `POST /api/admin/departments` body `{ "name", "color"?, "codes" }` | admin | 201 `{ "department" }` |
| `PATCH /api/admin/departments/{id}` body `{ "name"?, "color"?, "codes"? }` | admin | 200 `{ "department" }` |
| `DELETE /api/admin/departments/{id}` | admin | 200 `{ "ok": true }` |

การตรวจข้อมูล: `name` ตัดช่องว่างหัวท้ายแล้วต้องยาว 1–60 ตัวอักษร และห้ามซ้ำโดยไม่สนตัวพิมพ์ใหญ่/เล็ก (ซ้ำได้ 409) `color` ต้องเป็น `emerald` | `sky` | `violet` | `rose` | `amber` | `teal` หรือ `null` ส่วน `codes` ต้องเป็น ScreeningCode ที่รู้จัก (ตัดตัวซ้ำออกให้) ห้ามมี key อื่น body ไม่เกิน 4 KB และต้องเป็น `Content-Type: application/json` มีแผนกได้ไม่เกิน 50 แผนก (เกินได้ 409)

รหัสสถานะของ admin route: 400 ข้อมูลไม่ถูกต้อง, 401 ไม่ได้ล็อกอิน, 403 ไม่ใช่ admin หรือ Origin ไม่ตรงกับ Host, 404 ไม่พบ id, 409 ชื่อซ้ำหรือจำนวนเต็ม, 429 เรียกถี่เกิน, 503 อ่าน/เขียนไฟล์ไม่ได้ ทุก response เป็น `private, no-store`

Audit (stdout): `action=department_create|department_update|department_delete user=<admin sub> id=<id> name=<ชื่อ> ip=...` (`department_update` บันทึกเฉพาะเมื่อมีการเปลี่ยนแปลง)
