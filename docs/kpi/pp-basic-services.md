# P&P Basic Services (`/pp/basic`): ดัชนี

> หน้าฝั่งโรงพยาบาล ใช้ HOSxP (`--conn 1`) อย่างเดียว ไม่ใช้ HDC · แสดงเฉพาะยอดรวม (คน) ไม่มีข้อมูลระบุตัวบุคคล
> Loader: `src/lib/kpi/ppbasic.ts` (`getPpBasicSummary`, cache tag `kpi:ppbasic`) · สัญญาข้อมูล: `src/lib/kpi/ppbasic-types.ts`
> SQL: `src/lib/kpi/sql/ppbasic-common.ts` (builder รายหมู่บ้านที่ใช้ร่วมกัน), `ppbasic-child-hosxp.ts`, `ppbasic-dental-elderly-hosxp.ts`
> ปีงบฯ ที่เลือกได้: ตั้งแต่ 2568 (ตรวจข้อมูลแล้วตั้งแต่ FY2568)

## รายการและเอกสารนิยาม

| # | code | รายการ | เอกสาร |
| --- | --- | --- | --- |
| 1 | `CHILD_DEV` | ตรวจพัฒนาการ (DSPM) เด็ก 0–5 ปี | [pp-basic-child.md](./pp-basic-child.md) |
| 2 | `CHILD_GROWTH` | ชั่งน้ำหนัก วัดส่วนสูง เด็ก 0–12 ปี | [pp-basic-child.md](./pp-basic-child.md) |
| 3 | `EPI` | วัคซีนพื้นฐาน แรกเกิด – ป.6 | [pp-basic-child.md](./pp-basic-child.md) |
| 4 | `FLUORIDE` | เคลือบฟลูออไรด์ เด็ก 4–12 ปี | [pp-basic-dental-elderly.md](./pp-basic-dental-elderly.md) |
| 5 | `SEALANT` | เคลือบหลุมร่องฟัน เด็ก 6–12 ปี | [pp-basic-dental-elderly.md](./pp-basic-dental-elderly.md) |
| 6 | `ELDERLY_DEPRESSION` | คัดกรองซึมเศร้า ผู้สูงอายุ 60+ | [pp-basic-dental-elderly.md](./pp-basic-dental-elderly.md) |

## กฎวันที่ (ใช้เหมือนกันทั้ง 6 รายการ)

| พารามิเตอร์ | ค่า |
| --- | --- |
| `periodStart` | 1 ต.ค. ของปีงบฯ (วันอ้างอิงอายุ) |
| `countFrom` | = `periodStart` (นับบริการตั้งแต่ 1 ต.ค.) |
| `dataAsOf` | 30 ก.ย. เมื่อปีงบฯ ปิดแล้ว, **วันนี้** (Asia/Bangkok) สำหรับปีที่ยังไม่ปิด (รวมวันนั้น) |

ผลต่อปีที่ยังไม่ปิด:
- `CHILD_DEV`, `EPI` (cohort 1/2/3/5 ปี): เป้าหมายคือเด็กที่ครบอายุใน `[periodStart, dataAsOf]` จึง**นับเฉพาะที่ถึงกำหนดแล้ว** ยกเว้น EPI ชั้น ป.6 ที่กำหนดจากช่วงวันเกิด จึงอยู่ในเป้าตั้งแต่ 1 ต.ค. (ฉีด dT ช่วง ก.พ.–มี.ค.)
- `CHILD_GROWTH`: อายุ 0–12 ปี ณ 1 ต.ค. รวมเด็กที่เกิดถึง `dataAsOf`
- `FLUORIDE`, `SEALANT`, `ELDERLY_DEPRESSION`: อายุ ณ 1 ต.ค. เป้าเป็นของทั้งปี `dataAsOf` ใช้ตัดช่วงบริการเท่านั้น

ต่างจาก PPFS (`src/lib/kpi/ppfs.ts`) ที่ส่ง `dataAsOf` = 30 ก.ย. ทุกปี เพราะเป้า PPFS เป็นยอดเงินทั้งปี

## การตัดสินใจ (ค่าเริ่มต้นของเจ้าของงาน)

- `ELDERLY_DEPRESSION` = SPECIALPP รวมแบบฟอร์ม `depression_screen` (สูงกว่า HDC ที่นับเฉพาะ SPECIALPP ประมาณ 11 จุดใน FY2569)
- `CHILD_GROWTH` = แหล่ง NUTRITION เท่านั้น ไม่นับ `opdscreen`
- `SEALANT` ไม่ตัดเด็กที่เคยเคลือบแล้วออกจากเป้า

## ผลตรวจ FY2569 (ปิดปีแล้ว, db-cli 2026-11-13, SQL ที่ loader สร้าง)

| รายการ | ทำแล้ว / เป้าหมาย | % | เวลา |
| --- | ---: | ---: | ---: |
| CHILD_DEV | 200 / 207 | 96.6 | 0.1 s |
| CHILD_GROWTH | 660 / 958 | 68.9 | 0.4 s |
| EPI | 234 / 287 | 81.5 | 3.2 s |
| FLUORIDE | 552 / 754 | 73.2 | 0.2 s |
| SEALANT | 216 / 626 | 34.5 | 0.2 s |
| ELDERLY_DEPRESSION | 2,402 / 3,290 | 73.0 | 2.2 s |

FY2570 (ยังไม่ปิด, `dataAsOf` = 2026-11-13): CHILD_DEV 16/26, CHILD_GROWTH 44/877, EPI 25/131, FLUORIDE 15/717, SEALANT 27/623, ELDERLY_DEPRESSION 243/3,490
