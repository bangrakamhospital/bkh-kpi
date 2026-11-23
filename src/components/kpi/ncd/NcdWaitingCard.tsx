import type { NcdHosxpSteps, NcdWaitRow, NcdWaitStats } from "@/lib/kpi/ncd-clinic-types";
import { ExcelDownloadButton, type ExcelExport } from "../overview/ExcelDownloadButton";
import { round2 } from "../overview/export-utils";
import {
  tableClass,
  tdClass,
  tdRightClass,
  theadClass,
  thClass,
  thRightClass,
  trClass,
} from "../overview/table-styles";
import { formatNumber } from "../format";

const MEASURES: { key: "toDoctor" | "toPharmacy" | "screenToDoctor"; label: string }[] = [
  { key: "toDoctor", label: "มาถึง → พบแพทย์" },
  { key: "toPharmacy", label: "มาถึง → รับยา" },
  { key: "screenToDoctor", label: "ซักประวัติเสร็จ → พบแพทย์" },
];

const minutes = (v: number | null) => (v === null ? "–" : formatNumber(Math.round(v)));

const decimal2 = new Intl.NumberFormat("th-TH", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
/** Minutes with 2 decimals, as in the HOSxP report. */
const minutes2 = (v: number | null) => (v === null ? "–" : decimal2.format(v));

/** Steps that summarise several steps (shown after a divider, bold). */
const SUMMARY_STEPS = new Set(["TOTAL", "NEW_TO_RX"]);

function HosxpStepsTable({ data, fiscalYear }: { data: NcdHosxpSteps; fiscalYear: number }) {
  const excel: ExcelExport = {
    fileName: `ncd-waiting-hosxp-steps-fy${fiscalYear}`,
    title: `NCD Clinic ระยะเวลารอคอย 5 ขั้นตอนแบบรายงาน HOSxP ปีงบประมาณ ${fiscalYear}`,
    subtitle: `แหล่งข้อมูล HOSxP · visit ที่มีเวลาครบ ${data.qualifyingVisits} จาก ${data.visits} ครั้ง (${data.qualifyingPersons} จาก ${data.persons} คน) ลงทะเบียน 06:00–16:00`,
    sheetName: "5 ขั้นตอน",
    columns: [
      { header: "ขั้นตอน" },
      { header: "ช่วงเวลา" },
      { header: "เฉลี่ย (นาที)" },
      { header: "มัธยฐาน (นาที)" },
      { header: "ต่ำสุด (นาที)" },
      { header: "สูงสุด (นาที)" },
    ],
    rows: data.steps.map((s) => [
      s.label,
      s.span,
      round2(s.meanMinutes),
      round2(s.medianMinutes),
      round2(s.minMinutes),
      round2(s.maxMinutes),
    ]),
    notes: [
      'นิยามเดียวกับรายงาน HOSxP "ระยะเวลาในการรับบริการในเวลาราชการ" แต่เฉพาะ NCD ไม่นับ visit ของวันนี้ นับเป็น visit ไม่ใช่คน คัดเฉพาะ visit ที่มีเวลาครบและเรียงลำดับทุกขั้น (แต่ละขั้น > 1 นาที) "รวม" ไม่รวมการรอซักประวัติ',
    ],
  };

  return (
    <div className="mt-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="text-sm font-semibold">5 ขั้นตอนแบบรายงาน HOSxP (เฉพาะ NCD)</h3>
        <ExcelDownloadButton data={excel} />
      </div>
      <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
        visit ที่มีเวลาครบทุกขั้น {formatNumber(data.qualifyingVisits)} จาก{" "}
        {formatNumber(data.visits)} ครั้ง ({formatNumber(data.qualifyingPersons)} จาก{" "}
        {formatNumber(data.persons)} คน) ลงทะเบียน 06:00–16:00
      </p>
      <div className="mt-2 overflow-x-auto">
        <table className={`${tableClass} min-w-[44rem]`}>
          <thead className={theadClass}>
            <tr>
              <th scope="col" className={thClass}>ขั้นตอน</th>
              <th scope="col" className={thClass}>ช่วงเวลา</th>
              <th scope="col" className={thRightClass}>เฉลี่ย (นาที)</th>
              <th scope="col" className={thRightClass}>มัธยฐาน (นาที)</th>
              <th scope="col" className={thRightClass}>ต่ำสุด (นาที)</th>
              <th scope="col" className={thRightClass}>สูงสุด (นาที)</th>
            </tr>
          </thead>
          <tbody>
            {data.steps.map((s) => {
              const summary = SUMMARY_STEPS.has(s.code);
              return (
                <tr
                  key={s.code}
                  className={`${trClass} ${summary ? "bg-zinc-50 font-semibold dark:bg-zinc-900" : ""}`}
                >
                  <th scope="row" className={`${tdClass} text-left font-medium`}>{s.label}</th>
                  <td className={`${tdClass} text-zinc-600 dark:text-zinc-400`}>{s.span}</td>
                  <td className={tdRightClass}>{minutes2(s.meanMinutes)}</td>
                  <td className={tdRightClass}>{minutes2(s.medianMinutes)}</td>
                  <td className={tdRightClass}>{minutes2(s.minMinutes)}</td>
                  <td className={tdRightClass}>{minutes2(s.maxMinutes)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-400">
        รายงาน HOSxP ReportBuilder &quot;CUSTOM- ระยะเวลาในการรับบริการในเวลาราชการ (8.30 น.-16.00 น.)&quot;
        เป็นของ OPD ทั้ง รพ. (ลงทะเบียน 06:00–16:00) นับเป็น visit ไม่ใช่คน ใช้ค่าเฉลี่ย
        คัดเฉพาะ visit ที่มีเวลาครบและเรียงลำดับทุกขั้น (แต่ละขั้น &gt; 1 นาที) และ &quot;รวม&quot;
        ไม่รวมการรอซักประวัติ ตารางนี้ใช้นิยามเดียวกันแต่เฉพาะ NCD ต่างจากรายงานเพียงไม่นับ visit
        ของวันนี้ (ปีที่ปิดแล้วผลเท่ากัน) ส่วนตารางแรกใช้นิยามของหน้าเว็บ: นับจากลงทะเบียน, ใช้มัธยฐาน
        และนับทุก visit ที่มีเวลา
      </p>
    </div>
  );
}

function Cells({ s }: { s: NcdWaitStats }) {
  return (
    <>
      <td className={tdRightClass}>{minutes(s.medianMinutes)}</td>
      <td className={tdRightClass}>{minutes(s.meanMinutes)}</td>
      <td className={tdRightClass}>{minutes(s.p90Minutes)}</td>
      <td className={tdRightClass}>{formatNumber(s.measured)}</td>
    </>
  );
}

export function NcdWaitingCard({
  waiting,
  hosxpSteps,
  fiscalYear,
}: {
  waiting: NcdWaitRow[];
  hosxpSteps: NcdHosxpSteps;
  fiscalYear: number;
}) {
  const rows = [...waiting].sort((a, b) => Number(a.withLab) - Number(b.withLab));
  const excel: ExcelExport = {
    fileName: `ncd-waiting-fy${fiscalYear}`,
    title: `NCD Clinic ระยะเวลารอคอย (นาที) ปีงบประมาณ ${fiscalYear}`,
    subtitle: "แหล่งข้อมูล HOSxP",
    sheetName: "รอคอย",
    columns: [
      { header: "กลุ่ม visit" },
      { header: "visit ทั้งหมด", format: "int" },
      { header: "ช่วงเวลา" },
      { header: "มัธยฐาน (นาที)" },
      { header: "เฉลี่ย (นาที)" },
      { header: "P90 (นาที)" },
      { header: "visit ที่วัดได้", format: "int" },
    ],
    rows: rows.flatMap((w) =>
      MEASURES.map((m) => [
        w.withLab ? "visit ที่มี lab" : "visit ที่ไม่มี lab",
        w.visits,
        m.label,
        round2(w[m.key].medianMinutes),
        round2(w[m.key].meanMinutes),
        round2(w[m.key].p90Minutes),
        w[m.key].measured,
      ]),
    ),
    notes: [
      'เวลาจาก "มาถึง" รวมการรอก่อนคลินิกเปิด (ผู้ป่วยลงทะเบียนราว 06:00 เพื่อเจาะเลือดอดอาหาร) ค่ามัธยฐานและ P90 คำนวณจากช่วงละ 10 นาที ไม่นับ visit ของวันนี้ และ visit ที่ไม่มีเวลาหรือเวลาผิดปกติ (ติดลบ หรือ > 12 ชั่วโมง)',
    ],
  };
  return (
    <section
      aria-label="ระยะเวลารอคอย"
      className="min-w-0 rounded-xl border border-zinc-200 bg-surface p-4 shadow-sm dark:border-zinc-800"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 className="text-base font-semibold">ระยะเวลารอคอย (นาที)</h2>
        <ExcelDownloadButton data={excel} />
      </div>
      <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
        ผู้ป่วยมาลงทะเบียนตั้งแต่ราว 06:00 เพื่อเจาะเลือดอดอาหาร เวลาจาก &quot;มาถึง&quot; จึงรวมการรอก่อนคลินิกเปิด &quot;พบแพทย์&quot; = เวลาที่แพทย์ตรวจเสร็จและส่งต่อ ค่ามัธยฐานและ P90 คำนวณจากช่วงละ 10 นาที ไม่นับ visit ของวันนี้ (ยังให้บริการไม่ครบ) และ visit ที่ไม่มีเวลาหรือเวลาผิดปกติ (ติดลบ หรือ &gt; 12 ชั่วโมง)
      </p>
      <div className="mt-3 overflow-x-auto">
        <table className={`${tableClass} min-w-[40rem]`}>
          <thead className={theadClass}>
            <tr>
              <th scope="col" className={thClass}>ช่วงเวลา</th>
              <th scope="col" className={thRightClass}>มัธยฐาน (นาที)</th>
              <th scope="col" className={thRightClass}>เฉลี่ย (นาที)</th>
              <th scope="col" className={thRightClass}>P90 (นาที)</th>
              <th scope="col" className={thRightClass}>visit ที่วัดได้ (ครั้ง)</th>
            </tr>
          </thead>
          {rows.map((w) => (
            <tbody key={String(w.withLab)}>
              <tr className="bg-zinc-50 dark:bg-zinc-900">
                <th scope="colgroup" colSpan={5} className="px-3 py-1.5 text-left text-sm font-semibold">
                  {w.withLab ? "visit ที่มี lab" : "visit ที่ไม่มี lab"} ({formatNumber(w.visits)} visit)
                </th>
              </tr>
              {MEASURES.map((m) => (
                <tr key={m.key} className={trClass}>
                  <th scope="row" className={`${tdClass} text-left font-medium`}>{m.label}</th>
                  <Cells s={w[m.key]} />
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </div>
      <HosxpStepsTable data={hosxpSteps} fiscalYear={fiscalYear} />
    </section>
  );
}
