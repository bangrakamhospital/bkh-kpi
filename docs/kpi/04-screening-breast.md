# KPI 4: การตรวจคัดกรองมะเร็งเต้านมโดยบุคลากรสาธารณสุข (CBE) ในหญิงอายุ 40–70 ปี (BR)

> สถานะ: **นิยามพร้อมใช้ (เกณฑ์ปี 2570 ยังรอยืนยัน) / SQL ของ HOSxP เขียนแล้วแต่ยังไม่ได้ verify กับฐานจริง**
> โค้ด: นิยาม `src/lib/kpi/screening-indicators.ts` (`SCREENING_INDICATORS.BR`), SQL `src/lib/kpi/sql/screening-cancer-hosxp.ts` (`BR_SQL`)
> API: `/api/kpi/screening/{villages,persons,export}?code=BR&fy=...` (pipeline เดียวกับ DM/HT)

## 1. แหล่งอ้างอิง

1. นิยามตัวชี้วัด Service Plan สาขาโรคมะเร็ง ปีงบประมาณ 2568 (Final version) สถาบันมะเร็งแห่งชาติ ตัวชี้วัด 2.2 (CBE)
   https://www.nci.go.th/uploads/service_plan/1771205870_%E0%B8%99%E0%B8%B4%E0%B8%A2%E0%B8%B2%E0%B8%A1%E0%B8%95%E0%B8%B1%E0%B8%A7%E0%B8%8A%E0%B8%B5%E0%B9%89%E0%B8%A7%E0%B8%B1%E0%B8%94%20%E0%B8%9B%E0%B8%B5%202568%20(Final%20version).pdf
2. แผนการตรวจราชการกระทรวงสาธารณสุข ปีงบประมาณ 2567 หน้า 62–64
   https://inspection.moph.go.th/e-inspection/file_docth/2024-05-23-02-13-31.pdf

ยังไม่พบเอกสารฉบับปีงบฯ 2569/2570

## 2. ตัวชี้วัด

| รหัส | ชื่อ | เกณฑ์ (ค่าตั้งต้น) |
| --- | --- | --- |
| BR | ร้อยละของสตรีอายุ 40–70 ปีที่ได้รับการตรวจเต้านมโดยบุคลากรสาธารณสุข (CBE) | ≥ 80% (Service Plan 2568 ตัวชี้วัด 2.2) |

- **TODO: ยืนยันเกณฑ์ปีงบฯ 2570** แก้ได้ที่ `SCREENING_INDICATORS.BR.targetPercent` และถ้าปีที่เลือกไม่ใช่ 2568 ระบบจะใส่ `note` ว่ารอยืนยัน
- **BSE** (ตรวจเต้านมด้วยตนเอง อายุ 30–70 ปี, ตัวชี้วัด 2.1) ยังไม่ได้ทำ แต่เพิ่มได้ภายหลังโดย
  1. เพิ่ม code (เช่น `"BS"`) ใน `ScreeningCode` และ `SCREENING_CODES`
  2. เพิ่ม meta ใน `SCREENING_INDICATORS`
  3. สร้าง spec ด้วย `buildScreeningSql()` โดยใช้รหัส BSE
  4. ลงทะเบียนใน `sql/screening-registry.ts`
  5. เพิ่ม `BASE` ใน mock
  6. เพิ่มแถวใน UI

  ต้องระวังไม่ให้รหัส BSE ปนอยู่ใน `BREAST_CBE_PP_CODES`

## 3. ช่วงเวลา

ปีงบประมาณ 1 ต.ค. ถึง 30 ก.ย. (ไม่สะสมข้ามปี) เหมือน DM/HT

- `countFrom` = `periodStart`, `priorNumerator` = 0
- `periodLabel` = "ปีงบประมาณ {fy}"

## 4. ตัวหาร B

คนที่มีคุณสมบัติครบทุกข้อ

1. เพศหญิง (`person.sex = '2'`)
2. อายุ 40–70 ปีเต็ม **ณ 1 ต.ค. ของปีงบฯ** โดย `periodStart − 71 ปี < birthdate ≤ periodStart − 40 ปี`
3. อยู่ในเขตรับผิดชอบ (TYPEAREA 1, 3), ยังมีชีวิต และยังไม่จำหน่าย
4. **คัดออก**ผู้ที่มีการวินิจฉัยมะเร็งเต้านม ICD-10 `C50` (รวมรหัสย่อย) ใน `ovstdiag` **ก่อน 1 ต.ค. ของปีงบฯ** (สมมติฐาน ดูข้อ 7)
5. นับเป็นคน (distinct `person_id`)

B = eligible (ตัวคูณ 1)

## 5. ตัวตั้ง A

คนใน B ที่ได้รับ CBE อย่างน้อย 1 ครั้งระหว่าง 1 ต.ค. ถึง `dataAsOf` (นับทุกผลตรวจ) คนละ 1 ครั้งต่อปีงบฯ และนับเข้าเดือนของการตรวจครั้งแรก

## 6. สูตร

```
ร้อยละ = A / B × 100   (ทศนิยม 2 ตำแหน่ง, B = 0 → 0)
```

## 7. สมมติฐานที่เลือก

| ประเด็น | สิ่งที่เลือก | เหตุผล |
| --- | --- | --- |
| นับครั้ง/คน | นับ**คน** 1 ครั้งต่อปีงบฯ | ตามนิยาม CBE ปีละ 1 ครั้ง |
| วันอ้างอิงอายุ | 1 ต.ค. ของปีงบฯ | ตรงกับ DM/HT ทำให้ B คงที่ตลอดปี |
| คัดออกผู้ป่วยมะเร็งเต้านม | **คัด** C50 ที่วินิจฉัยก่อน 1 ต.ค. | เอกสารไม่ได้ระบุชัด แต่ผู้ป่วยมะเร็งเต้านมอยู่ในระบบติดตามการรักษา ไม่ใช่กลุ่มคัดกรอง ถ้าไม่คัดจะทำให้ B มีคนที่ไม่ควรถูกคัดกรอง ยังไม่ได้ใช้ `Z85.3` (ประวัติมะเร็งเต้านม) และ `iptdiag` |
| สัญชาติ | **ไม่กรอง** (หญิงทุกสัญชาติในเขต) | ตามที่ได้รับมอบหมาย (นิยามระบุแค่ "หญิง") ถ้า HDC ใช้เฉพาะหญิงไทยให้เพิ่ม `PERSON_THAI_WHERE` ใน `BR_SQL` (แก้บรรทัดเดียว) |
| แหล่งบริการ | SPECIALPP ของ HOSxP (`pp_special`) | เหมือน CX |
| การตรวจนอกหน่วยบริการ | ไม่นับ | HIS มีเฉพาะข้อมูลของหน่วยบริการเอง |
| รายหมู่/รายชื่อ | B รายหมู่ = eligible ของหมู่ และรายชื่อ = ทุกคนใน B | เหมือน DM/HT |

## 8. SQL สำหรับ HOSxP (ยังไม่ได้ verify)

> **คำเตือน: ตาราง/คอลัมน์/รหัสเป็นสมมติฐาน** โค้ดจริงอยู่ที่ `src/lib/kpi/sql/screening-cancer-hosxp.ts`

### 8.1 สิ่งที่สมมติ

| รายการ | ความหมายที่สมมติ | ต้อง verify |
| --- | --- | --- |
| `pp_special`, `pp_special_type`, `ovst` | เหมือน CX (03 ข้อ 9.1) | เหมือน CX |
| รหัส CBE `1B0030`, `1B0031` | ตรวจเต้านมโดยบุคลากรสาธารณสุข ผลปกติ/ผิดปกติ | **ไม่มั่นใจที่สุด** ต้องดูรายการรหัสจริง และต้องไม่รวมรหัส BSE |
| `ovstdiag.icd10` ช่วง `'C50'` ถึง `< 'C51'` | มะเร็งเต้านม | เก็บรหัสแบบไม่มีจุดหรือไม่ (เหมือน DM/HT) |
| `person.sex = '2'` | หญิง | ค่าที่ใช้จริง |

ตรวจรหัสด้วย query เดียวกับ 03 ข้อ 9.1 (`pp_special_code LIKE '1B00%'`)

### 8.2 SQL (MySQL/MariaDB)

พารามิเตอร์

- `:periodStart` = `:countFrom` = 1 ต.ค. ของปีงบฯ
- `:dataAsOf` = วันตัดข้อมูล
- `:birthOnOrBefore` = periodStart − 40 ปี
- `:birthAfter` = periodStart − 71 ปี
- `:icdFrom` = `'C50'`, `:icdToExclusive` = `'C51'`

```sql
-- UNVERIFIED
-- target filter (B) on person p:
--       p.house_regist_type_id IN ('1','3')
--   AND p.person_discharge_id = '9'
--   AND COALESCE(p.death,'N') <> 'Y'
--   AND p.birthdate IS NOT NULL
--   AND p.sex = '2'
--   AND p.birthdate <= :birthOnOrBefore
--   AND p.birthdate >  :birthAfter
--   AND NOT EXISTS (SELECT 1 FROM ovstdiag d
--                   WHERE d.hn = p.patient_hn
--                     AND d.icd10 >= :icdFrom AND d.icd10 < :icdToExclusive
--                     AND d.vstdate < :periodStart)

-- screened subquery sc:
SELECT sp.person_id, MIN(o.vstdate) AS first_screen_date
FROM pp_special ps
JOIN pp_special_type pt ON pt.pp_special_type_id = ps.pp_special_type_id
JOIN ovst o            ON o.vn = ps.vn
JOIN person sp         ON sp.patient_hn = o.hn
WHERE pt.pp_special_code IN ('1B0030','1B0031')
  AND o.vstdate >= :countFrom
  AND o.vstdate <  DATE_ADD(:dataAsOf, INTERVAL 1 DAY)
GROUP BY sp.person_id;
```

query B, A รายเดือน, รายหมู่ และรายชื่อ สร้างด้วย `buildScreeningSql()` แบบเดียวกับ CX (03 ข้อ 9.2) เนื่องจาก countFrom = periodStart จึงไม่มี bucket `'prior'`

## 9. Mock

- eligible ประมาณ 8,940 คน ±2% และความครอบคลุมทั้งปีประมาณ 74–83% (ใกล้เกณฑ์ 80%)
- รายชื่อเป็นเพศหญิงทั้งหมด อายุ 40–70 ปี

## 10. สิ่งที่ต้องยืนยัน

1. เกณฑ์ปีงบฯ 2570 (ค่าตั้งต้น 80%)
2. รหัส SPECIALPP ของ CBE ในฐานจริง (และแยกจาก BSE ได้)
3. การคัดออกผู้ป่วย C50 (รวม `Z85.3` และ `iptdiag` ด้วยหรือไม่) ต้องยืนยันกับผู้รับผิดชอบงาน
4. นับเฉพาะหญิงไทยหรือหญิงทุกสัญชาติ
5. ช่วงอายุ CBE 40–70 ปี ยังใช้ในปี 2570 หรือไม่
