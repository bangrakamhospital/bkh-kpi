import type { NcdWaitRow, NcdWaitStats } from "@/lib/kpi/ncd-clinic-types";
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

export function NcdWaitingCard({ waiting }: { waiting: NcdWaitRow[] }) {
  const rows = [...waiting].sort((a, b) => Number(a.withLab) - Number(b.withLab));
  return (
    <section
      aria-label="ระยะเวลารอคอย"
      className="min-w-0 rounded-xl border border-zinc-200 bg-surface p-4 shadow-sm dark:border-zinc-800"
    >
      <h2 className="text-base font-semibold">ระยะเวลารอคอย (นาที)</h2>
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
    </section>
  );
}
