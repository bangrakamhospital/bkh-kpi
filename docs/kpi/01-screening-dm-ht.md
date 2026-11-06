# KPI 1: การคัดกรองเบาหวาน (DM) และความดันโลหิตสูง (HT) ในประชาชนอายุ 35 ปีขึ้นไป

> สถานะ: **นิยามพร้อมใช้ / SQL ของ HOSxP เขียนแล้วแต่ยังไม่ได้ verify กับฐานจริง**
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
2. อาศัยอยู่ในเขตรับผิดชอบ (TYPEAREA 1, 3)
3. ยังมีชีวิตอยู่และยังไม่ถูกจำหน่าย (DISCHARGE = 9)
4. นับเป็น**คน** (distinct `person_id`)
5. **คัดออก**ผู้ที่ได้รับการวินิจฉัยโรคนั้น**ก่อน 1 ต.ค. ของปีงบฯ**
   - DM: ICD-10 `E10`–`E14` (รวมรหัสย่อย)
   - HT: ICD-10 `I10`–`I15` (รวมรหัสย่อย)

ตัวหารของ DM และ HT **แยกกัน**

## 4. ตัวตั้ง (A): ได้รับการคัดกรอง

คนใน B ที่มีบันทึกการคัดกรองซึ่งวันที่คัดกรองอยู่ระหว่าง 1 ต.ค. ถึง `dataAsOf` และมีผลตรวจที่ใช้ได้

- DM: มีค่าน้ำตาลในเลือดมากกว่า 0
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
| เกณฑ์คัดออก | วินิจฉัยใน `ovstdiag` ก่อน 1 ต.ค. | `ovstdiag` เป็นตารางมาตรฐานที่ทุก รพ. ที่ใช้ HOSxP มี ส่วน `clinicmember` ใช้รหัสคลินิกต่างกันไปในแต่ละแห่ง |
| สถานะประชากร | สถานะใน `person` ณ วันที่ประมวลผล | HOSxP ไม่เก็บประวัติ TYPEAREA ย้อนหลัง |
| แหล่งผลคัดกรอง | `person_dmht_risk_screen_head` (งานคัดกรอง DM/HT ของ HOSxP ที่ส่งออกเป็นแฟ้ม NCDSCREEN) | ใกล้เคียงนิยาม HDC มากที่สุด ยังไม่นับการวัดใน `opdscreen` ตอนมารับบริการ OPD |
| การคัดกรองนอกหน่วยบริการ | ไม่นับ | HIS มีเฉพาะข้อมูลของหน่วยบริการเอง ค่าที่ได้จึงอาจต่ำกว่า HDC |
| ปีงบฯ ที่รองรับ | 2560 ถึงปีงบฯ ปัจจุบัน | ถ้าอยู่นอกช่วงจะ throw `RangeError` |

## 7. SQL สำหรับ HOSxP (ยังไม่ได้ verify)

> **คำเตือน: ชื่อตาราง/คอลัมน์ทั้งหมดในส่วนนี้เป็นสมมติฐาน และยังไม่ได้ตรวจกับฐานข้อมูลจริง**
> ตอนนี้ยังไม่มี skill `db-cli` และยังไม่รู้ว่าเป็น HOSxP รุ่นโรงพยาบาล (HOSxP XE) หรือ HOSxP PCU ต้องตรวจทุกข้อในตารางด้านล่างผ่าน `db-cli` ก่อนนำตัวเลขไปใช้จริง
> โค้ดที่ใช้งานจริงอยู่ใน `src/lib/kpi/sql/screening-hosxp.ts` (ตัวกรองและ subquery ของ DM/HT) กับ `src/lib/kpi/sql/screening-common.ts` (ตัวกรองประชากร/อายุ/คัดออก และตัวสร้าง query ทั้ง 5 แบบ) ถ้าแก้ตรงนั้นให้อัปเดตเอกสารนี้ตามด้วย

### 7.1 ตาราง/คอลัมน์ที่สมมติ และสิ่งที่ต้อง verify

| ตาราง.คอลัมน์ | ความหมายที่สมมติ | ต้อง verify |
| --- | --- | --- |
| `person.person_id` | PK ของประชากร | มีอยู่จริงหรือไม่ และไม่ซ้ำ |
| `person.birthdate` | วันเกิด (DATE) | ชนิดข้อมูล และสัดส่วนค่า NULL หรือ 0000-00-00 |
| `person.house_regist_type_id` | TYPEAREA (1–5) | ค่า 1 และ 3 ตรงกับ TYPEAREA 1 และ 3 หรือไม่ (ดูตาราง `house_regist_type`) |
| `person.person_discharge_id` | สถานะจำหน่าย (9 = ยังไม่จำหน่าย) | ค่ารหัส (ดูตาราง `person_discharge`) |
| `person.death` | `'Y'` = เสียชีวิต | มีคอลัมน์นี้หรือไม่ และอาจต้องใช้ `person_discharge_id = 1` แทน |
| `person.patient_hn` | HN ที่ใช้เชื่อมกับ `ovstdiag.hn` | สัดส่วนที่เป็น NULL และ format ของ HN ตรงกันหรือไม่ |
| `ovstdiag.hn`, `.icd10`, `.vstdate` | การวินิจฉัย OPD | `icd10` เก็บแบบไม่มีจุด (เช่น `E119`) หรือไม่ และมี index ที่ `hn` หรือไม่ |
| `person_dmht_screen_summary.person_dmht_screen_summary_id`, `.person_id` | หัวการคัดกรองรายปีของแต่ละคน | ชื่อคอลัมน์ และมี `bdg_year` หรือไม่ (ยังไม่ได้ใช้) |
| `person_dmht_risk_screen_head.person_dmht_screen_summary_id`, `.screen_date` | ครั้งการคัดกรอง | ชื่อคอลัมน์และชนิดของ `screen_date` |
| `person_dmht_risk_screen_head.last_fgc` | ค่าน้ำตาล (DM) | **ไม่มั่นใจที่สุด** อาจใช้ชื่ออื่น หรือเก็บอยู่ในตารางลูก |
| `person_dmht_risk_screen_head.last_bps`, `.last_bpd` | ความดัน (HT) | **ไม่มั่นใจที่สุด** เช่นกัน |
| `person.village_id` | หมู่บ้านที่อาศัย (FK ไป `village`) | มีคอลัมน์นี้หรือไม่ (HOSxP PCU อาจผูกหมู่บ้านผ่าน `house.village_id` แทน) และสัดส่วนค่า NULL/0 |
| `village.village_id`, `.village_moo`, `.village_name` | ตารางหมู่บ้าน | ชื่อคอลัมน์ ชนิดของ `village_moo` (int หรือ varchar) และมีแถว "นอกเขต" (moo 0) หรือไม่ |
| `person.pname`, `.fname`, `.lname` | คำนำหน้า (ข้อความ เช่น `นาย`) / ชื่อ / สกุล | `pname` เป็นข้อความหรือรหัส ถ้าเป็นรหัสต้อง join ตาราง `pname` |
| `person.sex` | `'1'` = ชาย, `'2'` = หญิง | ค่าที่ใช้จริง |

ทางเลือกที่ควรพิจารณาหลัง verify:

- ใช้ `clinicmember` (hn, clinic, regdate) หรือ `person_chronic` เป็นเงื่อนไขคัดออกเพิ่ม ต้องรู้รหัสคลินิก DM/HT ของ รพ. ก่อน
- รวม `ovstdiag` กับการวินิจฉัย IPD (`iptdiag`) ในเงื่อนไขคัดออก
- นับการวัดน้ำตาลหรือความดันใน `opdscreen` (`bps`, `bpd`, `fbs`) เป็นการคัดกรองด้วย ถ้า รพ. ไม่ได้บันทึกผ่านเมนูคัดกรอง DM/HT
- ตรวจ index: `person(house_regist_type_id, birthdate)`, `ovstdiag(hn, icd10)`, `person_dmht_risk_screen_head(screen_date)`

### 7.2 SQL (สำเนาจากโค้ด, MySQL/MariaDB)

พารามิเตอร์ (named placeholder ใช้ prepared statement ของ mysql2 ไม่ได้ต่อ string)

- `:periodStart` = 1 ต.ค. ของปีงบฯ เช่น `2026-10-01`
- `:dataAsOf` = วันตัดข้อมูล (inclusive)
- `:countFrom` = จุดเริ่มนับ A ซึ่ง DM/HT เท่ากับ `:periodStart` เสมอ (CX ใช้วันเริ่ม Phase)
- `:birthOnOrBefore` = `:periodStart` ลบ 35 ปี เช่น `1991-10-01` (เดิมชื่อ `:ageCutoffBirth`)
- `:icdFrom` / `:icdToExclusive`: DM ใช้ `'E10'` / `'E15'` ส่วน HT ใช้ `'I10'` / `'I16'`

ใช้ช่วง string แทน `LEFT(icd10,3)` เพื่อให้ใช้ index ได้

```sql
-- UNVERIFIED — HOSxP schema assumptions, see 7.1
-- Shared target filter (B) on person p:
--   p.house_regist_type_id IN ('1','3')
--   AND p.person_discharge_id = '9'
--   AND COALESCE(p.death,'N') <> 'Y'
--   AND p.birthdate IS NOT NULL
--   AND p.birthdate <= :birthOnOrBefore
--   AND NOT EXISTS (SELECT 1 FROM ovstdiag d
--                   WHERE d.hn = p.patient_hn
--                     AND d.icd10 >= :icdFrom AND d.icd10 < :icdToExclusive
--                     AND d.vstdate < :periodStart)

-- screened subquery sc (first valid screening per person in the window)
SELECT s.person_id, MIN(h.screen_date) AS first_screen_date
FROM person_dmht_screen_summary s
JOIN person_dmht_risk_screen_head h
  ON h.person_dmht_screen_summary_id = s.person_dmht_screen_summary_id
WHERE h.screen_date >= :countFrom
  AND h.screen_date <  DATE_ADD(:dataAsOf, INTERVAL 1 DAY)
  AND h.last_fgc > 0                          -- DM
  -- AND h.last_bps > 0 AND h.last_bpd > 0    -- HT
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
- หมู่บ้านคือ `person.village_id` join `village` คนที่ไม่มี `village_id` หรือ `village_id` ไม่อยู่ในตาราง `village` จะรวมอยู่ในแถว `villageId = 0` ("ไม่ระบุหมู่บ้าน") ซึ่งอยู่ท้ายสุด แถวนี้มีไว้เพื่อให้ผลรวมตรงกัน และ**ดูรายชื่อผ่าน API ไม่ได้** (village ต้อง > 0) แต่จะอยู่ในไฟล์ Excel ที่ export ทั้งปีงบฯ
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

### 9.5 SQL ที่เพิ่ม (ยังไม่ได้ verify, ดูตาราง 7.1)

- `SCREENING_SQL[code].village` (สร้างโดย `buildScreeningSql()`): `person p LEFT JOIN village v LEFT JOIN (คนที่คัดกรองแล้วในช่วงเวลา) sc WHERE <target filter> GROUP BY หมู่บ้าน` แล้วนับ `COUNT(DISTINCT p.person_id)` เป็น `eligible` (= B สำหรับ DM/HT) และ `COUNT(DISTINCT sc.person_id)` เป็น A
- `SCREENING_SQL[code].personsByVillage` / `.personsAll`: join ชุดเดียวกัน แล้วเลือกเฉพาะคอลัมน์ในข้อ 9.2 พร้อม `LIMIT` ที่เป็นค่าคงที่ (5001 / 50001)
- parameter เพิ่ม: `:villageId` (เฉพาะรายชื่อรายหมู่)
- index ที่ควรมี: `person(village_id)`, `person_dmht_screen_summary(person_id)`
- derived table `sc` คัดกรองทุกคนที่คัดกรองในช่วงเวลา (ยังไม่กรองกลุ่มเป้าหมาย) ถ้าช้าให้ดู `EXPLAIN` ผ่าน `db-cli` แล้วพิจารณาเปลี่ยนเป็น `EXISTS`/subquery ต่อคน
