# การเข้าสู่ระบบ (Authentication)

หลักการ: **ตัวเลขสรุปดูได้ทุกคน ส่วนรายชื่อผู้รับบริการต้องเข้าสู่ระบบก่อน**

| Route | สิทธิ์ |
| --- | --- |
| `/` หน้าแรก, ตารางตัวชี้วัด | สาธารณะ |
| `GET /api/kpi/screening/villages` (ตัวเลขรายหมู่) | สาธารณะ |
| `GET /api/kpi/screening/persons` (รายชื่อ) | ต้องล็อกอิน |
| `GET /api/kpi/screening/export` (Excel มีชีตรายชื่อ) | ต้องล็อกอิน |
| `/api/auth/*` ของ Auth.js (`session`, `csrf`, `providers`, `callback/credentials`, `signout`) | สาธารณะ (POST ต้องมี CSRF token ของ Auth.js) |
| `/login` หน้าเข้าสู่ระบบ | สาธารณะ |

ถ้าไม่ได้ล็อกอิน route ที่ต้องล็อกอินจะตอบ `401 { "error": "กรุณาเข้าสู่ระบบ" }` และ `Cache-Control: private, no-store`
การตรวจสิทธิ์อยู่ใน route handler เอง (`requireSession()` ใน `src/lib/auth/guard.ts` ซึ่งเรียก `auth()` ของ Auth.js) ไม่ได้ใช้ proxy/middleware

## สถาปัตยกรรม (Auth.js / next-auth v5)

ใช้ `next-auth@5.0.0-beta.32` (pin เวอร์ชันตรงเพราะ v5 ยังเป็น beta; peerDependencies รองรับ `next ^16` และ `react ^19`) ถ้าจะอัปเกรด ให้อ่าน changelog และทดสอบ flow ในหัวข้อ "ทดสอบด้วย curl" ใหม่

- `src/auth.ts`: ตั้งค่า Auth.js และ export `{ handlers, auth, signIn, signOut }`
  - **Credentials provider** เรียก provider เดิมผ่าน `getAuthProvider()` (`AUTH_PROVIDER` = `local` | `hosxp`) ใน `authorize()` จะตรวจ rate limit, เขียน audit log (`login_success` / `login_failed` / `login_rate_limited`) และโยน `CredentialsSignin` พร้อม `code` (ดู `src/lib/auth/messages.ts`) ส่วน `events.signOut` เขียน `logout`
  - session แบบ **JWT** (cookie เข้ารหัสด้วย `AUTH_SECRET`) เก็บแค่ `{ username, name }` อายุ **8 ชม. นับจากเวลาล็อกอิน** โดย callback `jwt` เก็บ `loginAt` และตัด session ที่เกิน 8 ชม. ทิ้ง เพราะ Auth.js ต่ออายุ cookie ทุกครั้งที่อ่าน session
  - `trustHost: true` (อยู่หลัง nginx บน intranet) และ `pages.signIn` = `pages.error` = `/login`
  - สร้าง config ต่อ request (lazy init) เพื่อให้ได้ IP ของ client สำหรับ rate limit/audit และให้อ่าน env ตอน runtime
  - เปลี่ยน logger ของ Auth.js ให้พิมพ์แค่ชนิดของ error บรรทัดเดียว (ไม่มี stack, body หรือรายละเอียดฐานข้อมูล)
- `src/app/api/auth/[...nextauth]/route.ts`: route ของ Auth.js (`export const { GET, POST } = handlers`) ห้ามสร้าง route อื่นใต้ `/api/auth/` เพราะจะชนกับ catch-all
- `src/lib/auth/guard.ts`: `requireSession(route)` เรียก `connection()` ก่อน (ให้ทำงานทุก request และไม่ถูก prerender) จากนั้นตรวจ `AUTH_SECRET` (ไม่มีหรือสั้นกว่า 32 ตัว -> 503) และ `auth()` (ไม่มี session -> 401)
- `src/lib/auth/settings.ts`: อายุ session, `isAuthConfigured()`, `secureCookiesEnabled()`
- `src/lib/auth/messages.ts`: ข้อความภาษาไทยและ code ของ error การล็อกอิน (ใช้ทั้ง server และ client)
- `src/lib/auth/types.ts`: interface `AuthProvider` และ `AuthUser`
- `src/lib/auth/provider.ts`: เลือก provider ด้วย env `AUTH_PROVIDER` = `local` (ค่าเริ่มต้น) หรือ `hosxp` ถ้าจะเปลี่ยนวิธียืนยันตัวตน ให้เพิ่ม provider ใหม่แล้วเลือกในไฟล์นี้
- `src/lib/auth/providers/hosxp.ts`: ตรวจกับตาราง `opduser`
- `src/lib/auth/providers/local.ts`: บัญชีเดียวจาก env `AUTH_USERNAME` / `AUTH_PASSWORD` (ชื่อแสดงผลจาก `AUTH_DISPLAY_NAME` ค่าเริ่มต้น "ผู้ดูแลระบบ") เทียบด้วย SHA-256 + `timingSafeEqual` ถ้าตัวใดตัวหนึ่งว่างจะล็อกอินไม่ได้ ไม่มีค่า default ในโค้ด (repo เป็น public)
- `src/lib/auth/rate-limit.ts`: จำกัดจำนวนครั้งที่ล้มเหลวในหน่วยความจำ ไม่เกิน 5 ครั้ง/5 นาทีต่อ IP+username และไม่เกิน 20 ครั้ง/5 นาทีต่อ IP ถ้าเกินจะได้ `code=rate_limited_<นาที>` และฟอร์มแสดง "พยายามเข้าสู่ระบบหลายครั้งเกินไป กรุณาลองใหม่ในอีก N นาที"
- `src/lib/auth/audit.ts`: เขียน audit log หนึ่งบรรทัดต่อเหตุการณ์ด้วย `console.info`
- `src/lib/auth/redirect.ts`: ตรวจ `callbackUrl` ว่าเป็น path ภายใน (หรือ URL เต็มที่ origin เดียวกัน) ถ้าไม่ใช่จะกลับไป `/`
- `src/components/auth/AuthProvider.tsx`: ห่อ `SessionProvider` ของ `next-auth/react` และมี hook `useAuth()` ที่คืน `status`, `displayName`, `login` (= `signIn("credentials", { redirect: false })`), `logout` (= `signOut({ redirect: false })`) และ `markLoggedOut` ฝั่ง client โหลด session จาก `/api/auth/session` หลัง hydrate หน้า `/` จึงยังเป็น Partial Prerender (ไม่เรียก `cookies()` ตอน render)
- `src/components/auth/{LoginForm,HeaderAuth,LoginPageClient}.tsx`: ฟอร์ม ปุ่มบน header และหน้า `/login?callbackUrl=/...`

### Cookie และ HTTP

ค่าปกติของ Auth.js คือตั้ง cookie แบบ Secure (ชื่อขึ้นต้นด้วย `__Secure-` / `__Host-`) ตาม protocol ของ URL แต่ระบบนี้กำหนด `useSecureCookies` เองใน `src/auth.ts` เพื่อให้ route handler และ `auth()` ใช้ชื่อ cookie เดียวกันเสมอเมื่ออยู่หลัง nginx

- `NODE_ENV=production`: cookie เป็น Secure (ใช้ได้เฉพาะ HTTPS)
- `AUTH_COOKIE_INSECURE=true`: cookie ไม่เป็น Secure ใช้ชื่อ `authjs.session-token` / `authjs.csrf-token` **production ปัจจุบัน (http://10.10.10.159:82) ต้องตั้งค่านี้** ไม่เช่นนั้นเบราว์เซอร์จะทิ้ง cookie และล็อกอินไม่ได้ (`scripts/deploy-kpi.sh` ตั้งให้ตอนสร้าง `.env` ครั้งแรก)

cookie ทุกตัวเป็น httpOnly, SameSite=Lax, path=/

### Env บน production

| ตัวแปร | ค่า |
| --- | --- |
| `AUTH_SECRET` | ค่าสุ่มอย่างน้อย 32 ตัว (ใช้ค่าเดิมต่อได้ แต่ทุกคนต้องล็อกอินใหม่ เพราะรูปแบบ cookie เปลี่ยน) |
| `AUTH_COOKIE_INSECURE` | `true` ตราบใดที่ยังเป็น http |
| `AUTH_PROVIDER` | `local` หรือ `hosxp` |
| `AUTH_USERNAME`, `AUTH_PASSWORD`, `AUTH_DISPLAY_NAME` | ใช้เมื่อ `AUTH_PROVIDER=local` |
| `AUTH_URL`, `AUTH_TRUST_HOST` | ไม่ต้องตั้ง (nginx ส่ง `Host: $http_host` อยู่แล้ว และเปิด `trustHost` ไว้ในโค้ด) ถ้าตั้ง `AUTH_URL` ต้องเป็น origin เท่านั้น ห้ามมี path เพราะ path จะไปเปลี่ยน basePath ของ Auth.js |

### ทดสอบด้วย curl

```sh
B=http://localhost:3000; J=jar.txt
CSRF=$(curl -s -c $J -b $J $B/api/auth/csrf | node -pe "JSON.parse(require('fs').readFileSync(0)).csrfToken")
curl -s -c $J -b $J -X POST $B/api/auth/callback/credentials \
  -H 'X-Auth-Return-Redirect: 1' --data-urlencode "csrfToken=$CSRF" \
  --data-urlencode 'username=<user>' --data-urlencode 'password=<pass>'
# {"url":".../"} = สำเร็จ
# {"url":".../login?error=CredentialsSignin&code=..."} = ไม่สำเร็จ
curl -s -o /dev/null -w '%{http_code}\n' -b $J "$B/api/kpi/screening/persons?code=DM&fy=2570&village=1"
```

ให้ดูแค่ status code ห้ามพิมพ์ body ของ persons/export เพราะมีรายชื่อผู้ป่วย

## Provider `hosxp` (ใช้เมื่อ `AUTH_PROVIDER=hosxp`)

### สมมติฐานตาราง `opduser` (ต้อง verify ผ่าน `db-cli` ก่อนใช้งานจริง)

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
- ไม่มี `account_disable`: ต้องลบออกจาก query ไม่เช่นนั้นการล็อกอินจะขึ้น "ไม่สามารถตรวจสอบบัญชีผู้ใช้ได้ในขณะนี้" ทุกครั้ง
- เก็บรหัสผ่านไว้ในคอลัมน์ `password`
- ใช้ hash แบบอื่น

## Audit log (PDPA)

```
[audit] 2026-11-06T03:00:00.000Z action=persons user=nurse01 code=DM fy=2570 village=12 rows=153
[audit] 2026-11-06T03:01:00.000Z action=export user=nurse01 code=DM fy=2570 village=all rows=4200
[audit] 2026-11-06T02:59:00.000Z action=login_success user=nurse01 ip=10.0.0.5
[audit] 2026-11-06T02:58:00.000Z action=login_failed user=nurse01 ip=10.0.0.5
[audit] 2026-11-06T02:58:30.000Z action=login_rate_limited user=nurse01 ip=10.0.0.5
[audit] 2026-11-06T05:00:00.000Z action=logout user=nurse01 ip=10.0.0.5
```

log ไม่มีรหัสผ่าน, hash, cookie หรือข้อมูลผู้ป่วย ถ้าต้องเก็บ log ตามระยะเวลาที่ PDPA กำหนด ให้เก็บ stdout ของ process (เช่นผ่าน pm2/systemd)

## ข้อจำกัด

- session เป็นแบบ stateless (JWT) logout จึงทำได้แค่ลบ cookie ในเบราว์เซอร์นั้น ถ้า cookie ถูกคัดลอกไป จะยังใช้ได้จนครบ 8 ชม. นับจากล็อกอิน ถ้าต้องการยกเลิกทุก session ทันที ให้เปลี่ยน `AUTH_SECRET`
- rate limit อยู่ในหน่วยความจำของ process เดียว รีสตาร์ตแล้วค่าจะหายไป
- IP อ่านจาก `X-Forwarded-For` ซึ่งเชื่อถือได้เฉพาะเมื่ออยู่หลัง reverse proxy ที่ตั้ง header นี้เอง
- CSRF ของ `/api/auth/*` ใช้ double-submit token ของ Auth.js (cookie `authjs.csrf-token`) ไม่ได้ตรวจ Origin
- next-auth v5 ยังเป็น beta: API อาจเปลี่ยนเมื่ออัปเกรด
