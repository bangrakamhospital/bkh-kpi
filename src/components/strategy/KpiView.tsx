"use client";

import { useState } from "react";
import { Maximize2 } from "lucide-react";
import type { Kpi, StrategyDashboardData } from "@/lib/kpi/strategy-types";
import { fmtCell, fmtTarget, parseNum } from "@/lib/kpi/strategy-format";
import { ExcelDownloadButton, type ExcelExport } from "@/components/kpi/overview/ExcelDownloadButton";
import { KpiQuarterChart, StackedBarList } from "./BarCharts";
import { KpiDetailDialog } from "./DetailDialog";
import {
  Card,
  clickableRowClass,
  CodeChip,
  EmptyState,
  FilterBar,
  mutedClass,
  Pill,
  ResetButton,
  SearchField,
  SelectField,
  selectedRowClass,
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

export type KpiYear = "2569" | "2568";

/** KPI tab state; owned by StrategyDashboard so other tabs can preset it. */
export interface KpiFilters {
  year: KpiYear;
  /** Group index as string, or "all". */
  group: string;
  /** "all" | "1" (pass) | "0" (fail). */
  status: string;
  /** Owner name, or "all". */
  owner: string;
  search: string;
  /** Kpi.idx of the row shown in the quarterly chart. */
  selectedIdx: number;
}

export const DEFAULT_KPI_FILTERS: KpiFilters = {
  year: "2569",
  group: "all",
  status: "all",
  owner: "all",
  search: "",
  selectedIdx: 0,
};

const YEARS: KpiYear[] = ["2569", "2568"];
const STATUS_OPTIONS = [
  { value: "all", label: "ทั้งหมด" },
  { value: "1", label: "ผ่านเกณฑ์" },
  { value: "0", label: "ไม่ผ่านเกณฑ์" },
];
/** Owners shown in the by-owner chart (largest first). */
const OWNER_CHART_LIMIT = 9;
const OWNER_LABEL_MAX = 22;

export function kpiListOf(data: StrategyDashboardData, year: KpiYear): Kpi[] {
  return year === "2569" ? data.kpi2569 : data.kpi2568;
}

function matches(k: Kpi, f: KpiFilters, q: string): boolean {
  if (f.group !== "all" && String(k.groupIdx) !== f.group) return false;
  if (f.status !== "all" && String(k.status) !== f.status) return false;
  if (f.owner !== "all" && k.owner !== f.owner) return false;
  if (!q) return true;
  const hay = `${k.code} ${k.name} ${k.groupName} ${k.objective ?? ""} ${k.owner}`.toLowerCase();
  return hay.includes(q);
}

/** All owners (no chart limit) for the Excel export. */
function ownerExcelRows(list: Kpi[]): (string | number)[][] {
  const byOwner = new Map<string, { pass: number; fail: number }>();
  for (const k of list) {
    const row = byOwner.get(k.owner) ?? { pass: 0, fail: 0 };
    if (k.status === 1) row.pass++;
    else row.fail++;
    byOwner.set(k.owner, row);
  }
  return [...byOwner.entries()]
    .sort((a, b) => b[1].pass + b[1].fail - (a[1].pass + a[1].fail))
    .map(([name, v]) => [name, v.pass + v.fail, v.pass, v.fail, (v.pass / (v.pass + v.fail)) * 100]);
}

function ownerRows(list: Kpi[]) {
  const byOwner = new Map<string, { pass: number; fail: number }>();
  for (const k of list) {
    const row = byOwner.get(k.owner) ?? { pass: 0, fail: 0 };
    if (k.status === 1) row.pass++;
    else row.fail++;
    byOwner.set(k.owner, row);
  }
  return [...byOwner.entries()]
    .sort((a, b) => b[1].pass + b[1].fail - (a[1].pass + a[1].fail))
    .slice(0, OWNER_CHART_LIMIT)
    .map(([name, v]) => ({
      label: name.length > OWNER_LABEL_MAX ? `${name.slice(0, OWNER_LABEL_MAX)}…` : name,
      fullLabel: name,
      ...v,
    }));
}

export function KpiView({
  data,
  filters,
  onFiltersChange,
}: {
  data: StrategyDashboardData;
  filters: KpiFilters;
  onFiltersChange: (next: KpiFilters) => void;
}) {
  const [detail, setDetail] = useState<Kpi | null>(null);
  const set = (patch: Partial<KpiFilters>) => onFiltersChange({ ...filters, ...patch });

  const is69 = filters.year === "2569";
  const list = kpiListOf(data, filters.year);
  const groups = is69 ? data.strat69 : data.goals68;
  const owners = [...new Set(list.map((k) => k.owner))].sort((a, b) => a.localeCompare(b, "th"));

  const q = filters.search.trim().toLowerCase();
  const filtered = list.filter((k) => matches(k, filters, q));
  const pass = filtered.filter((k) => k.status === 1).length;
  const fail = filtered.filter((k) => k.status === 0).length;
  const pct = filtered.length ? ((pass / filtered.length) * 100).toFixed(1) : "0.0";

  // Keep the chosen row while it is visible; otherwise the first row that
  // has a numeric quarter (falls back to the first row).
  const selected =
    filtered.find((k) => k.idx === filters.selectedIdx) ??
    filtered.find((k) => k.q.some((v) => parseNum(v) !== null)) ??
    filtered[0] ??
    null;

  const openDetail = (k: Kpi) => setDetail(k);

  const filterNote = `ตามตัวกรองที่เลือก (${filtered.length} จาก ${list.length} ข้อ)`;
  const ownerExcel: ExcelExport = {
    fileName: `strategy-kpi-by-owner-${filters.year}`,
    title: `ผลการดำเนินงานจำแนกตามผู้รับผิดชอบ ปี ${filters.year}`,
    subtitle: `ปี ${filters.year} · แหล่งข้อมูล ไฟล์ KPI รพ. ติดตาม · ${filterNote}`,
    sheetName: "ตามผู้รับผิดชอบ",
    columns: [
      { header: "ผู้รับผิดชอบ / หน่วยงาน" },
      { header: "ตัวชี้วัดทั้งหมด (ข้อ)", format: "int" },
      { header: "ผ่าน (ข้อ)", format: "int" },
      { header: "ไม่ผ่าน (ข้อ)", format: "int" },
      { header: "ร้อยละที่ผ่าน", format: "pct" },
    ],
    rows: ownerExcelRows(filtered),
    footer: [["รวม", filtered.length, pass, fail, filtered.length ? (pass / filtered.length) * 100 : null]],
  };
  const kpiExcel: ExcelExport = {
    fileName: `strategy-kpi-${filters.year}`,
    title: `ตารางติดตามตัวชี้วัดยุทธศาสตร์ ปีงบประมาณ ${filters.year}`,
    subtitle: `ปี ${filters.year} · แหล่งข้อมูล ไฟล์ KPI รพ. ติดตาม · ${filterNote}`,
    sheetName: `KPI ปี ${filters.year}`,
    columns: [
      { header: "รหัส" },
      { header: "ตัวชี้วัด" },
      { header: is69 ? "ยุทธศาสตร์" : "Goal" },
      ...(is69 ? [] : [{ header: "วัตถุประสงค์" }]),
      { header: "เกณฑ์เป้าหมาย" },
      { header: "Q1" },
      { header: "Q2" },
      { header: "Q3" },
      { header: "Q4" },
      { header: "สรุปผล" },
      { header: "ผู้รับผิดชอบ" },
    ],
    rows: filtered.map((k) => [
      k.code,
      k.name,
      k.groupShort,
      ...(is69 ? [] : [k.objective ?? null]),
      fmtTarget(k.target, k.q),
      ...k.q.map((v) => (v === "" ? null : v)),
      k.status === 1 ? "ผ่าน" : "ไม่ผ่าน",
      k.owner,
    ]),
    footer: [[`ผ่าน ${pass} / ไม่ผ่าน ${fail} (${pct}%)`]],
  };

  return (
    <div className="space-y-4">
      <FilterBar>
        <div className="min-w-0">
          <p className="mb-1 text-xs font-semibold text-zinc-700 dark:text-zinc-300">ปีงบประมาณ</p>
          <div
            role="group"
            aria-label="เลือกปีงบประมาณ"
            className="inline-flex w-full overflow-hidden rounded-lg border border-zinc-300 dark:border-zinc-700"
          >
            {YEARS.map((y) => {
              const on = filters.year === y;
              return (
                <button
                  key={y}
                  type="button"
                  aria-pressed={on}
                  onClick={() => onFiltersChange({ ...filters, year: y, group: "all", owner: "all", selectedIdx: 0 })}
                  className={`flex-1 whitespace-nowrap px-3 py-1.5 text-sm font-medium focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-600 ${
                    on ? "bg-brand-700 text-white" : "bg-surface hover:bg-brand-50 dark:hover:bg-brand-900/40"
                  }`}
                >
                  ปี {y} ({kpiListOf(data, y).length} ข้อ)
                </button>
              );
            })}
          </div>
        </div>
        <SelectField
          label={is69 ? "ยุทธศาสตร์ (4 ด้าน)" : "เป้าประสงค์ (Goals ปี 2568)"}
          value={filters.group}
          onChange={(group) => set({ group })}
          options={[
            { value: "all", label: `ทั้งหมด (${groups.length} หมวด)` },
            ...groups.map((g, i) => ({ value: String(i), label: g })),
          ]}
        />
        <SelectField
          label="สถานะสรุปผล"
          value={filters.status}
          onChange={(status) => set({ status })}
          options={STATUS_OPTIONS}
        />
        <SelectField
          label="ผู้รับผิดชอบ / หน่วยงาน"
          value={filters.owner}
          onChange={(owner) => set({ owner })}
          options={[
            { value: "all", label: `ผู้รับผิดชอบทั้งหมด (${owners.length})` },
            ...owners.map((o) => ({ value: o, label: o })),
          ]}
        />
        <SearchField
          label="ค้นหาตัวชี้วัด"
          value={filters.search}
          onChange={(search) => set({ search })}
          placeholder="พิมพ์รหัส เช่น K1, เบาหวาน, Telemedicine, การเงิน..."
        />
        <ResetButton
          onClick={() => set({ group: "all", status: "all", owner: "all", search: "" })}
        />
      </FilterBar>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard label={`ตัวชี้วัดที่กรองแสดง (ปี ${filters.year})`} value={filtered.length} unit="รายการ" />
        <StatCard tone="pass" label="ผ่านเกณฑ์เป้าหมาย" value={pass} unit={`ข้อ (${pct}%)`} />
        <StatCard tone="fail" label="ไม่ผ่านเกณฑ์เป้าหมาย" value={fail} unit="ข้อ" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card
          title="ผลการดำเนินงานจำแนกตามผู้รับผิดชอบ"
          subtitle="เปรียบเทียบจำนวนตัวชี้วัดที่ผ่านและไม่ผ่านตามเงื่อนไขที่กรอง"
          action={filtered.length > 0 ? <ExcelDownloadButton data={ownerExcel} /> : undefined}
        >
          {filtered.length ? (
            <StackedBarList
              ariaLabel="กราฟจำนวนตัวชี้วัดที่ผ่านและไม่ผ่าน แยกตามผู้รับผิดชอบ"
              rows={ownerRows(filtered)}
            />
          ) : (
            <p className={`py-8 text-center ${mutedClass}`}>ไม่มีข้อมูล</p>
          )}
        </Card>

        <Card
          title={
            selected
              ? `${selected.code}: ${selected.name.slice(0, 58)}${selected.name.length > 58 ? "…" : ""}`
              : "แนวโน้มรายไตรมาส (Q1–Q4)"
          }
          subtitle={
            selected
              ? `เป้าหมาย: ${fmtTarget(selected.target, selected.q)} • ผู้รับผิดชอบ: ${selected.owner} (ดับเบิลคลิกแถวเพื่อเปิดหน้าต่างขยาย)`
              : "ไม่มีรายการที่เลือก"
          }
        >
          {selected && <KpiQuarterChart kpi={selected} year={filters.year} />}
        </Card>
      </div>

      <Card
        title={`ตารางติดตามตัวชี้วัดยุทธศาสตร์ ปีงบประมาณ ${filters.year}`}
        subtitle="แสดงข้อมูลจริงจากไฟล์ KPI รพ ติดตาม • คลิกที่แถวเพื่อแสดงกราฟรายไตรมาส ดับเบิลคลิกหรือกดปุ่มขยายเพื่อดูรายละเอียด"
        action={
          <div className="flex flex-wrap items-center gap-2">
            {filtered.length > 0 && <ExcelDownloadButton data={kpiExcel} />}
            <Pill>แสดง {filtered.length} รายการ</Pill>
          </div>
        }
      >
        {filtered.length === 0 ? (
          <EmptyState
            title="ไม่พบตัวชี้วัดที่ตรงกับเงื่อนไขการค้นหา"
            hint="ลองเปลี่ยนหมวดยุทธศาสตร์ สถานะ หรือล้างคำค้นหาเพื่อดูรายการทั้งหมด"
          />
        ) : (
          <div className="-mx-4 overflow-x-auto">
            <table className={`${tableClass} min-w-[60rem]`}>
              <thead className={theadClass}>
                <tr>
                  <th scope="col" className={thClass}>รหัส</th>
                  <th scope="col" className={thClass}>ตัวชี้วัด</th>
                  <th scope="col" className={thClass}>{is69 ? "ยุทธศาสตร์" : "Goal / วัตถุประสงค์"}</th>
                  <th scope="col" className={thClass}>เกณฑ์เป้าหมาย</th>
                  <th scope="col" className={thRightClass}>Q1</th>
                  <th scope="col" className={thRightClass}>Q2</th>
                  <th scope="col" className={thRightClass}>Q3</th>
                  <th scope="col" className={thRightClass}>Q4</th>
                  <th scope="col" className={thCenterClass}>สรุปผล</th>
                  <th scope="col" className={thClass}>ผู้รับผิดชอบ</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((k) => {
                  const isSelected = k.idx === selected?.idx;
                  return (
                    <tr
                      key={k.idx}
                      tabIndex={0}
                      aria-selected={isSelected}
                      onClick={() => set({ selectedIdx: k.idx })}
                      onDoubleClick={() => openDetail(k)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") openDetail(k);
                        if (e.key === " ") {
                          e.preventDefault();
                          set({ selectedIdx: k.idx });
                        }
                      }}
                      className={`${clickableRowClass} ${isSelected ? selectedRowClass : ""}`}
                    >
                      <td className={tdClass}>
                        <span className="inline-flex items-center gap-1">
                          <CodeChip>{k.code}</CodeChip>
                          <button
                            type="button"
                            aria-label={`ดูรายละเอียด ${k.code}`}
                            title="ดูรายละเอียด"
                            onClick={(e) => {
                              e.stopPropagation();
                              openDetail(k);
                            }}
                            className="rounded p-1 text-brand-700 hover:bg-brand-100 focus-visible:outline-2 focus-visible:outline-brand-600 dark:text-brand-300 dark:hover:bg-brand-900/50"
                          >
                            <Maximize2 aria-hidden="true" className="h-3.5 w-3.5" />
                          </button>
                        </span>
                      </td>
                      <td className={`${tdClass} font-semibold`}>{k.name}</td>
                      <td className={tdClass}>
                        {is69 ? (
                          <span className="whitespace-nowrap">{k.groupShort}</span>
                        ) : (
                          <>
                            <span className="block font-semibold">{k.groupShort}</span>
                            <span className={`block ${mutedClass}`}>{k.objective}</span>
                          </>
                        )}
                      </td>
                      <td className={tdClass}>{fmtTarget(k.target, k.q)}</td>
                      {k.q.map((v, i) => (
                        <td key={i} className={`${tdRightClass} ${i === 3 ? "font-bold" : ""}`}>
                          {fmtCell(v)}
                        </td>
                      ))}
                      <td className={`${tdClass} text-center`}><StatusBadge status={k.status} /></td>
                      <td className={tdClass}>{k.owner}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <KpiDetailDialog kpi={detail} year={filters.year} onClose={() => setDetail(null)} />
    </div>
  );
}
