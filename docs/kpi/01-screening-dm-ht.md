# KPI 1: การคัดกรองเบาหวาน (DM) และความดันโลหิตสูง (HT) ในประชาชนอายุ 35 ปีขึ้นไป

> สถานะ: **นิยามพร้อมใช้ / SQL ของ HOSxP verify กับฐานจริงแล้ว (db-cli, 2026-11-06)**
> โค้ด: `src/lib/kpi/screening.ts` (`getScreeningKpi`), นิยาม/ป้ายแสดงผล: `src/lib/kpi/screening-indicators.ts`,
> SQL: `src/lib/kpi/sql/screening-hosxp.ts` (DM/HT) + ตัวสร้าง SQL กลาง `src/lib/kpi/sql/screening-common.ts` (ใช้ร่วมกับ CX/BR ใน 03, 04),
> source: `src/lib/kpi/sources/screening-his.ts` (ค่าเริ่มต้น) / `screening-mock.ts` (ใช้เมื่อ `KPI_DATA_SOURCE=mock`)
> แหล่งอ้างอิง: Template ตัวชี้วัดของ กสธ. / HDC (แฟ้ม PERSON / NCDSCREEN ของมาตรฐาน 43 แฟ้ม)

## 1. ตัวชี้วัด

| รหัส | ชื่อ | เป้าหมาย |
| --- | --- | --- |
| DM | ร้อยละของประชาชนอายุ 35 ปีขึ้นไปที่ได้รับการคัดกรองเบาหวาน | ≥ 90% |
| HT | ร้อยละของประชาชนอายุ 35 ปีขึ้นไปที่ได้รับการคัดกรองความดันโลหิตสูง | ≥ 90% |

## 2. ช่วงเวลา

- ปีงบประมาณ (พ.ศ.) คือ 1 ต.ค. ของปีก่อนหน้าถึง 30 ก.ย. เช่น ปีงบฯ 2570 = 2026-10-01 ถึง 2027-09-30
- ผลเป็นแบบ**สะสม**ตั้งแต่ 1 ต.ค. ถึงวันตัดข้อมูล (`dataAsOf`) โดยปีงบฯ ปัจจุบันใช้วันนี้ (เวลาไทย Asia/Bangkok) ส่วนปีงบฯ ที่ผ่านไปแล้วใช้ 30 ก.ย.
- รายเดือน: `screened` คือจำนวนคนที่ได้รับการคัดกรอง**ครั้งแรก**ของปีงบฯ ในเดือนนั้น ผลรวมทุกเดือนจึงเท่ากับตัวตั้ง (A)

## 3. ตัวหาร (B): กลุ่มเป้าหมาย

ประชาชนที่มีคุณสมบัติครบทุกข้อต่อไปนี้

1. อายุ ≥ 35 ปีเต็ม **ณ วันที่ 1 ต.ค. ของปีงบฯ** (วันเกิด ≤ 1 ต.ค. ของปีงบฯ ลบ 35 ปี)
2. อาศัยอยู่ในเขตรับผิดชอบ (TYPEAREA 1, 3) และบ้านอยู่ในหมู่บ้านของเขตรับผิดชอบจริง (ไม่นับหมู่บ้านหลอก "นอกเขตรับผิดชอบ" หมู่ 0 และคนที่ไม่ระบุหมู่บ้าน)
3. ยังมีชีวิตอยู่และยังไม่ถูกจำหน่าย (DISCHARGE = 9)
4. นับเป็น**คน** (distinct `person_id`)
5. **คัดออก**ผู้ที่ได้รับการวินิจฉัยโรคนั้น**ก่อน 1 ต.ค. ของปีงบฯ**
   - DM: ICD-10 `E10`–`E14` (รวมรหัสย่อย)
   - HT: ICD-10 `I10`–`I15` (รวมรหัสย่อย)
   - หรือเป็นสมาชิกคลินิกโรคเรื้อรัง (`clinicmember`) ที่ลงทะเบียนก่อน 1 ต.ค. (หรือไม่ระบุวันลงทะเบียน): DM คลินิก `001` โรคเบาหวาน, HT คลินิก `002` โรคความดันโลหิตสูง

ตัวหารของ DM และ HT **แยกกัน**

## 4. ตัวตั้ง (A): ได้รับการคัดกรอง

คนใน B ที่มีบันทึกการคัดกรองซึ่งวันที่คัดกรองอยู่ระหว่าง 1 ต.ค. ถึง `dataAsOf` และมีผลตรวจที่ใช้ได้

- DM: มีค่าน้ำตาลในเลือดค่าใดค่าหนึ่งมากกว่า 0 (`last_fgc` DTX อดอาหาร, `last_fgc_no_food_limit` DTX ไม่อดอาหาร, `last_fpg` FPG, `ppg`) ตรงกับ NCDSCREEN.BSTEST 1–4
- HT: มีค่าความดัน systolic และ diastolic มากกว่า 0

แต่ละคนนับได้ 1 ครั้งต่อปีงบฯ และนับเข้าเดือนของการคัดกรองครั้งแรก

## 5. สูตร

```
ร้อยละ = (A / B) × 100
```

ปัดเป็นทศนิยม 2 ตำแหน่ง ถ้า B = 0 ให้ได้ 0
`cumulativePercent` ของแต่ละเดือน = (ผลรวมของ `screened` ตั้งแต่ ต.ค. ถึงเดือนนั้น / B) × 100

## 6. สมมติฐานที่เลือก

| ประเด็น | สิ่งที่เลือก | เหตุผล |
| --- | --- | --- |
| นับครั้งหรือนับคน | นับ**คน** | ตรงกับ HDC และทำให้ A ≤ B เสมอ เพราะ A ใช้ตัวกรองกลุ่มเป้าหมายชุดเดียวกับ B |
| วันที่ใช้คิดอายุ | 1 ต.ค. ของปีงบฯ | ตามที่กำหนด ทำให้ B คงที่ตลอดปี |
| เกณฑ์คัดออก | วินิจฉัยใน `ovstdiag` ก่อน 1 ต.ค. **หรือ** เป็นสมาชิก `clinicmember` (DM `001`, HT `002`) ที่ลงทะเบียนก่อน 1 ต.ค. | คลินิกจับผู้ป่วยเดิมที่วินิจฉัยจากที่อื่นและไม่มี diagnosis ใน `ovstdiag` (ปีงบ 2569 คัดออกเพิ่ม DM ราว 89 คน, HT ราว 223 คน) |
| หมู่บ้าน | ต้องเป็นหมู่บ้านในเขต (`village_moo` ไม่ใช่ 0) | ฐานนี้มีหมู่บ้านหลอก "นอกเขตรับผิดชอบ" (หมู่ 0) ที่ยังมีคน TYPEAREA 1/3 อยู่ราว 700 คน (ข้อมูลขัดกัน) HDC นับเฉพาะคนที่บ้านอยู่ในหมู่บ้านของเขต |
| สถานะประชากร | สถานะใน `person` ณ วันที่ประมวลผล | HOSxP ไม่เก็บประวัติ TYPEAREA ย้อนหลัง |
| แหล่งผลคัดกรอง | `person_dmht_risk_screen_head` (งานคัดกรอง DM/HT ของ HOSxP ที่ส่งออกเป็นแฟ้ม NCDSCREEN) | ตรงนิยาม HDC ไม่นับการวัดใน `opdscreen` ตอนมารับบริการ OPD เพราะไม่ใช่ NCDSCREEN |
| การคัดกรองนอกหน่วยบริการ | ไม่นับ | HIS มีเฉพาะข้อมูลของหน่วยบริการเอง ค่าที่ได้จึงอาจต่ำกว่า HDC |
| ปีงบฯ ที่รองรับ | 2560 ถึงปีงบฯ ปัจจุบัน | ถ้าอยู่นอกช่วงจะ throw `RangeError` |

## 7. SQL สำหรับ HOSxP (verify แล้ว)

> ตรวจกับฐานจริง (`bkhosxp`, MariaDB 10.11, HOSxP รุ่นโรงพยาบาล) ผ่าน skill `db-cli` เมื่อ 2026-11-06 ด้วย DESCRIBE / COUNT / GROUP BY เท่านั้น
> โค้ดที่ใช้งานจริงอยู่ใน `src/lib/kpi/sql/screening-hosxp.ts` (ตัวกรองและ subquery ของ DM/HT) กับ `src/lib/kpi/sql/screening-common.ts` (ตัวกรองประชากร/อายุ/คัดออก และตัวสร้าง query ทั้ง 5 แบบ) ถ้าแก้ตรงนั้นให้อัปเดตเอกสารนี้ตามด้วย

### 7.1 ตาราง/คอลัมน์ที่ใช้ และผลการตรวจ

| ตาราง.คอลัมน์ | สิ่งที่พบในฐานจริง |
| --- | --- |
| `person.person_id` | int PK |
| `person.birthdate` | DATE |
| `person.house_regist_type_id` | **int** อ้าง `house_regist_type`: 1 = มีชื่อตามทะเบียนบ้านและอยู่จริง, 2 = มีชื่อแต่ไม่อยู่จริง, 3 = มาอาศัยในเขตแต่ทะเบียนบ้านอยู่นอกเขต, 4 = อยู่นอกเขตและมารับบริการ, 5 = อาศัยในเขตแต่ไม่อยู่ตามทะเบียนบ้าน (เช่น คนเร่ร่อน) → ใช้ 1, 3 ตรงกับ TYPEAREA |
| `person.person_discharge_id` | **int** อ้าง `person_discharge`: 1 เสียชีวิต, 2 ย้าย, 3 สาบสูญ, 9 ยังอาศัยอยู่ → ใช้ 9 |
| `person.death` | char(1) `'Y'`/`'N'` (เก็บไว้เป็น safety net สอดคล้องกับ discharge แทบทั้งหมด) |
| `person.sex` | char(1) `'1'` ชาย, `'2'` หญิง |
| `person.nationality` | varchar(3) `'99'` = ไทย (อ้าง `nationality`) |
| `person.patient_hn` | varchar(9) มี index ไม่มีค่าว่างในกลุ่มเป้าหมาย ใช้เชื่อมกับ `ovstdiag.hn` / `ovst.hn` / `clinicmember.hn` |
| `person.village_id` → `village(village_id, village_moo, village_name)` | มี index ที่ `person.village_id`; `village_moo` เป็น varchar (`'01'`–`'19'`) มีหมู่บ้านหลอก `village_moo = '0'` ชื่อ "นอกเขตรับผิดชอบ" → **คัดออก** |
| `ovstdiag.hn`, `.icd10`, `.vstdate` | icd10 เก็บแบบ**ไม่มีจุด** (เช่น `E119`, `I10`) มี index ที่ `hn`, `icd10`, `vstdate` |
| `clinicmember(hn, clinic, regdate)` | unique index (hn, clinic); คลินิก `001` โรคเบาหวาน, `002` โรคความดันโลหิตสูง; regdate เป็น NULL ส่วนน้อย (นับเป็นผู้ป่วยเดิม) |
| `person_dmht_screen_summary(person_dmht_screen_summary_id, person_id, bdg_year)` | หัวการคัดกรองรายปีของแต่ละคน (`bdg_year` ไม่ได้ใช้ เพราะไม่ตรงปีงบฯ เสมอไป ใช้ `screen_date` แทน) |
| `person_dmht_risk_screen_head(person_dmht_screen_summary_id, screen_date, last_bps, last_bpd, last_fgc, last_fgc_no_food_limit, last_fpg, ppg)` | ครั้งการคัดกรอง = แหล่งของแฟ้ม NCDSCREEN; `screen_date` เป็น DATE (ไม่มี index แต่ตารางมีราว 160k แถว scan ได้เร็ว) |

ตารางที่ตรวจแล้ว**ไม่ใช้**:

- `person_dm_fgc_screen`, `person_ht_risk_bp_screen`, `person_dmht_nhso_screen` เป็นตารางลูกของ `person_dmht_risk_screen_head` (ค่าวัดซ้ำ/แบบสอบถาม) ไม่ได้เพิ่มคนที่คัดกรอง
- `person_ncd_screen`, `person_ncd_summary` ว่าง (0 แถว)
- `opdscreen` (bps/bpd/fbs ตอนมา OPD) ไม่ใช่ NCDSCREEN

### 7.1.1 ทำไม A ของปีงบฯ 2570 เป็น 0

รพ. นี้คัดกรอง DM/HT แบบรณรงค์ (ข้อมูลส่วนใหญ่อยู่ช่วง มี.ค.–พ.ค.) วันที่คัดกรองล่าสุดใน `person_dmht_risk_screen_head` คือเดือน พ.ค. 2569 (ค.ศ. 2026) ยังไม่มีการคัดกรองเลยตั้งแต่ 1 ต.ค. 2569 (เริ่มปีงบฯ 2570) A = 0 จึงเป็นค่าที่ถูกต้องตามข้อมูล ไม่ใช่ bug ของ SQL จะเริ่มมีตัวเลขเมื่อหน่วยบริการบันทึกการคัดกรองในเมนูคัดกรอง DM/HT

### 7.1.2 ตัวเลขตรวจสอบ (db-cli, ข้อมูล ณ 2026-11-06)

| ปีงบฯ | ตัวชี้วัด | B | A | ร้อยละ |
| --- | --- | --- | --- | --- |
| 2569 | DM | 5,787 | 5,678 | 98.12 |
| 2569 | HT | 4,251 | 4,217 | 99.20 |
| 2570 (ถึง 6 พ.ย. 2569) | DM | 5,833 | 0 | 0.00 |
| 2570 (ถึง 6 พ.ย. 2569) | HT | 4,227 | 0 | 0.00 |

ก่อนแก้ (production เดิม) ปีงบฯ 2570 ได้ B DM 6,272 / HT 4,540 ส่วนต่างมาจากการคัดออกหมู่ 0 และสมาชิกคลินิก

ประสิทธิภาพ (EXPLAIN): person ใช้ `ix_village_id`, NOT EXISTS ของ `ovstdiag`/`clinicmember` ถูก materialize ครั้งเดียว (range บน `icd10`), screen head เป็น full scan ราว 160k แถว แต่ละ query ใช้ราว 1.3–1.7 วินาที

ทางเลือกที่ยังไม่ได้ทำ:

- รวมการวินิจฉัย IPD (`iptdiag`) ในเงื่อนไขคัดออก
- การคัดกรองที่หน่วยบริการอื่น (HDC เห็น แต่ HIS นี้ไม่เห็น)

### 7.2 SQL (สำเนาจากโค้ด, MySQL/MariaDB)

พารามิเตอร์ (named placeholder ใช้ prepared statement ของ mysql2 ไม่ได้ต่อ string)

- `:periodStart` = 1 ต.ค. ของปีงบฯ เช่น `2026-10-01`
- `:dataAsOf` = วันตัดข้อมูล (inclusive)
- `:countFrom` = จุดเริ่มนับ A ซึ่ง DM/HT เท่ากับ `:periodStart` เสมอ (CX ใช้วันเริ่ม Phase)
- `:birthOnOrBefore` = `:periodStart` ลบ 35 ปี เช่น `1991-10-01` (เดิมชื่อ `:ageCutoffBirth`)
- `:icdFrom` / `:icdToExclusive`: DM ใช้ `'E10'` / `'E15'` ส่วน HT ใช้ `'I10'` / `'I16'`
- `:clinicCode`: DM `'001'`, HT `'002'`

ใช้ช่วง string แทน `LEFT(icd10,3)` เพื่อให้ใช้ index ได้

```sql
-- Verified with db-cli, see 7.1
-- Shared target filter (B) on person p:
--   p.house_regist_type_id IN (1, 3)
--   AND p.person_discharge_id = 9
--   AND COALESCE(p.death,'N') <> 'Y'
--   AND p.birthdate IS NOT NULL
--   AND p.village_id IN (SELECT cv.village_id FROM village cv
--                        WHERE TRIM(LEADING '0' FROM TRIM(cv.village_moo)) <> '')
--   AND p.birthdate <= :birthOnOrBefore
--   AND NOT EXISTS (SELECT 1 FROM ovstdiag d
--                   WHERE d.hn = p.patient_hn
--                     AND d.icd10 >= :icdFrom AND d.icd10 < :icdToExclusive
--                     AND d.vstdate < :periodStart)
--   AND NOT EXISTS (SELECT 1 FROM clinicmember cm
--                   WHERE cm.hn = p.patient_hn AND cm.clinic = :clinicCode
--                     AND (cm.regdate IS NULL OR cm.regdate < :periodStart))

-- screened subquery sc (first valid screening per person in the window)
SELECT s.person_id, MIN(h.screen_date) AS first_screen_date
FROM person_dmht_risk_screen_head h
JOIN person_dmht_screen_summary s
  ON s.person_dmht_screen_summary_id = h.person_dmht_screen_summary_id
WHERE h.screen_date >= :countFrom
  AND h.screen_date <  DATE_ADD(:dataAsOf, INTERVAL 1 DAY)
  AND (h.last_fgc > 0 OR h.last_fgc_no_food_limit > 0
       OR h.last_fpg > 0 OR h.ppg > 0)          -- DM
  -- AND h.last_bps > 0 AND h.last_bpd > 0      -- HT
GROUP BY s.person_id;

-- B (one row; generic column name "eligible", B = eligible for DM/HT)
SELECT COUNT(DISTINCT p.person_id) AS eligible
FROM person p
WHERE <target filter>;

-- A by month of first screening ('prior' bucket never occurs for DM/HT
-- because :countFrom = :periodStart)
SELECT CASE WHEN sc.first_screen_date < :periodStart THEN 'prior'
            ELSE DATE_FORMAT(sc.first_screen_date, '%Y-%m') END AS bucket,
       COUNT(DISTINCT p.person_id) AS screened
FROM person p
JOIN (<screened subquery>) sc ON sc.person_id = p.person_id
WHERE <target filter>
GROUP BY 1;
```

- ทั้งสอง query คืนเฉพาะ COUNT ไม่ส่ง CID, HN หรือชื่อออกจากฐานข้อมูล
- เดือนที่ไม่มีข้อมูลจะเติมเป็น `screened = 0` ในโค้ด
- ต่อ 1 คำขอ (ถ้า cache miss) รัน 8 query พร้อมกัน คือ B และ A ของ DM, HT, CX และ BR (pool มี 5 connection ส่วนที่เหลือรอคิว)
- แต่ละตัวชี้วัดโหลดแยกกัน ถ้าตัวใดพังจะคืน `error` เฉพาะตัวนั้น (ดูข้อ 8)

## 8. การทำงานของระบบ

- **การเชื่อมต่อ** (`src/lib/db/his.ts`):
  - ใช้ mysql2 pool เป็น singleton ผ่าน `globalThis` และสร้างแบบ lazy เมื่อ query ครั้งแรก
  - `connectionLimit: 5`, charset `utf8mb4_unicode_ci`, timezone `+07:00`, `dateStrings: true`
  - ทุก connection ใหม่จะรัน `SET SESSION TRANSACTION READ ONLY` ถ้ารันไม่สำเร็จจะทำลาย connection นั้นทิ้ง
  - ควรให้ DB user มีสิทธิ์แค่ SELECT ด้วย เพราะ read-only session เป็นแค่ด่านที่สอง
- **env:**
  - `HIS_HOST`, `HIS_PORT`, `HIS_USER`, `HIS_PASSWORD`, `HIS_DATABASE` (ถ้าขาดตัวใด error จะบอกเฉพาะชื่อ ไม่บอกค่า)
  - `KPI_DATA_SOURCE` = `his` (ค่าเริ่มต้น) หรือ `mock`
- **ไม่มี fallback ไป mock:**
  - ถ้า**ทุก**ตัวชี้วัด error จะ throw `HisConfigError` หรือ `HisQueryError` (error มีแค่ code เช่น `ECONNREFUSED` ไม่มี host หรือ user) เพื่อให้ UI แสดง error state
  - ถ้าพัง**บางตัว** ตัวนั้นจะได้ `error: "ไม่สามารถดึงข้อมูลตัวชี้วัดนี้ได้"` และตัวเลขเป็น 0 ส่วนตัวอื่นแสดงตามปกติ ผลนี้ cache แค่ `cacheLife("minutes")` (ปกติใช้ `"hours"`) และ log แค่รหัสตัวชี้วัด ชื่อ class และ driver code
- **cache:** `getScreeningKpi` เรียก `await io()` นอก cache ก่อน แล้วจึงเรียกฟังก์ชันภายในที่เป็น `"use cache"` + `cacheLife("hours")` + `cacheTag("kpi:screening")`
  - ผลคือ `next build` ไม่ query ฐานข้อมูล (build ผ่านแม้เครื่อง build ต่อฐานไม่ได้)
  - ฝั่งผู้เรียก**ต้องครอบด้วย `<Suspense>`**

## 9. ผลแยกรายหมู่บ้านและรายชื่อ (drill-down)

> โค้ด: `src/lib/kpi/screening-detail.ts`, SQL: `buildScreeningSql()` ใน `src/lib/kpi/sql/screening-common.ts`,
> Excel: `src/lib/kpi/screening-excel.ts`, validation/error: `src/lib/kpi/screening-api.ts`,
> routes: `src/app/api/kpi/screening/{villages,persons,export}/route.ts`

### 9.1 นิยาม

- ใช้ตัวกรอง B (`TARGET_WHERE`) และเงื่อนไข A (ช่วงวันที่ + ผลตรวจที่ใช้ได้) **ชุดเดียวกับข้อ 3–4** ดังนั้นผลรวม B และ A ของทุกหมู่ = ตัวเลขหน้าแรก เมื่อคำนวณจากข้อมูลชุดเดียวกัน
- หมู่บ้านคือ `person.village_id` join `village` ตัวกรอง B บังคับให้มีหมู่บ้านในเขตแล้ว (ไม่นับหมู่ 0 "นอกเขตรับผิดชอบ" และคนที่ไม่ระบุหมู่บ้าน) แถว `villageId = 0` ("ไม่ระบุหมู่บ้าน") ยังคงไว้ใน SQL เป็น safety net แต่ในฐานปัจจุบันจะไม่เกิด ถ้าเกิดจะอยู่ท้ายสุด **ดูรายชื่อผ่าน API ไม่ได้** (village ต้อง > 0) แต่จะอยู่ในไฟล์ Excel ที่ export ทั้งปีงบฯ
- เรียงหมู่ตามเลขหมู่ (ตัวเลข) แล้วตาม `villageId`
- รายชื่อ = ทุกคนใน B ของหมู่นั้น พร้อมสถานะว่าอยู่ใน A หรือไม่
  - `age` = อายุเต็มปี ณ 1 ต.ค. ของปีงบฯ (วันอ้างอิงเดียวกับเกณฑ์อายุ 35 ปี) ไม่ใช่อายุปัจจุบัน
  - `screenDate` = วันที่คัดกรองครั้งแรกที่ใช้ได้ในช่วงเวลา
  - เรียง: ยังไม่คัดกรองก่อน แล้วตามชื่อ+สกุล (ไม่รวมคำนำหน้า) ด้วยลำดับภาษาไทย (`Intl.Collator("th")`)
  - จำกัด 5,000 คนต่อหมู่ (ถ้าเกินจะตัด และ API ส่ง header `X-Result-Truncated: true`) ส่วน Excel ทั้งปีงบฯ จำกัด 50,000 คน (ถ้าเกินมีหมายเหตุในชีตสรุป)

### 9.2 ข้อมูลรายบุคคล (ข้อยกเว้นที่ผู้ใช้อนุมัติ)

ผู้ใช้ต้องการดูรายชื่อโดยตรง จึงอนุญาตให้ส่งข้อมูลรายบุคคลออกไป**เฉพาะ** API รายชื่อและไฟล์ Excel โดยให้น้อยที่สุด

- ส่ง: `personId`, `hn`, ชื่อ-สกุล (มีคำนำหน้า), เพศ, อายุ, สถานะ, วันที่คัดกรอง
- ไม่ดึงออกจากฐานเลย: เลขบัตรประชาชน, เบอร์โทร, ที่อยู่ละเอียด, วันเกิด, ผลแล็บ/ค่าน้ำตาล/ค่าความดัน
- ไม่ cache: ฟังก์ชันรายชื่อ/export ไม่มี `"use cache"` และเรียก `connection()` ส่วน response ใส่ `Cache-Control: private, no-store`
- log ตอน error มีแค่ชื่อ class และ error code ของ driver ไม่มี SQL, parameter หรือข้อมูลผู้ป่วย
- ยังไม่มีระบบ login จึง**ใครที่เข้าถึง URL ได้ก็ดูรายชื่อได้** ต้องจำกัดการเข้าถึงในระดับเครือข่ายหรือเพิ่ม authentication ก่อนเปิดใช้นอกเครือข่ายโรงพยาบาล

### 9.3 API

ทุก route รันบน Node.js runtime (ค่าเริ่มต้น เพราะเมื่อเปิด Cache Components จะประกาศ `export const runtime` ไม่ได้)
param ผิดคืน `400 { error: string }` ส่วน error ฐานข้อมูลหรือ config คืน `500 { error: "ไม่สามารถดึงข้อมูลได้" }`

| Route | Param | ผลลัพธ์ | Cache |
| --- | --- | --- | --- |
| `GET /api/kpi/screening/villages` | `code` (DM\|HT\|CX\|BR), `fy` (พ.ศ. 2560–ปีงบฯ ปัจจุบัน) | `VillageBreakdown[]` | `"use cache"` + `cacheLife("hours")` + tag `kpi:screening` (ใช้ร่วมกันทุกคน) |
| `GET /api/kpi/screening/persons` | `code`, `fy`, `village` (จำนวนเต็มบวก, บังคับ) | `ScreeningPerson[]` | ไม่ cache, `private, no-store` |
| `GET /api/kpi/screening/export` | `code`, `fy`, `village` (ไม่บังคับ) | `.xlsx` (attachment) | ไม่ cache, `private, no-store` |

- ชื่อไฟล์ Excel: `kpi-{code}-{fy}.xlsx` หรือ `kpi-{code}-{fy}-moo{เลขหมู่จริง}.xlsx` (ถ้าเลขหมู่ไม่ใช่ตัวเลขจะใช้ `-village{villageId}`)
- ชีต "สรุปรายหมู่": หมู่, ชื่อหมู่บ้าน, B, A, ร้อยละ, แถวรวม และหมายเหตุใต้ตาราง (ชื่อตัวชี้วัด, ปีงบฯ, วันที่ข้อมูล)
- ชีต "รายชื่อ": หมู่, HN (เก็บเป็นข้อความ), ชื่อ-สกุล, เพศ, อายุ, สถานะ, วันที่คัดกรอง (วว/ดด/ปปปป พ.ศ.)
- ทุกค่าเขียนเป็น value ไม่ใช่ formula ข้อความจากฐานข้อมูลจึงกลายเป็นสูตร Excel ไม่ได้
- Excel คำนวณใหม่ทุกครั้ง ไม่ใช้ cache เพื่อให้ชีตสรุปและชีตรายชื่อมาจากข้อมูลชุดเดียวกัน

### 9.4 ความสอดคล้องของตัวเลข

- หน้าแรกและ `/villages` cache แยก entry กัน (อย่างละไม่เกินประมาณ 1 ชั่วโมง) ในปีงบฯ ปัจจุบันที่ข้อมูลยังเพิ่มขึ้นระหว่างวัน ผลรวมรายหมู่จึง**อาจต่างจากหน้าแรกได้ชั่วคราว** จนกว่า cache จะหมดอายุ ถ้าต้องตรงกันทันทีให้เรียก `revalidateTag("kpi:screening")`
- `/persons` และ Excel ไม่ cache จึงอาจใหม่กว่าตัวเลขรายหมู่ใน modal ได้เล็กน้อย
- mock (`KPI_DATA_SOURCE=mock`): มี 12 หมู่บ้านปลอม ("บ้านจำลอง...", `villageId` 101–112) ชื่อคนเป็น "ทดสอบ0001 ข้อมูลจำลอง1" และ HN ขึ้นต้นด้วย `MOCK` ผลรวม B/A รายหมู่ = ตัวเลข mock หน้าแรกเป๊ะ และจำนวนคนในรายชื่อ = B/A ของหมู่นั้น (deterministic) แต่วันที่คัดกรองของ mock สุ่มในช่วงเวลา ไม่ได้กระจายตามรายเดือนของกราฟ

### 9.5 SQL ที่เพิ่ม (verify แล้ว, ดูตาราง 7.1)

- `SCREENING_SQL[code].village` (สร้างโดย `buildScreeningSql()`): `person p LEFT JOIN village v LEFT JOIN (คนที่คัดกรองแล้วในช่วงเวลา) sc WHERE <target filter> GROUP BY หมู่บ้าน` แล้วนับ `COUNT(DISTINCT p.person_id)` เป็น `eligible` (= B สำหรับ DM/HT) และ `COUNT(DISTINCT sc.person_id)` เป็น A
- `SCREENING_SQL[code].personsByVillage` / `.personsAll`: join ชุดเดียวกัน แล้วเลือกเฉพาะคอลัมน์ในข้อ 9.2 พร้อม `LIMIT` ที่เป็นค่าคงที่ (5001 / 50001)
- parameter เพิ่ม: `:villageId` (เฉพาะรายชื่อรายหมู่)
- index ที่มีจริง: `person(village_id)` (`ix_village_id`), `person_dmht_screen_summary(person_id)`, `person_dmht_risk_screen_head(person_dmht_screen_summary_id)`
- derived table `sc` คัดกรองทุกคนที่คัดกรองในช่วงเวลา (ยังไม่กรองกลุ่มเป้าหมาย) ตรวจ `EXPLAIN` แล้ว ใช้ราว 1.3–1.7 วินาทีต่อ query (ดู 7.1.2)
