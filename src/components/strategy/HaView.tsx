"use client";

import { useMemo, useState } from "react";
import type {
  Cell,
  HaItem,
  StrategyDashboardData,
} from "@/lib/kpi/strategy-types";
import {
  fmtCell,
  fmtTarget,
  hasValue2569,
  parseNum,
  parseTargetLine,
} from "@/lib/kpi/strategy-format";
import { DetailDialog, DetailValueGrid } from "@/components/strategy/DetailDialog";
import { LineChart } from "@/components/strategy/LineChart";
import {
  Card,
  EmptyState,
  SearchField,
  SelectField,
} from "@/components/strategy/ui";

const YEAR_LABELS = ["ปี 2565", "ปี 2566", "ปี 2567", "ปี 2568", "ปี 2569"];

const SPOTLIGHT_QUERIES = [
  { label: "บรรลุ KPI ยุทธศาสตร์ (I-2)", match: "แผนยุทธศาสตร์และเข็มมุ่งระดับองค์กร" },
  { label: "ความพึงพอใจ OPD (I-3)", match: "ความพึงพอใจโดยรวมของผู้ป่วยนอก" },
  { label: "ความผูกพันบุคลากร (I-5)", match: "อัตราความผูกพันของบุคลากร" },
  { label: "ค่า CMI เวชระเบียน (II-5)", match: "อัตราค่า CMI" },
  { label: "เบาหวานคุมน้ำตาล HbA1C < 7% (III-3)", match: "คุมน้ำตาลได้ HbA1C < 7%" },
  { label: "รักษาวัณโรคปอดสำเร็จ (III-3)", match: "รักษาผู้ป่วย TB รายใหม่" },
  { label: "ผู้ป่วยฉุกเฉิน EMS (I-6)", match: "ผู้ป่วยฉุกเฉินที่มาด้วยระบบ EMS" },
  { label: "Unit Cost IPD (IV-87)", match: "Unit cost IPD" },
];

const YEAR_FILTER_OPTIONS = [
  { value: "all", label: "แสดงทั้งหมด (2565–2569)" },
  { value: "has69", label: "เฉพาะที่มีผลปี 2569 แล้ว" },
  { value: "wait69", label: "รอรายงานผลปี 2569" },
];

const numberFormat = new Intl.NumberFormat("th-TH");

/** Resolve each spotlight keyword to the first HA item that has numeric data. */
function resolveSpotlights(items: readonly HaItem[]) {
  return SPOTLIGHT_QUERIES.flatMap((sq) => {
    const found = items.find(
      (item) =>
        item.name.includes(sq.match) &&
        item.years.some((v) => parseNum(v) !== null),
    );
    return found ? [{ label: sq.label, idx: found.idx }] : [];
  });
}

/** Normalize mixed decimal vs percent series (e.g. 0.98, 0.97, ..., 98.71). */
function normalizeSeries(years: readonly Cell[]): (number | null)[] {
  const series = years.map(parseNum);
  const nonNull = series.filter((v): v is number => v !== null);
  if (nonNull.some((v) => v > 20) && nonNull.some((v) => v > 0 && v <= 1)) {
    return series.map((v) =>
      v !== null && v > 0 && v <= 1 ? +(v * 100).toFixed(2) : v,
    );
  }
  return series;
}

export function HaView({ data }: { data: StrategyDashboardData }) {
  const { haItems, haSections, partNames } = data;
  const spotlights = useMemo(() => resolveSpotlights(haItems), [haItems]);
  const [part, setPart] = useState("all");
  const [sec, setSec] = useState("all");
  const [yearFilter, setYearFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [selectedIdx, setSelectedIdx] = useState<number | null>(
    spotlights[0]?.idx ?? haItems[0]?.idx ?? null,
  );
  const [detail, setDetail] = useState<HaItem | null>(null);

  const sections = useMemo(
    () =>
      haSections.filter((s) => part === "all" || String(s.partIdx) === part),
    [haSections, part],
  );

  const partOptions = useMemo(
    () => [
      { value: "all", label: "ทุกหมวด (Part I – Part IV)" },
      ...partNames.map((name, i) => ({ value: String(i), label: name })),
    ],
    [partNames],
  );

  const secOptions = useMemo(
    () => [
      { value: "all", label: `หมวดย่อยทั้งหมด (${sections.length} หมวด)` },
      ...sections.map((s) => ({ value: String(s.id), label: s.secName })),
    ],
    [sections],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return haItems.filter((item) => {
      if (part !== "all" && String(item.partIdx) !== part) return false;
      if (sec !== "all" && String(item.secId) !== sec) return false;
      const has69 = hasValue2569(item);
      if (yearFilter === "has69" && !has69) return false;
      if (yearFilter === "wait69" && has69) return false;
      if (q) {
        const hay = `${item.secName} ${item.name} ${item.target}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [haItems, part, sec, yearFilter, query]);

  const selected =
    haItems.find((i) => i.idx === selectedIdx) ?? filtered[0] ?? null;

  const chart = useMemo(() => {
    if (!selected) return null;
    const series = normalizeSeries(selected.years);
    return {
      series,
      dispTarget: fmtTarget(selected.target, series),
      targetLine: parseTargetLine(selected.target, series),
    };
  }, [selected]);

  const reset = () => {
    setPart("all");
    setSec("all");
    setYearFilter("all");
    setQuery("");
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 rounded-xl border border-zinc-200 bg-surface p-3 shadow-sm sm:grid-cols-2 lg:grid-cols-4 dark:border-zinc-800">
        <SelectField
          label="หมวดมาตรฐาน HA (Part)"
          value={part}
          onChange={(v) => {
            setPart(v);
            setSec("all");
          }}
          options={partOptions}
        />
        <SelectField
          label="หมวดย่อย / ระบบงาน"
          value={sec}
          onChange={setSec}
          options={secOptions}
        />
        <SelectField
          label="ความครบถ้วนข้อมูลปี 2569"
          value={yearFilter}
          onChange={setYearFilter}
          options={YEAR_FILTER_OPTIONS}
        />
        <SearchField
          label="ค้นหาเครื่องชี้วัด HA"
          value={query}
          onChange={setQuery}
          placeholder="เช่น Sepsis, Stroke, HbA1C, CMI"
        />
        <div className="sm:col-span-2 lg:col-span-4">
          <button
            type="button"
            onClick={reset}
            className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            ล้างตัวกรอง
          </button>
        </div>
      </div>

      <Card
        title={
          selected ? selected.name : "กราฟวิเคราะห์แนวโน้ม 5 ปี (พ.ศ. 2565–2569)"
        }
        subtitle={
          selected
            ? `หมวด: ${selected.secName} (${selected.partName}) • ดับเบิลคลิกที่แถวในตารางเพื่อดูรายละเอียดค่าดิบรายปี`
            : "เลือกตัวชี้วัดสำคัญด้านล่าง หรือคลิกแถวใดก็ได้ในตารางเพื่อพล็อตกราฟ 5 ปี"
        }
        action={
          <span className="rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-xs font-medium text-brand-800 dark:border-brand-800 dark:bg-brand-900/30 dark:text-brand-100">
            เป้าหมาย: {chart ? chart.dispTarget : "-"}
          </span>
        }
      >
        <ul className="mb-3 flex gap-2 overflow-x-auto pb-1">
          {spotlights.map((s) => {
            const active = s.idx === selected?.idx;
            return (
              <li key={s.idx} className="shrink-0">
                <button
                  type="button"
                  aria-pressed={active}
                  onClick={() => setSelectedIdx(s.idx)}
                  className={`whitespace-nowrap rounded-full border px-3 py-1 text-xs font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 ${
                    active
                      ? "border-brand-600 bg-brand-600 text-white"
                      : "border-brand-200 bg-brand-50 text-brand-800 hover:bg-brand-100 dark:border-brand-800 dark:bg-brand-900/30 dark:text-brand-100"
                  }`}
                >
                  {s.label}
                </button>
              </li>
            );
          })}
        </ul>

        {chart && (
          <LineChart
            labels={YEAR_LABELS}
            series={[
              {
                label: "ผลการดำเนินงาน (พ.ศ. 2565–2569)",
                color: "#0f766e",
                data: chart.series,
                fill: true,
              },
              ...(chart.targetLine !== null
                ? [
                    {
                      label: `เกณฑ์เป้าหมาย (${chart.dispTarget})`,
                      color: "#d97706",
                      data: YEAR_LABELS.map(() => chart.targetLine),
                      dashed: true,
                    },
                  ]
                : []),
            ]}
          />
        )}
      </Card>

      <Card
        title="ตารางเครื่องชี้วัดคุณภาพมาตรฐาน HA โรงพยาบาลบางระกำ (พ.ศ. 2565–2569)"
        subtitle="คลิกที่แถวเพื่อดูกราฟแนวโน้ม 5 ปีด้านบน ดับเบิลคลิกเพื่อดูค่ารายปี"
        action={
          <span className="rounded-full border border-zinc-300 px-3 py-1 text-xs tabular-nums dark:border-zinc-700">
            แสดง {numberFormat.format(filtered.length)} จาก{" "}
            {numberFormat.format(haItems.length)} รายการ
          </span>
        }
      >
        {filtered.length === 0 ? (
          <EmptyState
            title="ไม่พบเครื่องชี้วัด HA ที่ตรงกับตัวกรอง"
            hint="ลองเลือกหมวดมาตรฐานอื่น หรือล้างตัวกรองเพื่อดูข้อมูลทั้งหมด"
          />
        ) : (
          <div className="max-h-[70vh] overflow-auto">
            <table className="w-full min-w-[820px] text-left text-xs">
              <thead className="sticky top-0 bg-zinc-100 dark:bg-zinc-800">
                <tr>
                  <th className="px-2 py-2 font-medium">หมวด / ระบบงาน</th>
                  <th className="px-2 py-2 font-medium">ข้อมูล / ตัวชี้วัด</th>
                  <th className="px-2 py-2 font-medium">เป้าหมาย</th>
                  {YEAR_LABELS.map((y) => (
                    <th key={y} className="px-2 py-2 text-right font-medium">
                      {y}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => {
                  const isSel = item.idx === selected?.idx;
                  return (
                    <tr
                      key={item.idx}
                      tabIndex={0}
                      aria-selected={isSel}
                      onClick={() => setSelectedIdx(item.idx)}
                      onDoubleClick={() => setDetail(item)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") setDetail(item);
                        if (e.key === " ") {
                          e.preventDefault();
                          setSelectedIdx(item.idx);
                        }
                      }}
                      className={`cursor-pointer border-t border-zinc-200 align-top dark:border-zinc-800 ${
                        isSel
                          ? "bg-brand-50 dark:bg-brand-900/30"
                          : "hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                      }`}
                    >
                      <td className="px-2 py-2">
                        <div className="font-bold text-brand-700 dark:text-brand-100">
                          {item.partName.split(":")[0]}
                        </div>
                        <div className="text-zinc-600 dark:text-zinc-400">
                          {item.secName.length > 38
                            ? `${item.secName.slice(0, 38)}…`
                            : item.secName}
                        </div>
                      </td>
                      <td className="px-2 py-2 font-bold">{item.name}</td>
                      <td className="px-2 py-2">
                        {fmtTarget(item.target, [...item.years])}
                      </td>
                      {item.years.map((v, i) => (
                        <td
                          key={YEAR_LABELS[i]}
                          className={`px-2 py-2 text-right tabular-nums ${
                            i === 4 ? "font-bold" : ""
                          }`}
                        >
                          {fmtCell(v)}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <DetailDialog
        open={detail !== null}
        onClose={() => setDetail(null)}
        badge={detail ? `${detail.partName.split(":")[0]} • ${detail.secName}` : ""}
        title={detail?.name ?? ""}
        meta={
          detail
            ? `${detail.partName} | เป้าหมาย: ${fmtTarget(detail.target, [...detail.years])}`
            : ""
        }
      >
        {detail && (
          <DetailValueGrid
            items={detail.years.map((v, i) => ({ label: YEAR_LABELS[i], value: fmtCell(v) }))}
          />
        )}
      </DetailDialog>
    </div>
  );
}
