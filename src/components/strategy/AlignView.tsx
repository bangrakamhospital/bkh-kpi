import type { ReactNode } from "react";
import { Card, CodeChip } from "@/components/strategy/ui";

type Alignment = {
  domain: string;
  title: string;
  kpiLabel: string;
  kpiVal: string;
  haLabel: string;
  haVal: string;
  insight: string;
};

const ALIGNMENTS: Alignment[] = [
  {
    domain: "ยุทธศาสตร์ที่ 1 • โรคไม่ติดต่อเรื้อรัง (DM)",
    title: "การควบคุมระดับน้ำตาลในผู้ป่วยเบาหวาน & DM Remission",
    kpiLabel: "KPI ปี 2569 (K1 / K4)",
    kpiVal: "คุมน้ำตาล 44.2% (ผ่าน) | Remission 16.98% (ไม่ผ่านเป้า 30%)",
    haLabel: "แนวโน้ม HA 5 ปี (III-3: ปี 65 → 69)",
    haVal: "HbA1C <7%: 35.97% → 44.87% | Remission: 35.33% (ปี 67) → 14.62%",
    insight:
      "การควบคุมระดับน้ำตาลภาพรวมดีขึ้นต่อเนื่องเกินเกณฑ์ 40% ทั้งสองแหล่งข้อมูล แต่โครงการ DM Remission ต้องเร่งทบทวนกระบวนการโภชนบำบัดและติดตามผู้ป่วยรายใหม่",
  },
  {
    domain: "ยุทธศาสตร์ที่ 2 • สุขภาวะเชิงรุกและควบคุมโรคในพื้นที่",
    title: "การคัดกรองและลดอุบัติการณ์ผู้ป่วยเบาหวาน/ความดันรายใหม่",
    kpiLabel: "KPI ปี 2569 (K22–K25)",
    kpiVal:
      "คัดกรอง DM 92.15%, HT 94.37% (ผ่าน) | ป่วยใหม่ DM 617.7, HT 1,264.4 ต่อแสนฯ (ไม่ผ่าน)",
    haLabel: "แนวโน้ม HA (II-9 & IV-94: ปี 65 → 68)",
    haVal: "ป่วยใหม่ DM 543.3 → 843.9 ต่อแสนฯ | HT 1,069.5 → 1,206.7 ต่อแสนฯ",
    insight:
      "การคัดกรองเชิงรุกทำได้สูงเกินเป้า 90% ทำให้ค้นพบผู้ป่วยรายใหม่เข้าสู่ระบบมากขึ้น ส่งผลให้อัตราป่วยรายใหม่ต่อแสนประชากรยังสูงกว่าเพดานเป้าหมาย (<600 และ <1,200)",
  },
  {
    domain: "ยุทธศาสตร์ที่ 2 • โรคสำคัญและการแพทย์ฉุกเฉิน",
    title: "การเข้าถึงบริการฉุกเฉิน EMS, Stroke และการรักษาวัณโรค (TB)",
    kpiLabel: "KPI ปี 2569 (K7, K9, K10)",
    kpiVal:
      "รักษา TB สำเร็จ 92.86% (ผ่าน) | Stroke ADL>11 85.81% (ผ่าน) | EMS 20.86% (ไม่ผ่านเป้า >29%)",
    haLabel: "แนวโน้ม HA (I-6 & III-3: ปี 65 → 69)",
    haVal: "TB สำเร็จก้าวกระโดด 68.67% → 92.86% | EMS ลดลงจาก 37.87% (ปี 65) → 20.86%",
    insight:
      "ระบบการรักษาวัณโรคและการฟื้นฟูผู้ป่วย Stroke มีผลลัพธ์โดดเด่นมาก ขณะที่สัดส่วนผู้ป่วยฉุกเฉินที่มาด้วยระบบ EMS มีแนวโน้มลดลงต่อเนื่อง 5 ปี ควรประชาสัมพันธ์สายด่วน 1669 เชิงรุกในชุมชน",
  },
  {
    domain: "ยุทธศาสตร์ที่ 3 • ดิจิทัลและนวัตกรรมบริการ",
    title: "การขยายบริการ Telemedicine และมาตรฐาน HAIT Plus",
    kpiLabel: "KPI ปี 2569 (K29, K30)",
    kpiVal:
      "Telemedicine Q4 = 4,518 ครั้ง (ผ่านเกณฑ์ >30/เดือน) | HAIT Plus ระดับ 2 (ยังไม่ผ่าน)",
    haLabel: "แนวโน้ม HA (I-2, I-4 & III-4.3 ฌ)",
    haVal:
      "Telemedicine รพ.–รพ.สต. เพิ่มจาก 68 ครั้ง (ปี 68) → 3,533 ครั้ง (ปี 69) | Smart Hospital ระดับทอง",
    insight:
      "บริการการแพทย์ทางไกลเติบโตแบบก้าวกระโดด ตอบโจทย์การเข้าถึงบริการในพื้นที่ โจทย์ถัดไปคือการยกระดับธรรมาภิบาลข้อมูลและความมั่นคงปลอดภัยสารสนเทศเพื่อผ่าน HAIT Plus ระดับ 2",
  },
  {
    domain: "ยุทธศาสตร์ที่ 4 • ความมั่นคงทางการเงินและการบริหารทรัพยากร",
    title: "การฟื้นฟูสถานะทางการเงิน ค่า CMI และต้นทุนต่อหน่วย (Unit Cost)",
    kpiLabel: "KPI ปี 2569 (K31–K33)",
    kpiVal:
      "วิกฤตการเงิน ระดับ 3 (ยังไม่ถึงระดับ 0) | รายได้ > ค่าใช้จ่าย (+31.8 ล.) & NWC บวก (+39.5 ล.)",
    haLabel: "แนวโน้ม HA (I-2, II-5 & IV-100: ปี 68 → 69)",
    haVal:
      "วิกฤตการเงินลดจากระดับ 6 → ระดับ 3 | CMI เพิ่มต่อเนื่อง 0.62 (ปี 65) → 0.96 (ปี 69) | Cash Ratio 0.24 → 0.47",
    insight:
      "เห็นสัญญาณฟื้นตัวทางการเงินชัดเจนจากปี 2568 (ที่ติดลบ -41.6 ลบ. วิกฤตระดับ 6) มาเป็นบวกในปี 2569 สอดคล้องกับความสมบูรณ์เวชระเบียนและค่า CMI ที่เพิ่มขึ้นต่อเนื่องทุกปี",
  },
  {
    domain: "ยุทธศาสตร์ที่ 4 • บุคลากรและผู้รับบริการ",
    title: "ดัชนีความสุขบุคลากร (Happinometer) และความพึงพอใจผู้รับบริการ",
    kpiLabel: "KPI ปี 2569 (K35–K37)",
    kpiVal:
      "ความพึงพอใจรวม 90.9% (ผ่าน) | Happinometer ผ่านเกณฑ์ >60% | ข้อร้องเรียน 15 เรื่อง (ไม่ผ่านเป้า 0)",
    haLabel: "แนวโน้ม HA (I-3 & I-5: ปี 65 → 69)",
    haVal:
      "OPD 89.6%, IPD 92.7% | Happy Body 61.1%, Relax 66.1%, Money 58.2% | ผูกพันองค์กร 70.01%",
    insight:
      "ความพึงพอใจของผู้ป่วยนอกและผู้ป่วยในสูงสุดในรอบ 5 ปี ควบคู่กับการดูแลคุณภาพชีวิตบุคลากร โดยควรเน้นการบริหารจัดการข้อร้องเรียนด้านพฤติกรรมบริการและการรักษาเพื่อลดอุบัติการณ์",
  },
];

type DataQualityNote = {
  source: string;
  finding: ReactNode;
  recommendation: ReactNode;
};

const DATA_QUALITY_NOTES: DataQualityNote[] = [
  {
    source: "KPI ปี 2569",
    finding: (
      <>
        ตารางสรุปท้ายชีตระบุ ยุทธศาสตร์ที่ 4 มี 7 ตัวชี้วัด (ผ่าน 4, ไม่ผ่าน 2,
        รวมผ่าน 28/37 = <strong>75.68%</strong>) แต่เมื่อนับรายแถวจริง
        (K31–K37) พบ <strong>ผ่าน 5 รายการ ไม่ผ่าน 2 รายการ</strong>{" "}
        (รวมทั้งองค์กรผ่าน 29/37 = <strong>78.38%</strong>)
      </>
    ),
    recommendation: (
      <>
        ผูกสูตร <CodeChip>COUNTIFS</CodeChip>{" "}
        อัตโนมัติในชีตสรุปผลแทนการพิมพ์ค่าคงที่
        เพื่อลดความคลาดเคลื่อนในการรายงานผลระดับองค์กรและ HA หมวด I-2
      </>
    ),
  },
  {
    source: "KPI ปี 2568",
    finding: (
      <>
        ตารางสรุปท้ายชีตระบุ Goal 5 (ความมั่นคงทางการเงิน) ผ่าน 3 ข้อ
        แต่ในตารางรายข้อ K53–K55 (วิกฤตการเงินระดับ 6, รายได้-รายจ่าย -41.59
        ลบ., NWC -0.64 ลบ.) บันทึกสรุปผลเป็น{" "}
        <strong>ไม่ผ่านทั้ง 3 ข้อ</strong>
      </>
    ),
    recommendation:
      "สอบทานสถานะสรุปผลรายข้อกับตารางสรุปท้ายปีให้ตรงกัน เพื่อให้ฐานเปรียบเทียบข้ามปี (Baseline) มีความแม่นยำ",
  },
  {
    source: "KPI K3 & K13 (ปี 69)",
    finding: (
      <>
        ตัวชี้วัด K3 (DM รายใหม่จากกลุ่มเสี่ยง &lt; 1.5%) มีค่า Q4 ={" "}
        <strong>1.68</strong> และ K13 (ภาวะแทรกซ้อนเฉียบพลัน DM &lt; 2%) มีค่า
        Q4 = <strong>2.16</strong> แต่คอลัมน์สรุปผลระบุว่า{" "}
        <strong>&quot;ผ่าน&quot;</strong> (รวมถึง K18 ไข้เลือดออก เป้าหมาย 50
        ต่อแสนฯ ค่า Q4 = 50.95 ระบุ &quot;ผ่าน&quot;)
      </>
    ),
    recommendation:
      "กำหนดเกณฑ์ตัดสิน (Threshold Rule) และหน่วยวัดรายไตรมาส vs สะสมรายปีให้ชัดเจนในระบบบันทึกข้อมูลกลาง",
  },
  {
    source: "KPI vs HA (Telemedicine)",
    finding: (
      <>
        จำนวนบริการ Telemedicine ปี 2569 ในไฟล์ KPI ยุทธศาสตร์ (K30) ไตรมาส 4
        ระบุ <strong>4,518 ครั้ง</strong> ขณะที่ไฟล์ HA หมวด III-4.3 ฌ ระบุ{" "}
        <strong>3,533 ครั้ง</strong> (ระหว่าง รพ. กับ รพ.สต. 3 แห่ง)
      </>
    ),
    recommendation:
      'แยกนิยามตัวชี้วัดระหว่าง "Telemedicine ทั้งหมดของ รพ." กับ "Telemedicine เชื่อม รพ.สต." ให้ชัดเจนใน Data Dictionary',
  },
  {
    source: "รูปแบบค่าเป้าหมาย",
    finding: (
      <>
        มีการผสมรูปแบบการบันทึกค่าเป้าหมายระหว่างสัดส่วนทศนิยม (เช่น{" "}
        <CodeChip>0.8</CodeChip>, <CodeChip>0.75</CodeChip>,{" "}
        <CodeChip>0.3</CodeChip>) กับร้อยละ (เช่น <CodeChip>80%</CodeChip>,{" "}
        <CodeChip>&gt; 75%</CodeChip>) ในทั้งสองไฟล์
      </>
    ),
    recommendation: (
      <>
        กำหนดรูปแบบมาตรฐานเดียวกัน (เช่น ร้อยละ 0–100 พร้อมเครื่องหมายทิศทาง{" "}
        <CodeChip>&ge;</CodeChip> หรือ <CodeChip>&le;</CodeChip>)
        เพื่อรองรับการประมวลผลอัตโนมัติ
      </>
    ),
  },
];

export function AlignView() {
  return (
    <div className="flex flex-col gap-4">
      <Card
        title="การเชื่อมโยงเข็มมุ่งยุทธศาสตร์ รพ.บางระกำ กับผลลัพธ์มาตรฐาน HA (Data-Driven Synergy)"
        subtitle="เปรียบเทียบข้อมูลตรงจากทั้ง 2 ไฟล์ ในประเด็นยุทธศาสตร์หลัก เพื่อตรวจสอบความสอดคล้องและทิศทางการพัฒนา"
      />

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {ALIGNMENTS.map((a) => (
          <Card key={a.title} title={a.title}>
            <div className="flex flex-col gap-2">
              <span className="w-fit rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-xs font-medium text-brand-800 dark:border-brand-800 dark:bg-brand-900/30 dark:text-brand-100">
                {a.domain}
              </span>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div className="rounded-lg bg-zinc-50 p-2 dark:bg-zinc-800/50">
                  <p className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
                    {a.kpiLabel}
                  </p>
                  <p className="text-xs">{a.kpiVal}</p>
                </div>
                <div className="rounded-lg bg-zinc-50 p-2 dark:bg-zinc-800/50">
                  <p className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
                    {a.haLabel}
                  </p>
                  <p className="text-xs">{a.haVal}</p>
                </div>
              </div>
              <p className="text-xs text-zinc-600 dark:text-zinc-400">
                <strong className="text-zinc-900 dark:text-zinc-100">
                  สรุปผลวิเคราะห์:
                </strong>{" "}
                {a.insight}
              </p>
            </div>
          </Card>
        ))}
      </div>

      <Card
        title="ข้อค้นพบด้านคุณภาพข้อมูล (Data Quality & Governance Notes) เพื่อการขับเคลื่อนด้วยข้อมูล"
        subtitle="จากการตรวจสอบความสอดคล้องของข้อมูลทั้ง 2 ไฟล์โดยอัตโนมัติ พบประเด็นที่ควรปรับมาตรฐานข้อมูลให้ตรงกันดังนี้"
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-xs">
            <thead className="bg-zinc-100 dark:bg-zinc-800">
              <tr>
                <th className="px-2 py-2 font-medium">แหล่งข้อมูล</th>
                <th className="px-2 py-2 font-medium">
                  ประเด็นที่ตรวจพบจากไฟล์ข้อมูลจริง
                </th>
                <th className="px-2 py-2 font-medium">
                  ข้อเสนอแนะเชิงระบบข้อมูล (Data Governance)
                </th>
              </tr>
            </thead>
            <tbody>
              {DATA_QUALITY_NOTES.map((n) => (
                <tr
                  key={n.source}
                  className="border-t border-zinc-200 align-top dark:border-zinc-800"
                >
                  <td className="px-2 py-2 font-bold text-brand-700 dark:text-brand-100">
                    {n.source}
                  </td>
                  <td className="px-2 py-2">{n.finding}</td>
                  <td className="px-2 py-2">{n.recommendation}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
