# การเข้าสู่ระบบ (Authentication)

หลักการ: **ตัวเลขสรุปดูได้ทุกคน ส่วนรายชื่อผู้รับบริการต้องเข้าสู่ระบบก่อน**

| Route | สิทธิ์ |
| --- | --- |
| `/` หน้าแรก, ตารางตัวชี้วัด | สาธารณะ |
| `GET /api/kpi/screening/villages` (ตัวเลขรายหมู่) | สาธารณะ |
| `GET /api/kpi/screening/persons` (รายชื่อ) | ต้องล็อกอิน |
| `GET /api/kpi/screening/export` (Excel มีชีตรายชื่อ) | ต้องล็อกอิน |
| `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me` | สาธารณะ (login/logout ตรวจ Origin) |

ถ้าไม่ได้ล็อกอิน route ที่ต้องล็อกอินจะตอบ `401 { "error": "กรุณาเข้าสู่ระบบ" }` และ `Cache-Control: private, no-store`
การตรวจสิทธิ์อยู่ใน route handler เอง (`requireSession()` ใน `src/lib/auth/guard.ts`) ไม่ได้ใช้ proxy

## โครงสร้าง

- `src/lib/auth/types.ts`: interface `AuthProvider` และ `AuthUser`
- `src/lib/auth/provider.ts`: เลือก provider ตาม `KPI_DATA_SOURCE` (`his` ใช้ HOSxP, `mock` ใช้บัญชีจาก env) ถ้าจะเปลี่ยนวิธียืนยันตัวตน ให้เพิ่ม provider ใหม่แล้วเลือกในไฟล์นี้
- `src/lib/auth/providers/hosxp.ts`: ตรวจกับตาราง `opduser`
- `src/lib/auth/providers/mock.ts`: บัญชีทดสอบจาก `AUTH_MOCK_USERNAME` / `AUTH_MOCK_PASSWORD`
- `src/lib/auth/session.ts`: เก็บ session ใน cookie `bkh_kpi_session` เข้ารหัสด้วย AES-256-GCM (`node:crypto`) โดยใช้ key ที่ derive จาก `AUTH_SECRET` ด้วย HKDF ตั้ง cookie เป็น httpOnly, SameSite=Lax, path=/, อายุ 8 ชม. และ Secure เมื่อเป็น production
- `src/lib/auth/rate-limit.ts`: จำกัดความพยายามที่ล้มเหลวในหน่วยความจำ ไม่เกิน 5 ครั้ง/5 นาทีต่อ IP+username และไม่เกิน 20 ครั้ง/5 นาทีต่อ IP
- `src/lib/auth/audit.ts`: เขียน audit log หนึ่งบรรทัดต่อเหตุการณ์ด้วย `console.info`
- `src/components/auth/*`: `AuthProvider` (state ฝั่ง client โหลดจาก `/api/auth/me`), `LoginForm`, `HeaderAuth`

## สมมติฐานตาราง `opduser` (ต้อง verify ผ่าน `db-cli` ก่อนใช้งานจริง)

| คอลัมน์ | สมมติฐาน |
| --- | --- |
| `loginname` | ชื่อผู้ใช้ unique |
| `name` | ชื่อเจ้าหน้าที่ ใช้แสดงผล |
| `passweb` | รหัสผ่านเว็บแบบ MD5 hex 32 ตัว เทียบโดยไม่สนตัวพิมพ์ใหญ่/เล็ก |
| `account_disable` | ค่า `'Y'` = ปิดบัญชี, ค่าอื่นหรือ NULL = ใช้งานได้ |

query ที่ใช้คือ `SELECT loginname, name, passweb, account_disable FROM opduser WHERE loginname = :loginname LIMIT 1`

ให้ตรวจด้วย `db-cli` (ห้าม SELECT ค่า hash จริงออกมาดู):

```sql
SHOW COLUMNS FROM opduser;
-- รูปแบบ hash: นับเฉพาะความยาว/รูปแบบ ไม่แสดงค่า
SELECT LENGTH(passweb) AS len, passweb REGEXP '^[0-9A-Fa-f]{32}$' AS is_md5_hex, COUNT(*) AS n
FROM opduser GROUP BY 1, 2;
SELECT account_disable, COUNT(*) FROM opduser GROUP BY account_disable;
```

ถ้าไม่ตรงสมมติฐาน ให้แก้ที่ `src/lib/auth/providers/hosxp.ts` ไฟล์เดียว เช่น
- ไม่มี `account_disable`: ต้องลบออกจาก query ไม่เช่นนั้น login จะตอบ 503 ทุกครั้ง
- เก็บรหัสผ่านไว้ในคอลัมน์ `password`
- ใช้ hash แบบอื่น

## Audit log (PDPA)

```
[audit] 2026-11-06T03:00:00.000Z action=persons user=nurse01 code=DM fy=2570 village=12 rows=153
[audit] 2026-11-06T03:01:00.000Z action=export user=nurse01 code=DM fy=2570 village=all rows=4200
[audit] 2026-11-06T02:59:00.000Z action=login_success user=nurse01 ip=10.0.0.5
[audit] 2026-11-06T02:58:00.000Z action=login_failed user=nurse01 ip=10.0.0.5
```

log ไม่มีรหัสผ่าน hash cookie หรือข้อมูลผู้ป่วย ถ้าต้องเก็บ log ตามระยะเวลาที่ PDPA กำหนด ให้เก็บ stdout ของ process (เช่นผ่าน pm2/systemd)

## ข้อจำกัด

- session เป็นแบบ stateless ทำให้ logout ได้แค่ลบ cookie ในเบราว์เซอร์นั้น ถ้า cookie ถูกคัดลอกไป จะยังใช้ได้จนหมดอายุ (8 ชม.) ถ้าต้องการยกเลิกทุก session ทันที ให้เปลี่ยน `AUTH_SECRET`
- rate limit อยู่ในหน่วยความจำของ process เดียว รีสตาร์ตแล้วค่าจะหายไป
- IP อ่านจาก `X-Forwarded-For` ซึ่งเชื่อถือได้เฉพาะเมื่ออยู่หลัง reverse proxy ที่ตั้ง header นี้เอง
- ตรวจ Origin เทียบกับ `Host`/`X-Forwarded-Host` ถ้า reverse proxy เปลี่ยน Host ต้องส่ง `X-Forwarded-Host` มาด้วย
