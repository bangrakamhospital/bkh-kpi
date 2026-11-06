# การเข้าสู่ระบบ (Authentication)

หลักการ: **ตัวเลขสรุปดูได้ทุกคน ส่วนรายชื่อผู้รับบริการต้องเข้าสู่ระบบก่อน**

การเข้าสู่ระบบใช้ **SSO ผ่าน PLK Health ID / MOPH Provider ID (OpenID Connect) อย่างเดียว** หน้าเว็บไม่มีฟอร์มชื่อผู้ใช้/รหัสผ่านแล้ว
การล็อกอินด้วยรหัสผ่าน (Credentials) เปิดได้เฉพาะกรณีฉุกเฉินด้วย `AUTH_PASSWORD_LOGIN=true` และใช้ได้ผ่าน API เท่านั้น (ดูหัวข้อ "ทดสอบด้วย curl")

| Route | สิทธิ์ |
| --- | --- |
| `/` หน้าแรก, ตารางตัวชี้วัด | สาธารณะ |
| `GET /api/kpi/screening/villages` (ตัวเลขรายหมู่) | สาธารณะ |
| `GET /api/kpi/screening/persons` (รายชื่อ) | ต้องล็อกอิน |
| `GET /api/kpi/screening/export` (Excel มีชีตรายชื่อ) | ต้องล็อกอิน |
| `/api/auth/*` ของ Auth.js (`session`, `csrf`, `providers`, `signin/plkhealth`, `callback/plkhealth`, `signout`) | สาธารณะ (POST ต้องมี CSRF token ของ Auth.js) |
| `/auth/callback` redirect URI ที่ลงทะเบียนกับ IdP: 307 ส่งต่อ query เดิมไป `/api/auth/callback/plkhealth` | สาธารณะ |
| `/login` หน้าเข้าสู่ระบบ | สาธารณะ |

ถ้าไม่ได้ล็อกอิน route ที่ต้องล็อกอินจะตอบ `401 { "error": "กรุณาเข้าสู่ระบบ" }` และ `Cache-Control: private, no-store`
การตรวจสิทธิ์อยู่ใน route handler เอง (`requireSession()` ใน `src/lib/auth/guard.ts` ซึ่งเรียก `auth()` ของ Auth.js) ไม่ได้ใช้ proxy/middleware

## SSO: PLK Health ID / Provider ID

Flow: ปุ่ม "เข้าสู่ระบบด้วย Provider ID" (`signIn("plkhealth")`) -> IdP -> `{origin}/auth/callback?code=&state=` -> 307 -> `/api/auth/callback/plkhealth` -> Auth.js แลก code เป็น token (ตรวจ PKCE + state + nonce, ตรวจ id_token แล้วดึง claims จาก userinfo) -> callback `signIn` ตรวจหน่วยงาน -> ออก session cookie -> กลับไปหน้าเดิม

- IdP รับเฉพาะ redirect URI `{origin}/auth/callback` ไม่ใช่ค่าเริ่มต้นของ Auth.js (`/api/auth/callback/plkhealth`) จึงใช้ `AUTH_PLKHEALTH_REDIRECT_URI` แทน `redirect_uri` ทั้งใน authorize request (`authorization.params`) และ token request (`customFetch`) ซึ่งสองจุดต้องตรงกัน (`src/lib/auth/sso.ts`)
- ผู้ใช้ต้องเปิดเว็บด้วย origin เดียวกับ redirect URI (scheme + host + port) เพราะ cookie state/PKCE/nonce ผูกกับ origin ถ้าเปิดด้วย origin อื่นจะล็อกอินไม่สำเร็จ (`?error=Configuration`) และ server จะ log `[auth] request origin ... differs ...` ครั้งเดียวต่อ origin
- ตัวตนใน session คือ OIDC `sub` (`account.providerAccountId`; Auth.js ตั้ง `user.id` เป็น UUID สุ่มทุกครั้งจึงใช้ไม่ได้) ใช้เป็น `username` ใน session และ audit log ส่วนชื่อแสดงผลมาจาก `prename + fname + lname` ข้อมูล profile อื่น (หน่วยงาน, email) ไม่ถูกเก็บใน cookie
- **การจำกัดหน่วยงานเป็นแบบ fail-closed:** `AUTH_PLKHEALTH_ALLOWED_ORGS` ว่าง = ปฏิเสธการล็อกอิน SSO ทุกครั้ง (`/login?error=AccessDenied&code=org_not_configured`) ต้องระบุรหัสหน่วยงาน (hospcode) คั่นด้วย comma เช่น `11252` หรือ `*` เพื่อยอมรับทุกบัญชี (ไม่แนะนำ เพราะ Provider ID ใช้ทั้งประเทศ) ถ้าหน่วยงานไม่ตรงจะได้ `code=org_not_allowed`
- ถ้าตั้ง env ไม่ครบ หรือ redirect URI ไม่ใช่ URL http(s) ที่มี path `/auth/callback` ระบบจะปิด SSO (ปุ่มกดไม่ได้ ขึ้นข้อความ "ระบบเข้าสู่ระบบยังไม่พร้อมใช้งาน") และ log warning หนึ่งครั้ง
- ถ้าผู้ใช้กดเข้าสู่ระบบจาก dialog รายหมู่บ้าน ระบบจะจำรายการที่ค้างไว้ (ดูรายชื่อหมู่ใด / ดาวน์โหลด Excel) ใน `sessionStorage` (เก็บแค่รหัสตัวชี้วัด ปีงบ และตัวเลขสรุปของหมู่บ้าน ไม่มีข้อมูลผู้ป่วย หมดอายุใน 10 นาที) แล้วเปิด dialog และทำรายการต่อเมื่อกลับมาในสถานะล็อกอินแล้ว (`src/components/kpi/pending-login.ts`)

| ค่าบน `/login?error=` | ความหมาย |
| --- | --- |
| `AccessDenied&code=org_not_allowed` | หน่วยงานของบัญชีไม่อยู่ใน `AUTH_PLKHEALTH_ALLOWED_ORGS` |
| `AccessDenied&code=org_not_configured` | ยังไม่ได้ตั้ง `AUTH_PLKHEALTH_ALLOWED_ORGS` |
| `AccessDenied` | ไม่มี `sub` ใน profile หรือถูกปฏิเสธด้วยเหตุอื่น |
| `OAuthCallbackError` | IdP ตอบ error เช่นผู้ใช้กดยกเลิก |
| `OAuthSignInError` | เริ่มการล็อกอินไม่ได้ เช่นเรียก discovery ของ IdP ไม่ได้ |
| `Configuration` | ตั้งค่าผิด หรือ cookie state/PKCE หาย/หมดอายุ (เปิดผิด origin, ค้างที่ IdP เกิน 15 นาที) |

## สถาปัตยกรรม (Auth.js / next-auth v5)

ใช้ `next-auth@5.0.0-beta.32` / `@auth/core@0.41.3` (pin เวอร์ชันตรงเพราะ v5 ยังเป็น beta) ถ้าจะอัปเกรด ให้ตรวจว่า `customFetch` ยังถูกใช้กับ token request (`@auth/core/lib/actions/callback/oauth/callback.js`) และ `authorization.params` ยัง override `redirect_uri` ได้ (`lib/actions/signin/authorization-url.js`) แล้วทดสอบ flow ใหม่

- `src/auth.ts`: ตั้งค่า Auth.js และ export `{ handlers, auth, signIn, signOut }`
  - **SSO provider** จาก `ssoProvider()` (เปิดเมื่อตั้ง `AUTH_PLKHEALTH_*` ครบ) callback `signIn` ตรวจ `sub` และหน่วยงาน แล้วเขียน audit `login_success` / `login_failed`
  - **Credentials provider** (เฉพาะ `AUTH_PASSWORD_LOGIN=true`) เรียก provider เดิมผ่าน `getAuthProvider()` (`AUTH_PROVIDER` = `local` | `hosxp`) ใน `authorize()` จะตรวจ rate limit, เขียน audit log (`login_success` / `login_failed` / `login_rate_limited`) และโยน `CredentialsSignin` พร้อม `code`
  - `events.signOut` เขียน audit `logout`
  - session แบบ **JWT** (cookie เข้ารหัสด้วย `AUTH_SECRET`) เก็บแค่ `{ username, name }` อายุ **8 ชม. นับจากเวลาล็อกอิน** โดย callback `jwt` เก็บ `loginAt` และตัด session ที่เกิน 8 ชม. ทิ้ง เพราะ Auth.js ต่ออายุ cookie ทุกครั้งที่อ่าน session
  - `trustHost: true` (อยู่หลัง nginx) และ `pages.signIn` = `pages.error` = `/login`
  - สร้าง config ต่อ request (lazy init) เพื่อให้ได้ IP ของ client สำหรับ rate limit/audit และให้อ่าน env ตอน runtime
  - เปลี่ยน logger ของ Auth.js ให้พิมพ์แค่ชนิดของ error บรรทัดเดียว (ไม่มี stack, token, profile หรือรายละเอียดฐานข้อมูล)
- `src/app/api/auth/[...nextauth]/route.ts`: route ของ Auth.js ห้ามสร้าง route อื่นใต้ `/api/auth/` เพราะจะชนกับ catch-all
- `src/app/auth/callback/route.ts`: redirect URI ของ IdP ส่งต่อแบบ 307 (relative Location, `Cache-Control: no-store`, `Referrer-Policy: no-referrer`)
- `src/lib/auth/sso.ts`: provider OIDC, ตรวจ env/redirect URI, `checkOrg()` (allow-list หน่วยงาน), warning เมื่อ origin ไม่ตรง
- `src/lib/auth/sso-id.ts`: ค่าคงที่ `SSO_PROVIDER_ID` / `SSO_REDIRECT_PATH` ใช้ร่วมกันทั้ง server และ client
- `src/lib/auth/guard.ts`: `requireSession(route)` เรียก `connection()` ก่อน (ให้ทำงานทุก request และไม่ถูก prerender) จากนั้นตรวจ `AUTH_SECRET` (ไม่มีหรือสั้นกว่า 32 ตัว -> 503) และ `auth()` (ไม่มี session -> 401)
- `src/lib/auth/settings.ts`: อายุ session, `isAuthConfigured()`, `secureCookiesEnabled()`
- `src/lib/auth/messages.ts`: ข้อความภาษาไทยและ code ของ error การล็อกอิน (ใช้ทั้ง server และ client)
- `src/lib/auth/types.ts`, `provider.ts`, `providers/{hosxp,local}.ts`, `rate-limit.ts`: ใช้เฉพาะเมื่อ `AUTH_PASSWORD_LOGIN=true`
  - `providers/local.ts`: บัญชีเดียวจาก env `AUTH_USERNAME` / `AUTH_PASSWORD` (ชื่อแสดงผลจาก `AUTH_DISPLAY_NAME`) เทียบด้วย SHA-256 + `timingSafeEqual` ถ้าตัวใดตัวหนึ่งว่างจะล็อกอินไม่ได้ ไม่มีค่า default ในโค้ด (repo เป็น public)
  - `rate-limit.ts`: จำกัดครั้งที่ล้มเหลวในหน่วยความจำ ไม่เกิน 5 ครั้ง/5 นาทีต่อ IP+username และ 20 ครั้ง/5 นาทีต่อ IP (`code=rate_limited_<นาที>`)
- `src/lib/auth/audit.ts`: เขียน audit log หนึ่งบรรทัดต่อเหตุการณ์ด้วย `console.info`
- `src/lib/auth/redirect.ts`: ตรวจ `callbackUrl` ว่าเป็น path ภายใน (หรือ URL เต็มที่ origin เดียวกัน) และไม่ใช่ `/login`, `/api/*`, `/auth/*` ถ้าไม่ผ่านจะกลับไป `/`
- `src/components/auth/AuthProvider.tsx`: ห่อ `SessionProvider` และมี hook `useAuth()` ที่คืน `status`, `displayName`, `logout` และ `markLoggedOut` ฝั่ง client โหลด session จาก `/api/auth/session` หลัง hydrate หน้า `/` จึงยังเป็น Partial Prerender
- `src/components/auth/SsoLogin.tsx`: ปุ่มเข้าสู่ระบบด้วย Provider ID (ใช้ทั้งหน้า `/login` และ dialog รายหมู่บ้าน)
- `src/components/auth/{HeaderAuth,LoginPageClient}.tsx`: ปุ่มบน header และหน้า `/login?callbackUrl=/...`

### Cookie และ HTTP

ระบบกำหนด `useSecureCookies` เองใน `src/auth.ts` เพื่อให้ route handler และ `auth()` ใช้ชื่อ cookie เดียวกันเสมอเมื่ออยู่หลัง nginx

- `NODE_ENV=production`: cookie เป็น Secure (ชื่อขึ้นต้นด้วย `__Secure-` / `__Host-`) ใช้ได้เฉพาะ HTTPS **production ปัจจุบันเป็น HTTPS (`https://10.10.10.159:82`) จึงต้องปล่อย `AUTH_COOKIE_INSECURE` ว่าง**
- `AUTH_COOKIE_INSECURE=true`: cookie ไม่เป็น Secure ใช้เฉพาะเมื่อเสิร์ฟผ่าน http ธรรมดา (เบราว์เซอร์ทิ้ง Secure cookie บน http://) ถ้า `.env` บน server ยังมีค่านี้หลังย้ายเป็น HTTPS ให้ลบออกเอง (`scripts/deploy-kpi.sh` ไม่แก้ `.env` ที่มีอยู่แล้ว)

cookie ทุกตัวเป็น httpOnly, SameSite=Lax, path=/ (cookie state/PKCE/nonce อายุ 15 นาที ถูกส่งไปกับ redirect จาก IdP ได้เพราะเป็น top-level GET)

### Env

| ตัวแปร | ค่า |
| --- | --- |
| `AUTH_SECRET` | ค่าสุ่มอย่างน้อย 32 ตัว |
| `AUTH_PLKHEALTH_ISSUER`, `AUTH_PLKHEALTH_ID`, `AUTH_PLKHEALTH_SECRET` | issuer / client id / client secret จาก IdP |
| `AUTH_PLKHEALTH_REDIRECT_URI` | ต้องตรงกับที่ลงทะเบียนที่ IdP ทุกตัวอักษร dev `http://localhost:3000/auth/callback`, prod `https://10.10.10.159:82/auth/callback` |
| `AUTH_PLKHEALTH_ALLOWED_ORGS` | **ต้องตั้ง** รหัสหน่วยงานคั่นด้วย comma เช่น `11252` (ว่าง = ปฏิเสธ SSO ทั้งหมด, `*` = ทุกหน่วยงาน) |
| `AUTH_COOKIE_INSECURE` | ว่างบน HTTPS, `true` เฉพาะ http ธรรมดา |
| `AUTH_PASSWORD_LOGIN` | ว่าง (ปิด) ตั้ง `true` เฉพาะกรณีฉุกเฉิน |
| `AUTH_PROVIDER`, `AUTH_USERNAME`, `AUTH_PASSWORD`, `AUTH_DISPLAY_NAME` | ใช้เมื่อ `AUTH_PASSWORD_LOGIN=true` เท่านั้น |
| `AUTH_URL`, `AUTH_TRUST_HOST` | ไม่ต้องตั้ง (nginx ส่ง `Host: $http_host` อยู่แล้ว และเปิด `trustHost` ไว้ในโค้ด) ถ้าตั้ง `AUTH_URL` ต้องเป็น origin เท่านั้น ห้ามมี path |

### ทดสอบด้วย curl

SSO ต้องทดสอบผ่านเบราว์เซอร์ (มี redirect ไป IdP) ตรวจเบื้องต้นได้ด้วย:

```sh
B=http://localhost:3000
curl -s $B/api/auth/providers                            # ต้องมี "plkhealth" เมื่อตั้ง env ครบ
curl -s -i "$B/auth/callback?code=x&state=y" | head -5   # 307 -> /api/auth/callback/plkhealth?code=x&state=y
```

Credentials (เฉพาะเมื่อ `AUTH_PASSWORD_LOGIN=true`):

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

## Provider `hosxp` (ใช้เมื่อ `AUTH_PASSWORD_LOGIN=true` และ `AUTH_PROVIDER=hosxp`)

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
[audit] 2026-11-06T03:00:00.000Z action=persons user=<sub> code=DM fy=2570 village=12 rows=153
[audit] 2026-11-06T03:01:00.000Z action=export user=<sub> code=DM fy=2570 village=all rows=4200
[audit] 2026-11-06T02:59:00.000Z action=login_success user=<sub> ip=10.0.0.5
[audit] 2026-11-06T02:58:00.000Z action=login_failed user=<sub> ip=10.0.0.5
[audit] 2026-11-06T02:58:30.000Z action=login_rate_limited user=nurse01 ip=10.0.0.5
[audit] 2026-11-06T05:00:00.000Z action=logout user=<sub> ip=10.0.0.5
```

`user` คือ OIDC `sub` ของ Provider ID (หรือ loginname เมื่อใช้ Credentials) `login_failed` ของ SSO ที่ไม่มี `sub` จะเป็น `user=-` ส่วน `login_rate_limited` มีเฉพาะ Credentials
log ไม่มีรหัสผ่าน, hash, cookie, token หรือข้อมูลผู้ป่วย ถ้าต้องเก็บ log ตามระยะเวลาที่ PDPA กำหนด ให้เก็บ stdout ของ process (เช่นผ่าน pm2/systemd)

## ข้อจำกัด

- session เป็นแบบ stateless (JWT) logout จึงทำได้แค่ลบ cookie ในเบราว์เซอร์นั้น (ไม่ได้ logout ที่ IdP) ถ้า cookie ถูกคัดลอกไป จะยังใช้ได้จนครบ 8 ชม. นับจากล็อกอิน ถ้าต้องการยกเลิกทุก session ทันที ให้เปลี่ยน `AUTH_SECRET`
- หน่วยงานถูกตรวจตอนล็อกอินเท่านั้น ถ้าเปลี่ยน `AUTH_PLKHEALTH_ALLOWED_ORGS` session เดิมยังใช้ได้จนหมดอายุ
- rate limit (Credentials) อยู่ในหน่วยความจำของ process เดียว รีสตาร์ตแล้วค่าจะหายไป
- IP อ่านจาก `X-Forwarded-For` ซึ่งเชื่อถือได้เฉพาะเมื่ออยู่หลัง reverse proxy ที่ตั้ง header นี้เอง
- CSRF ของ `/api/auth/*` ใช้ double-submit token ของ Auth.js (cookie `authjs.csrf-token`) ไม่ได้ตรวจ Origin
- next-auth v5 ยังเป็น beta: API อาจเปลี่ยนเมื่ออัปเกรด
