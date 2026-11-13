# รายได้ PP ทั้งอำเภอ (/district/pp) — ดัชนีและกติกา

แหล่งข้อมูล: ฐาน HDC 43 แฟ้ม (`sub_hdc`) **เท่านั้น** ไม่ใช้ HOSxP (กฎของหน้าอำเภอ) · ตรวจด้วย db-cli `--conn 2` เมื่อ 2026-11-13

| ส่วน | เอกสาร | SQL | รายการ/อัตรา |
|---|---|---|---|
| PPFS (9 รายการ) | `district-pp-ppfs.md` | `src/lib/kpi/sql/district-ppfs-hdc.ts` | `DISTRICT_PPFS_ITEMS` (`ppfs-rates.ts`) |
| P&P Basic (6 รายการ) | `district-pp-basic.md` | `src/lib/kpi/sql/district-ppbasic-hdc.ts` | `DISTRICT_PPBASIC_ITEMS` (`ppbasic-rates.ts`) |
| หมู่บ้าน / วันที่ข้อมูลรายหน่วย | ไฟล์นี้ | `src/lib/kpi/sql/district-pp-hdc.ts` | — |

Contract: `src/lib/kpi/district-pp-types.ts` · Loader: `src/lib/kpi/district-pp.ts` (`getDistrictPpSummary`) · UI: `src/components/kpi/district-pp/`

## กติกา

1. **หน่วยหมู่บ้าน = (vid, hospcode)** — `DistrictPpVillage.key = "${vid}:${hospcode}"` และ `DistrictPpCell.key` อ้างถึง key นี้ คนนับในหมู่บ้านตามที่อยู่ HOME และใต้หน่วยที่รับผิดชอบ (hospcode ของ PERSON typearea 1/3 ที่เลือกใน `residents`, GA00… ตัดเหลือ 5 หลัก) ทั้ง PPFS และ P&P Basic
   - หมู่ 01, 06, 09, 10, 11 ต.วังอิทก (650404) มีทั้ง 07529 และ 11803 จึงมี 2 entry ต่อหมู่
   - กรอง **รพ.สต.** = เลือกเฉพาะ entry ของหน่วยนั้น (ตรง) · กรอง **ตำบล/หมู่** = รวมทุกหน่วยในหมู่นั้น · ตัวเลือก "หมู่" แสดงหนึ่งรายการต่อ vid
   - รายชื่อหมู่บ้านจากแฟ้ม VILLAGE (152 แถว → 147 หน่วยหมู่บ้าน / 142 vid) รวม key ที่พบใน cell แต่ไม่อยู่ใน VILLAGE (ปี 2569 ไม่มี) ชื่อตำบล/หน่วยจาก `district-areas.ts` HDC ไม่มีชื่อหมู่บ้าน (`villageName = null`)
2. **วัคซีนเด็กนอกเขตอำเภอ** — เข็ม EPI ที่หน่วยในอำเภอฉีดให้เด็ก UC ที่ไม่ใช่ประชากรในหมู่บ้านของอำเภอ (`DISTRICT_EPI_NONRESIDENT_SQL`) ส่งเป็น `unitExtras: {hospcode, code: "EPI", done}[]` ตามหน่วยที่ฉีด UI นับเป็น **ทั้ง done และ target** (ไม่เกิด gap) **เฉพาะเมื่อไม่ได้กรองตำบล/หมู่** (ระดับอำเภอหรือรายหน่วย) พร้อมข้อความ "รวมวัคซีนเด็กนอกเขตอำเภอ N เข็ม"
3. **ไม่นับ HPV 9 สายพันธุ์** (HPVG91–93, Gardasil 9) ในเงิน EPI — ยังไม่ยืนยันว่า สปสช. จ่าย (`HDC_EXCLUDED_HPV9_CODES` ใน SQL) ปี 2569 มี HPVG91 118 เข็ม
4. **ไม่แสดง EPI_PERSONS** (ความครบวัคซีนตามกลุ่มอายุ) เพราะ HDC ไม่มีประวัติวัคซีนก่อน ต.ค. 2568 (SQL เก็บไว้เป็น `DISTRICT_EPI_PERSONS_SQL`)
5. **ความครบของข้อมูล** — `unitDataAsOf: {hospcode, hospName, lastDate}[]` = วันที่ SERVICE ล่าสุดของแต่ละหน่วยในช่วง [1 ต.ค., dataAsOf] (null = ยังไม่มี visit) UI เตือน (text-xs) หน่วยที่ข้อมูลหยุดก่อน dataAsOf เกิน 30 วัน เฉพาะหน่วยในตัวกรองปัจจุบัน
6. **ช่วงเวลา** — periodStart = countFrom = 1 ต.ค. · dataAsOf = 30 ก.ย. ถ้าปิดปีแล้ว ไม่เช่นนั้น = วันนี้ (Asia/Bangkok) ใช้กับ P&P Basic · PPFS ใช้ 30 ก.ย. เสมอ (เป้าเงินทั้งปี เหมือนหน้า `/pp`)
7. **Loader** — `await io()` แล้วเรียกฟังก์ชัน `"use cache"` key (fiscalYear, closed, dataAsOf), `cacheTag("kpi:district-pp")`, `cacheLife` "days" (ปิดปี) / "hours" (ปีปัจจุบัน) / "minutes" (มี query ล้ม) · 17 query รันพร้อมกันครั้งละ 2 (pool HDC มี 5 connection) · error รายรายการ (`item.error`) โยน error เฉพาะเมื่อทุกรายการล้ม · ส่งเฉพาะค่าสรุป ไม่มี CID/ชื่อ/HN

## ผลปีงบ 2569 (ปิดปีแล้ว, dataAsOf 2026-09-30)

| ส่วน | target | done | บาท target / done |
|---|---:|---:|---|
| PPFS รวม 9 รายการ | — | — | 12,311,650 / 1,333,880 (สปสช.) ตรงกับผู้เขียน |
| CHILD_DEV | 1,780 | 1,216 | — |
| CHILD_GROWTH | 6,364 | 5,938 | — |
| EPI (เข็ม ในหมู่บ้าน, ไม่นับ HPV9) | 6,666 | 5,097 | 133,320 / 101,940 (สปสช.) |
| EPI นอกเขต (`unitExtras`) | 1,706 | 1,706 | 34,120 / 34,120 |
| FLUORIDE | 4,678 | 2,712 | 467,800 / 271,200 (ค่าอ้างอิง) |
| SEALANT | 3,819 | 1,231 | — |
| ELDERLY_DEPRESSION | 17,756 | 14,620 | — |

- EPI ทั้งอำเภอ (ไม่กรอง) = 8,372 / 6,803 เข็ม = 167,440 / 136,060 บาท
- ก่อนตัด HPV9: EPI 6,754 / 5,186 และนอกเขต 1,732 · หลังตัด HPV9 เด็กหญิง ป.5 ที่ได้ HPV 9 สายพันธุ์แล้ว (89 จาก 309 คน) ไม่นับเป็นเข็มที่ถึงกำหนด (ได้วัคซีนแล้ว แค่ไม่ได้เงิน) จึงไม่เป็น gap: due 6,544 -> 6,456, target 6,751 -> 6,666
- วันที่ SERVICE ล่าสุด (ปี 2569): ข้อมูลหยุดก่อน 31 ส.ค. 2569 (เกิน 30 วัน) — 07527, 07531, 07535, 11252 (31 ก.ค.), 07539 (30 มิ.ย.), 07542 (14 ส.ค.), 11803 (15 ส.ค.)
- เวลาโหลดครั้งแรก (ไม่มี cache, 17 query ผ่าน db-cli): ครั้งละ 1 = 25 s, ครั้งละ 2 = 15 s, ครั้งละ 3 หรือ 5 = 17 s (ฐานข้อมูลเป็นคอขวด) หลังจากนั้นอ่านจาก cache
