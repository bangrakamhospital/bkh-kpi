# KPI 3: การคัดกรองมะเร็งปากมดลูก (CX) ในหญิงไทยอายุ 30–60 ปี (สะสม 5 ปี)

> สถานะ: **นิยามพร้อมใช้ (เกณฑ์ปี 2570 ยังรอยืนยัน) / SQL ของ HOSxP เขียนแล้วแต่ยังไม่ได้ verify กับฐานจริง**
> โค้ด: นิยาม `src/lib/kpi/screening-indicators.ts` (`SCREENING_INDICATORS.CX`), คำนวณ `src/lib/kpi/screening.ts` / `screening-detail.ts`,
> SQL `src/lib/kpi/sql/screening-cancer-hosxp.ts` (`CX_SQL`) + ตัวสร้าง SQL กลาง `src/lib/kpi/sql/screening-common.ts`,
> mock `src/lib/kpi/sources/screening-mock.ts`
> API: `/api/kpi/screening/{villages,persons,export}?code=CX&fy=...` (pipeline เดียวกับ DM/HT ดู 01 ข้อ 9)

## 1. แหล่งอ้างอิง

1. นิยามตัวชี้วัด Service Plan สาขาโรคมะเร็ง ปีงบประมาณ 2568 (Final version) สถาบันมะเร็งแห่งชาติ ตัวชี้วัด 3.1 "ร้อยละของผู้ที่ได้รับการคัดกรองมะเร็งปากมดลูก (สะสม)"
   https://www.nci.go.th/uploads/service_plan/1771205870_%E0%B8%99%E0%B8%B4%E0%B8%A2%E0%B8%B2%E0%B8%A1%E0%B8%95%E0%B8%B1%E0%B8%A7%E0%B8%8A%E0%B8%B5%E0%B9%89%E0%B8%A7%E0%B8%B1%E0%B8%94%20%E0%B8%9B%E0%B8%B5%202568%20(Final%20version).pdf
2. แผนการตรวจราชการกระทรวงสาธารณสุข ปีงบประมาณ 2567 หน้า 62–64
   https://inspection.moph.go.th/e-inspection/file_docth/2024-05-23-02-13-31.pdf

ยังไม่พบเอกสารฉบับปีงบฯ 2569/2570 (ข้อมูลนี้ผู้ประสานงานค้นมา ผู้เขียนโค้ดไม่ได้เปิดเอกสารเอง)

## 2. ตัวชี้วัด

| รหัส | ชื่อ | เกณฑ์ (ค่าตั้งต้น) |
| --- | --- | --- |
| CX | ร้อยละของผู้ที่ได้รับการคัดกรองมะเร็งปากมดลูก (สะสม) | ≥ 25% (Service Plan 2568) |

- Service Plan 2568 กำหนด ≥ 25% (สะสม) ส่วนแผนตรวจราชการ 2567 ใช้ ≥ 60%
- **TODO: ยืนยันเกณฑ์ปีงบฯ 2570** แก้ได้ที่ `SCREENING_INDICATORS.CX.targetPercent`
- ถ้าปีงบฯ ที่เลือกไม่ใช่ 2568 ระบบจะใส่ `note` ว่า "เกณฑ์ปี {fy} รอยืนยัน (ใช้เกณฑ์ Service Plan สาขาโรคมะเร็ง 2568)" (ปรับได้ที่ `targetSourceFiscalYear`)

## 3. ช่วงเวลา: Phase 5 ปี

- Phase คือช่วง 5 ปีงบฯ ได้แก่ 2563–2567, **2568–2572** (Phase ปัจจุบัน), 2573–2577 ไปเรื่อยๆ ปีก่อน 2563 คำนวณย้อนตามสูตรเดียวกัน (2558–2562)
  - ค่าคงที่: `CERVICAL_PHASE_ANCHOR_FISCAL_YEAR = 2563`, `CERVICAL_PHASE_LENGTH_YEARS = 5`
- A นับ**สะสม** ตั้งแต่ 1 ต.ค. ของปีแรกใน Phase (`countFrom`) ถึงวันตัดข้อมูล (`dataAsOf`)
  - ปีงบฯ 2570 นับ 2024-10-01 ถึงวันตัดข้อมูล (สะสม 2568–2570) และ `periodLabel` = "สะสม ปีงบ 2568–2570"
  - ปีแรกของ Phase (เช่น 2568): `periodLabel` = "สะสม ปีงบ 2568"
- วันตัดข้อมูลใช้กติกาเดียวกับ DM/HT: ปีงบฯ ปัจจุบันใช้วันนี้ ส่วนปีที่ผ่านแล้วใช้ 30 ก.ย. ของปีนั้น
- `monthly[].screened` = จำนวนคนที่ได้รับการคัดกรอง**ครั้งแรกใน Phase** ในเดือนนั้น (แสดงเฉพาะเดือนของปีงบฯ ที่เลือก)
- `priorNumerator` = คนที่คัดกรองครั้งแรกใน Phase **ก่อน** ปีงบฯ ที่เลือก
- `cumulativePercent` ของแต่ละเดือน = (`priorNumerator` + ผลรวม `screened` ตั้งแต่ ต.ค. ถึงเดือนนั้น) / B × 100 ดังนั้นกราฟจะเริ่มจากยอดสะสมของปีก่อน ไม่ได้เริ่มจาก 0

## 4. กลุ่มเป้าหมาย (eligible) และตัวหาร B

**eligible** คือคนที่มีคุณสมบัติครบทุกข้อ

1. เพศหญิง (`person.sex = '2'`)
2. สัญชาติไทย (`person.nationality = '99'`)
3. อายุ 30–60 ปีเต็ม **ณ 1 ต.ค. ของปีงบฯ ที่เลือก** โดย `periodStart − 61 ปี < birthdate ≤ periodStart − 30 ปี`
4. อยู่ในเขตรับผิดชอบ (TYPEAREA 1, 3), ยังมีชีวิต และยังไม่จำหน่าย (ตัวกรองเดียวกับ DM/HT)
5. นับเป็นคน (distinct `person_id`)
6. **ไม่มีเงื่อนไขคัดออกด้วยโรค** เพราะสูตรทางการใช้ 70% ของประชากรทั้งหมดเป็นเป้าหมาย 5 ปี

**B (C1)** คือเป้าหมาย 5 ปี

```
B = ROUND(0.7 × eligible)        -- ปัดครึ่งขึ้น คำนวณด้วยจำนวนเต็มในโค้ด
```

- ค่า 0.7 คือ `CERVICAL_TARGET_POPULATION_SHARE` ใน `src/lib/kpi/screening-indicators.ts` แก้ได้ที่เดียว
- เอกสารทางการใช้ทะเบียนราษฎรปีที่ผ่านมา แต่ระดับ รพ. ใช้ประชากรในเขตรับผิดชอบของ HOSxP แทน (ดูข้อ 7)

## 5. ตัวตั้ง A (C2)

คนใน eligible ที่มีบริการคัดกรองมะเร็งปากมดลูก**อย่างน้อย 1 ครั้ง**ระหว่าง `countFrom` ถึง `dataAsOf`

- นับทุกวิธี ได้แก่ HPV DNA, Pap smear และ VIA และนับทุกผลตรวจ
- นับคนไม่ซ้ำ โดยคนหนึ่งนับได้ 1 ครั้งต่อ Phase และนับเข้าเดือนของการคัดกรองครั้งแรกใน Phase

## 6. สูตร

```
ร้อยละ = A / B × 100    (ทศนิยม 2 ตำแหน่ง, B = 0 → 0)
```

ร้อยละ**เกิน 100 ได้** เพราะ A นับจากหญิงทุกคนใน eligible ส่วน B เป็นแค่ 70% ของ eligible จึงไม่ cap ไว้ที่ 100

## 7. สมมติฐานที่เลือก

| ประเด็น | สิ่งที่เลือก | เหตุผล |
| --- | --- | --- |
| นับครั้ง/คน | นับ**คน** | ตามนิยาม (รายคนไม่ซ้ำ) |
| วันอ้างอิงอายุ | 1 ต.ค. ของปีงบฯ ที่เลือก ใช้กับทั้ง A และ B | ทำให้ A เป็นส่วนหนึ่งของ eligible เสมอ แต่หญิงที่คัดกรองในปีแรกของ Phase แล้วอายุเกิน 60 ในปีที่เลือก จะหลุดออกจากทั้ง A และ B ผลจึงอาจต่างจาก HDC ที่อาจใช้อายุ ณ วันคัดกรอง |
| ประชากรฐาน | `person` ในเขต (TYPEAREA 1,3) ณ วันประมวลผล | HOSxP ไม่มีทะเบียนราษฎรย้อนหลัง จึงใช้แทนประชากรจากทะเบียนราษฎร |
| คัดออกด้วยโรค | ไม่คัด | สูตรทางการไม่ได้คัดออก (70% ของประชากรเผื่อไว้แล้ว) |
| แหล่งบริการ | SPECIALPP ของ HOSxP (`pp_special`) | ตรงกับแฟ้ม SPECIALPP ใน 43 แฟ้มที่ HDC ใช้ |
| การคัดกรองนอกหน่วยบริการ | ไม่นับ | HIS มีเฉพาะข้อมูลของหน่วยบริการเอง ค่าที่ได้อาจต่ำกว่า HDC |
| B รายหมู่ | **แบ่ง B รวมไปยังแต่ละหมู่ตามสัดส่วน eligible ด้วยวิธีเศษเหลือมากสุด** (largest remainder) | ดูข้อ 8 |

## 8. ผลรายหมู่และรายชื่อ

- **ตารางรายหมู่** (`VillageBreakdown`): `eligible` = หญิง 30–60 ปีในหมู่, `denominator` = B ของหมู่, `numerator` = A ของหมู่ (สะสมใน Phase)
  - **วิธีที่เลือก:** B รวมยึดตามสูตรทางการ `ROUND(0.7 × eligible รวม)` แล้วแบ่งไปแต่ละหมู่แบบ largest remainder
  - ผลคือ **ผลรวม B รายหมู่ = B หน้าแรกพอดี** และ B ของแต่ละหมู่เป็น floor หรือ ceil ของ 0.7 × eligible ของหมู่ (ต่างจาก `ROUND(0.7 × หญิงในหมู่)` ได้ไม่เกิน 1 และไม่เกิน eligible ของหมู่)
  - ไม่ได้เลือกวิธี "ROUND รายหมู่แล้วยอมให้ผลรวมไม่ตรง" เพราะทำให้ตัวเลขใน modal กับ Excel ไม่ตรงกับหน้าแรก และไม่ได้เลือก "B รวม = ผลรวม B รายหมู่" เพราะจะทำให้ B หน้าแรกขึ้นกับจำนวนหมู่บ้านแทนสูตรทางการ
  - โค้ด: `apportionTargetShare()` ใน `screening-indicators.ts` ซึ่งเรียกจาก `computeVillages()` ใน `screening-detail.ts`
- **รายชื่อ** (`ScreeningPerson[]`): หญิง 30–60 ปีในเขต**ทุกคน** (eligible ไม่ได้คูณ 0.7) พร้อมสถานะ "คัดกรองแล้ว (ใน Phase นี้)" หรือ "ยังไม่คัดกรองใน Phase นี้"
  - `screenDate` = วันที่คัดกรองครั้งแรกใน Phase (อาจเป็นปีงบฯ ก่อนหน้า)
  - จำนวนคนในรายชื่อจึงเท่ากับ `eligible` ของหมู่ ไม่ใช่ `denominator`
- **Excel**: ชีตสรุปมีคอลัมน์ "หญิงไทย 30–60 ปี" (eligible) เพิ่มก่อนคอลัมน์ "B (เป้าหมาย 70%)" และมีหมายเหตุช่วงข้อมูล (วันที่เริ่ม Phase ถึงวันตัดข้อมูล), note และวิธีแบ่ง B
- ข้อมูลรายบุคคลใช้กติกาเดียวกับ DM/HT (01 ข้อ 9.2) คือไม่ cache, `private, no-store` และไม่ดึงเลขบัตร/ผลตรวจ

## 9. SQL สำหรับ HOSxP (ยังไม่ได้ verify)

> **คำเตือน: ตาราง/คอลัมน์/รหัสทั้งหมดในส่วนนี้เป็นสมมติฐาน ยังไม่ได้ตรวจกับฐานจริง** (ยังไม่มี skill `db-cli`)
> โค้ดจริงอยู่ที่ `src/lib/kpi/sql/screening-cancer-hosxp.ts` ถ้าแก้ที่นั่นให้แก้เอกสารนี้ตามด้วย

### 9.1 ตาราง/คอลัมน์/รหัสที่สมมติ

| รายการ | ความหมายที่สมมติ | ต้อง verify |
| --- | --- | --- |
| `person.sex = '2'` | หญิง | ค่าและชนิดข้อมูล |
| `person.nationality = '99'` | สัญชาติไทย | ชื่อคอลัมน์และรหัส (ดูตาราง `nationality`) รวมถึงสัดส่วนค่า NULL ถ้า NULL เยอะ eligible จะต่ำเกินจริง |
| `pp_special.vn`, `.pp_special_type_id` | บริการส่งเสริมป้องกันเฉพาะ (SPECIALPP) ต่อ visit | มีตารางนี้หรือไม่ (HOSxP XE หรือ PCU) |
| `pp_special_type.pp_special_type_id`, `.pp_special_code` | รหัส SPECIALPP มาตรฐาน | ชื่อคอลัมน์รหัส |
| `ovst.vn`, `.hn`, `.vstdate` | visit (ใช้เป็นวันที่บริการ) | ตรวจด้วยว่าใช้วันที่ใน `pp_special` แทนได้หรือไม่ |
| `person.patient_hn = ovst.hn` | การเชื่อมคนกับ visit | สัดส่วน HN ว่าง (คนในเขตที่ไม่มี HN จะไม่ถูกนับใน A) |
| รหัส CX `1B0040`–`1B0049` | การคัดกรองมะเร็งปากมดลูก ทุกวิธีและทุกผล (Pap/VIA/HPV) | **ไม่มั่นใจที่สุด** ต้องดูรายการรหัสจริง เช่น HPV DNA หรือ HPV self-sampling อาจใช้รหัสกลุ่มอื่น |

query สำหรับตรวจผ่าน `db-cli` (SELECT เท่านั้น ไม่มีข้อมูลผู้ป่วย):

```sql
SELECT pp_special_type_id, pp_special_code, pp_special_name
FROM pp_special_type
WHERE pp_special_code LIKE '1B00%'
ORDER BY pp_special_code;
```

ทางเลือกถ้า รพ. ไม่ได้บันทึกผ่าน SPECIALPP:

- `person_women_service` / `women_service` (งานอนามัยแม่และเด็ก/สตรีใน HOSxP PCU)
- ผล lab Pap/HPV (`lab_head` / `lab_order`) ซึ่งต้องรู้ lab code ของ รพ.
- ข้อมูลโครงการ HPV self-sampling ที่อาจอยู่นอก HOSxP

index ที่ควรมี: `pp_special(vn)`, `pp_special(pp_special_type_id)`, `ovst(vn)`, `ovst(vstdate)`, `person(patient_hn)`, `person(sex, house_regist_type_id, birthdate)`

### 9.2 SQL (MySQL/MariaDB)

พารามิเตอร์

- `:periodStart` = 1 ต.ค. ของปีงบฯ ที่เลือก (วันอ้างอิงอายุ)
- `:countFrom` = 1 ต.ค. ของปีแรกใน Phase
- `:dataAsOf` = วันตัดข้อมูล
- `:birthOnOrBefore` = periodStart − 30 ปี
- `:birthAfter` = periodStart − 61 ปี

```sql
-- UNVERIFIED
-- eligible filter on person p:
--       p.house_regist_type_id IN ('1','3')
--   AND p.person_discharge_id = '9'
--   AND COALESCE(p.death,'N') <> 'Y'
--   AND p.birthdate IS NOT NULL
--   AND p.sex = '2'
--   AND p.nationality = '99'
--   AND p.birthdate <= :birthOnOrBefore
--   AND p.birthdate >  :birthAfter

-- screened subquery sc (first screening in the phase per person):
SELECT sp.person_id, MIN(o.vstdate) AS first_screen_date
FROM pp_special ps
JOIN pp_special_type pt ON pt.pp_special_type_id = ps.pp_special_type_id
JOIN ovst o            ON o.vn = ps.vn
JOIN person sp         ON sp.patient_hn = o.hn
WHERE pt.pp_special_code IN ('1B0040','1B0041',...,'1B0049')
  AND o.vstdate >= :countFrom
  AND o.vstdate <  DATE_ADD(:dataAsOf, INTERVAL 1 DAY)
GROUP BY sp.person_id;

-- eligible (B = ROUND(0.7 × eligible) in code)
SELECT COUNT(DISTINCT p.person_id) AS eligible FROM person p WHERE <eligible filter>;

-- A: 'prior' = earlier fiscal years of the phase, else month of first screening
SELECT CASE WHEN sc.first_screen_date < :periodStart THEN 'prior'
            ELSE DATE_FORMAT(sc.first_screen_date, '%Y-%m') END AS bucket,
       COUNT(DISTINCT p.person_id) AS screened
FROM person p
JOIN (<screened subquery>) sc ON sc.person_id = p.person_id
WHERE <eligible filter>
GROUP BY 1;
```

query รายหมู่และรายชื่อสร้างจากตัวกรองและ subquery ชุดเดียวกันด้วย `buildScreeningSql()` (โครงเดียวกับ 01 ข้อ 9.5) แต่คืน `eligible` แทน `denominator`

## 10. Mock (`KPI_DATA_SOURCE=mock`)

- eligible ประมาณ 7,860 คน (±2% ต่อปี) และคัดกรองรายใหม่ประมาณ 13% ±2% ของ eligible ต่อปีงบฯ
- ยอดสะสมของปีก่อนใน Phase (`priorNumerator`) มาจาก mock ของปีก่อนหน้าแบบ deterministic เช่น prior ของปี 2570 = A ของปี 2569
- รายชื่อเป็นเพศหญิงทั้งหมด อายุ 30–60 ปี และวันที่คัดกรองสุ่มในช่วง countFrom ถึง dataAsOf (ไม่ได้กระจายตามกราฟรายเดือน)

## 11. สิ่งที่ต้องยืนยัน

1. เกณฑ์ปีงบฯ 2570 (25% ตาม Service Plan 2568 หรือ 60% ตามแผนตรวจราชการ หรือค่าอื่น)
2. Phase 2568–2572 ยังใช้ในปี 2570 หรือไม่ และตัวคูณ 70% ยังเหมือนเดิมหรือไม่
3. รหัส SPECIALPP ของ Pap/VIA/HPV ในฐานจริง และ รพ. บันทึกการคัดกรองที่ตารางใด
4. วิธีคิดอายุ (ณ 1 ต.ค. ของปีที่เลือก หรือ ณ วันคัดกรอง) ถ้าต้องการให้ตรง HDC
5. นับเฉพาะสัญชาติไทยตามนิยาม หรือรวมคนต่างด้าวในเขตด้วย
