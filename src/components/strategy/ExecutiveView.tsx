"use client";

import { useState } from "react";
import { ArrowRight, Info } from "lucide-react";
import type { Kpi, StrategyDashboardData } from "@/lib/kpi/strategy-types";
import { fmtCell, fmtTarget, hasValue2569 } from "@/lib/kpi/strategy-format";
import { StackedColumnChart } from "./BarCharts";
import { KpiDetailDialog } from "./DetailDialog";
import { LineChart } from "./LineChart";
import {
  Card,
  clickableRowClass,
  CodeChip,
  primaryButtonClass,
  StatCard,
  StatusBadge,
  tableClass,
  tdClass,
  tdRightClass,
  thCenterClass,
  theadClass,
  thClass,
  thRightClass,
} from "./ui";

/** Two-line x-axis labels of the strategy chart (index = strategy). */
const STRATEGY_CHART_LABELS = [
  ["ยุทธศาสตร์ที่ 1", "(บริการสู่ความเป็นเลิศ)"],
  ["ยุทธศาสตร์ที่ 2", "(สุขภาวะเชิงรุก/พื้นที่)"],
  ["ยุทธศาสตร์ที่ 3", "(ดิจิทัลและนวัตกรรม)"],
  ["ยุทธศาสตร์ที่ 4", "(บริหารองค์กรยั่งยืน)"],
];

/** Organisation-level achievement 2565–2569 (HA I-2 report + row counts). */
const TREND_LABELS = ["ปี 2565", "ปี 2566", "ปี 2567", "ปี 2568", "ปี 2569"];
const TREND_SERIES = [
  {
    label: "ร้อยละ KPI ยุทธศาสตร์บรรลุเป้าหมาย (รายงาน HA I-2)",
    color: "#0f766e",
    data: [90.19, 90.24, 95.31, 61.02, 75.68],
    fill: true,
  },
  {
    label: "นับรายข้อจริงจากไฟล์ KPI (ปี 68–69)",
    color: "#0284c7",
    data: [null, null, null, 59.32, 78.38],
    dashed: true,
  },
  {
    label: "เกณฑ์เป้าหมาย HA (> 80%)",
    color: "#d97706",
    data: [80, 80, 80, 80, 80],
    dashed: true,
  },
];

const pctFormat = new Intl.NumberFormat("th-TH", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function passStats(list: Kpi[]) {
  const pass = list.filter((k) => k.status === 1).length;
  const fail = list.filter((k) => k.status === 0).length;
  const total = list.length;
  return { pass, fail, total, pct: total ? (pass / total) * 100 : 0 };
}

export function ExecutiveView({
  data,
  onSelectStrategy,
  onShowAllKpi,
}: {
  data: StrategyDashboardData;
  /** Jump to the KPI tab (year 2569) filtered to this strategy. */
  onSelectStrategy: (groupIdx: number) => void;
  /** Jump to the KPI tab. */
  onShowAllKpi: () => void;
}) {
  const { kpi2569, kpi2568, strat69, haItems } = data;
  const [detail, setDetail] = useState<Kpi | null>(null);

  const all69 = passStats(kpi2569);
  const all68 = passStats(kpi2568);
  const strategies = strat69.map((name, idx) => ({
    idx,
    name,
    ...passStats(kpi2569.filter((k) => k.groupIdx === idx)),
  }));
  const failed69 = kpi2569.filter((k) => k.status === 0);
  const ha69Count = haItems.filter(hasValue2569).length;
  const failByStrategy = strategies.map((s) => `${s.idx + 1} (${s.fail})`).join(", ");

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          tone="pass"
          label="อัตราบรรลุ KPI ยุทธศาสตร์ ปี 2569"
          value={`${pctFormat.format(all69.pct)}%`}
          unit={`(${all69.pass} / ${all69.total} ข้อ)`}
          meta={
            <>
              <p className="font-semibold text-emerald-700 dark:text-emerald-300">
                {all69.pct >= all68.pct ? "▲ เพิ่มขึ้น" : "▼ ลดลง"}จากปี 2568 ({pctFormat.format(all68.pct)}%)
              </p>
              <p>หมายเหตุ: ตารางสรุปท้ายชีตต้นฉบับระบุ 75.68% (28/37 ข้อ)*</p>
            </>
          }
        />
        <StatCard
          tone="fail"
          label="KPI ยุทธศาสตร์ที่ต้องเร่งรัด (ไม่ผ่าน ปี 69)"
          value={all69.fail}
          unit="ตัวชี้วัด"
          meta={
            <>
              <p className="font-semibold text-emerald-700 dark:text-emerald-300">
                {all69.fail <= all68.fail ? "▼ ลดลง" : "▲ เพิ่มขึ้น"}จาก {all68.fail} ข้อในปี 2568
              </p>
              <p>กระจายในยุทธศาสตร์ที่ {failByStrategy}</p>
            </>
          }
        />
        <StatCard
          tone="info"
          label="คลังข้อมูลตัวชี้วัดมาตรฐาน HA (Part I–IV)"
          value={haItems.length}
          unit="รายการ"
          meta={
            <>
              <p className="font-semibold">บันทึกข้อมูลปี 2569 แล้ว {ha69Count} รายการ</p>
              <p>ครอบคลุมแนวโน้ม 5 ปี (พ.ศ. 2565–2569)</p>
            </>
          }
        />
        <StatCard
          label="ความมั่นคงทางการเงิน & คุณภาพบริการ (ปี 69)"
          value="ระดับ 3"
          unit="วิกฤตการเงิน"
          meta={
            <>
              <p className="font-semibold text-emerald-700 dark:text-emerald-300">
                ▲ ดีขึ้นจากระดับ 6 (ปี 2568) • NWC บวก
              </p>
              <p>ความพึงพอใจรวม 90.9% • Smart Hospital ระดับทอง</p>
            </>
          }
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card
          title="ผลการดำเนินงานตาม 4 ยุทธศาสตร์โรงพยาบาลบางระกำ (ปี 2569)"
          subtitle="คลิกที่แถบยุทธศาสตร์ด้านล่างเพื่อเจาะลึกตัวชี้วัดรายยุทธศาสตร์"
        >
          <StackedColumnChart
            ariaLabel="กราฟจำนวนตัวชี้วัดที่ผ่านและไม่ผ่านเกณฑ์ แยกตาม 4 ยุทธศาสตร์ ปี 2569"
            yTitle="จำนวนตัวชี้วัด (ข้อ)"
            columns={strategies.map((s) => ({
              label: STRATEGY_CHART_LABELS[s.idx] ?? [s.name],
              pass: s.pass,
              fail: s.fail,
              title: `${s.name}: รวม ${s.total} ข้อ (บรรลุ ${s.pct.toFixed(1)}%)`,
            }))}
          />
          <ul className="mt-4 space-y-2">
            {strategies.map((s) => (
              <li key={s.idx}>
                <button
                  type="button"
                  onClick={() => onSelectStrategy(s.idx)}
                  title={`คลิกเพื่อดูตัวชี้วัดใน${s.name}`}
                  className="w-full rounded-lg border border-zinc-200 p-2 text-left hover:border-brand-300 hover:bg-brand-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 dark:border-zinc-800 dark:hover:bg-brand-900/30"
                >
                  <span className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                    <span className="min-w-0 text-xs font-semibold">{s.name}</span>
                    <span className="shrink-0 text-xs tabular-nums">
                      <span className="text-emerald-700 dark:text-emerald-300">ผ่าน {s.pass}</span>
                      {" / "}
                      <span className="text-red-700 dark:text-red-300">ไม่ผ่าน {s.fail}</span>
                      {` (${s.pct.toFixed(1)}%)`}
                    </span>
                  </span>
                  <span className="mt-1.5 flex h-1.5 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
                    <span
                      className="h-full bg-emerald-600"
                      style={{ width: `${s.total ? (s.pass / s.total) * 100 : 0}%` }}
                    />
                    <span
                      className="h-full bg-red-600"
                      style={{ width: `${s.total ? (s.fail / s.total) * 100 : 0}%` }}
                    />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Card>

        <Card
          title="แนวโน้มการบรรลุตัวชี้วัดระดับองค์กร 5 ปี (พ.ศ. 2565–2569)"
          subtitle="อ้างอิงข้อมูล HA หมวด I-2 กลยุทธ์ (เป้าหมาย > 80%) เชื่อมโยงผลงานปี 2568–2569"
        >
          <LineChart
            labels={TREND_LABELS}
            series={TREND_SERIES}
            yMin={40}
            yMax={105}
            yFormat={(v) => `${v}%`}
          />
          <div className="mt-4 flex gap-2 rounded-lg border border-sky-200 bg-sky-50 p-3 text-xs leading-5 text-sky-950 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-100">
            <Info aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              <strong>ข้อสังเกตเชิงยุทธศาสตร์เพื่อการขับเคลื่อนด้วยข้อมูล:</strong>{" "}
              ผลการบรรลุ KPI ระดับองค์กรฟื้นตัวจาก <strong>61.02%</strong> ในปี 2568
              ขึ้นมาอยู่ที่ <strong>75.68%</strong> (หรือ <strong>78.38%</strong>{" "}
              เมื่อนับรายข้อครบ 37 ข้อ) ในปี 2569 เข้าใกล้เกณฑ์เป้าหมาย HA (&gt;80%)
              โดยมียุทธศาสตร์ด้านดิจิทัล (HAIT Plus) และการลดผู้ป่วยรายใหม่ NCD (DM/HT)
              เป็นจุดเน้นสำคัญ
            </p>
          </div>
        </Card>
      </div>

      <Card
        title={`รายการเฝ้าระวังเร่งด่วน (Action Watchlist): ตัวชี้วัดยุทธศาสตร์ปี 2569 ที่ยังไม่ผ่านเกณฑ์ (${failed69.length} รายการ)`}
        subtitle="คลิกที่แถวรายการเพื่อดูกราฟแนวโน้มรายไตรมาส (Q1–Q4) และรายละเอียดการติดตาม"
        action={
          <button type="button" onClick={onShowAllKpi} className={primaryButtonClass}>
            ดู KPI ยุทธศาสตร์ทั้งหมด ({kpi2569.length} ข้อ)
            <ArrowRight aria-hidden="true" className="h-4 w-4" />
          </button>
        }
      >
        <div className="-mx-4 overflow-x-auto">
          <table className={`${tableClass} min-w-[56rem]`}>
            <thead className={theadClass}>
              <tr>
                <th scope="col" className={thClass}>รหัส</th>
                <th scope="col" className={thClass}>ตัวชี้วัดองค์กร</th>
                <th scope="col" className={thClass}>ยุทธศาสตร์</th>
                <th scope="col" className={thClass}>เป้าหมาย</th>
                <th scope="col" className={thRightClass}>Q1</th>
                <th scope="col" className={thRightClass}>Q2</th>
                <th scope="col" className={thRightClass}>Q3</th>
                <th scope="col" className={thRightClass}>Q4 / ล่าสุด</th>
                <th scope="col" className={thCenterClass}>สรุปผล</th>
                <th scope="col" className={thClass}>ผู้รับผิดชอบ</th>
              </tr>
            </thead>
            <tbody>
              {failed69.map((k) => (
                <tr
                  key={k.idx}
                  tabIndex={0}
                  onClick={() => setDetail(k)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setDetail(k);
                    }
                  }}
                  className={clickableRowClass}
                >
                  <td className={tdClass}><CodeChip>{k.code}</CodeChip></td>
                  <td className={`${tdClass} font-semibold`}>{k.name}</td>
                  <td className={`${tdClass} whitespace-nowrap`}>{k.groupShort}</td>
                  <td className={tdClass}>{fmtTarget(k.target, k.q)}</td>
                  {k.q.map((v, i) => (
                    <td key={i} className={`${tdRightClass} ${i === 3 ? "font-bold" : ""}`}>
                      {fmtCell(v)}
                    </td>
                  ))}
                  <td className={`${tdClass} text-center`}><StatusBadge status={k.status} /></td>
                  <td className={tdClass}>{k.owner}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <KpiDetailDialog kpi={detail} year="2569" onClose={() => setDetail(null)} />
    </div>
  );
}
