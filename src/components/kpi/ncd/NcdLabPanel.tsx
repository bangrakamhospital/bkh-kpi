import type {
  NcdGlucoseTests,
  NcdHba1cUse,
  NcdLabPanelRow,
} from "@/lib/kpi/ncd-clinic-types";
import { ProgressBar } from "../ProgressBar";
import { formatBaht, formatNumber, formatPercent } from "../format";
import {
  tableClass,
  tdClass,
  tdRightClass,
  theadClass,
  thClass,
  thRightClass,
  trClass,
} from "../overview/table-styles";

const boxClass = "min-w-0 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800";

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-zinc-600 dark:text-zinc-400">{label}</p>
      <p className="text-base font-bold tabular-nums">{value}</p>
      {sub && <p className="text-xs text-zinc-600 dark:text-zinc-400">{sub}</p>}
    </div>
  );
}

export function NcdLabPanel({
  panel,
  hba1c,
  glucose,
}: {
  panel: NcdLabPanelRow[];
  hba1c: NcdHba1cUse;
  glucose: NcdGlucoseTests;
}) {
  return (
    <section
      aria-label="การตรวจ lab ของผู้ป่วยเบาหวาน"
      className="min-w-0 rounded-xl border border-zinc-200 bg-surface p-4 shadow-sm dark:border-zinc-800"
    >
      <h2 className="text-base font-semibold">การตรวจ lab ผู้ป่วยเบาหวาน</h2>
      <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
        สัดส่วนผู้ป่วย DM ที่มีผล lab อย่างน้อย 1 ครั้งในปีงบฯ (นับทุก visit) &quot;ครบ 5 รายการ&quot; = HbA1c + LDL + Cr + K + FBS ครบทุกตัว
      </p>
      <div className="mt-3 overflow-x-auto">
        <table className={`${tableClass} min-w-[28rem]`}>
          <thead className={theadClass}>
            <tr>
              <th scope="col" className={thClass}>รายการ</th>
              <th scope="col" className={thRightClass}>คน</th>
              <th scope="col" className={thRightClass}>ร้อยละ</th>
              <th scope="col" className={thClass}>สัดส่วน</th>
            </tr>
          </thead>
          <tbody>
            {panel.map((r) => (
              <tr key={r.code} className={trClass}>
                <th
                  scope="row"
                  className={`${tdClass} text-left ${r.code === "PANEL" ? "font-semibold" : "font-medium"}`}
                >
                  {r.name}
                </th>
                <td className={tdRightClass}>{formatNumber(r.persons)}</td>
                <td className={`${tdRightClass} font-semibold`}>
                  {r.percent === null ? "–" : `${formatPercent(r.percent)}%`}
                </td>
                <td className={tdClass}>
                  {r.percent !== null && (
                    <ProgressBar
                      percent={r.percent}
                      targetPercent={null}
                      barClass="bg-brand-600"
                      label={`${r.name} ${formatPercent(r.percent)}%`}
                    />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div className={boxClass}>
          <h3 className="text-sm font-semibold">
            HbA1c เกินสิทธิ (สปสช. จ่ายไม่เกิน {formatNumber(hba1c.billableLimit)} ครั้ง/คน/ปี)
          </h3>
          <div className="mt-2 grid grid-cols-3 gap-3">
            <Stat
              label="คนที่เกินสิทธิ"
              value={formatNumber(hba1c.personsOverLimit)}
              sub="คน"
            />
            <Stat
              label="ครั้งที่เกิน"
              value={formatNumber(hba1c.excessTests)}
              sub={`จากทั้งหมด ${formatNumber(hba1c.tests)} ครั้ง`}
            />
            <Stat
              label="ประมาณ (บาท)"
              value={formatBaht(hba1c.excessBaht)}
              sub={`${formatBaht(hba1c.priceBaht)} บาท/ครั้ง`}
            />
          </div>
          <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-400">
            ค่าประมาณจากราคาใน HOSxP เบิก สปสช. ไม่ได้ นับทุกสิทธิ
          </p>
        </div>

        <div className={boxClass}>
          <h3 className="text-sm font-semibold">น้ำตาลในเลือด: FBS (เจาะเลือด) เทียบ DTX (ปลายนิ้ว)</h3>
          <div className="mt-2 grid grid-cols-3 gap-3">
            <Stat label="FBS (visit)" value={formatNumber(glucose.fbsVisits)} />
            <Stat label="DTX (visit)" value={formatNumber(glucose.dtxVisits)} />
            <Stat
              label="สัดส่วน FBS"
              value={glucose.fbsPercent === null ? "–" : `${formatPercent(glucose.fbsPercent)}%`}
            />
          </div>
          <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-400">
            นับ visit ของคลินิกที่มีรายการ lab นั้น การใช้ DTX แทน FBS ลดต้นทุนได้ แต่ HOSxP ไม่มีต้นทุนน้ำยา ค่าบริการเท่ากัน (40 บาท) จึงแสดงเฉพาะจำนวน
          </p>
        </div>
      </div>
    </section>
  );
}
