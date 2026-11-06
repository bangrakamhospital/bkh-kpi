"use client";

import { useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  CalendarCheck,
  CheckCircle2,
  ChevronRight,
  Download,
  FileSpreadsheet,
  Home,
  Inbox,
  Info,
  ListFilter,
  MapPin,
  Percent,
  RotateCcw,
  Search,
  UserCheck,
  UserX,
  Users,
  X,
  XCircle,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type {
  ScreeningCode,
  ScreeningPerson,
  VillageBreakdown,
} from "@/lib/kpi/types";
import { ACCENTS, type AccentKey } from "./indicator-theme";
import { InfoPopover } from "./InfoPopover";
import { ProgressBar } from "./ProgressBar";
import { formatNumber, formatPercent, formatThaiDate } from "./format";
import { useApiList } from "./useApi";

interface Props {
  code: ScreeningCode;
  accent: AccentKey;
  title: string;
  fiscalYear: number;
  targetPercent: number;
  periodLabel: string;
  denominatorFactor: number;
  statusLabels: StatusLabels;
  titleId: string;
  onClose: () => void;
}

interface StatusLabels {
  screened: string;
  notScreened: string;
}

const btnClass =
  "inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 bg-surface px-3 py-1.5 text-sm font-medium hover:bg-brand-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 dark:border-zinc-700 dark:hover:bg-brand-900/40";
const excelClass =
  "inline-flex items-center gap-1.5 rounded-lg bg-green-700 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-green-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-700 dark:bg-green-600 dark:hover:bg-green-500";
const th = "px-3 py-2 text-sm font-semibold";
const td = "px-3 py-2";
const iconCls = "h-4 w-4 shrink-0";

type Level = "pass" | "near" | "low";

/** เขียว = ผ่านเกณฑ์, ส้ม = 70 ถึงต่ำกว่าเกณฑ์, แดง = ต่ำกว่า 70 */
function levelOf(percent: number, target: number): Level {
  if (percent >= target) return "pass";
  return percent >= 70 ? "near" : "low";
}

const LEVELS: Record<
  Level,
  { label: string; Icon: LucideIcon; bar: string; chip: string }
> = {
  pass: {
    label: "ผ่านเกณฑ์",
    Icon: CheckCircle2,
    bar: "bg-green-600 dark:bg-green-400",
    chip: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300",
  },
  near: {
    label: "ใกล้เกณฑ์",
    Icon: AlertTriangle,
    bar: "bg-orange-500 dark:bg-orange-400",
    chip: "bg-orange-100 text-orange-900 dark:bg-orange-950 dark:text-orange-300",
  },
  low: {
    label: "ต่ำกว่าเกณฑ์",
    Icon: XCircle,
    bar: "bg-red-600 dark:bg-red-400",
    chip: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
  },
};

function StateBox({
  Icon,
  tone,
  children,
}: {
  Icon: LucideIcon;
  tone: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 p-6 text-center">
      <span
        className={`flex h-14 w-14 items-center justify-center rounded-full ${tone}`}
      >
        <Icon aria-hidden="true" className="h-8 w-8" />
      </span>
      {children}
    </div>
  );
}

function Status({
  loading,
  error,
  empty,
  onRetry,
}: {
  loading: boolean;
  error: boolean;
  empty: boolean;
  onRetry: () => void;
}) {
  if (loading) {
    return (
      <div role="status" className="animate-pulse space-y-2 p-4">
        <span className="sr-only">กำลังโหลดข้อมูล...</span>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className="h-10 rounded-lg bg-brand-100 dark:bg-brand-900/40"
          />
        ))}
      </div>
    );
  }
  if (error) {
    return (
      <div role="alert">
        <StateBox
          Icon={AlertTriangle}
          tone="bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
        >
          <p className="font-semibold text-red-800 dark:text-red-300">
            ไม่สามารถดึงข้อมูลได้
          </p>
          <button type="button" onClick={onRetry} className={btnClass}>
            <RotateCcw aria-hidden="true" className={iconCls} />
            ลองใหม่
          </button>
        </StateBox>
      </div>
    );
  }
  if (empty) {
    return (
      <StateBox
        Icon={Inbox}
        tone="bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
      >
        <p className="text-zinc-700 dark:text-zinc-300">ไม่พบข้อมูล</p>
      </StateBox>
    );
  }
  return null;
}

function StatCard({
  Icon,
  tone,
  label,
  value,
}: {
  Icon: LucideIcon;
  tone: string;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-surface p-3 shadow-sm dark:border-zinc-800">
      <span
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${tone}`}
      >
        <Icon aria-hidden="true" className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">{label}</p>
        <p className="text-base font-bold leading-6 tabular-nums">{value}</p>
      </div>
    </div>
  );
}

function StatRow({
  accent,
  target,
  screened,
  unscreened,
  percent,
  targetLabel = "กลุ่มเป้าหมาย",
  percentLabel = "ร้อยละ",
}: {
  accent: AccentKey;
  target: number;
  screened: number;
  unscreened: number;
  percent: number;
  targetLabel?: string;
  percentLabel?: string;
}) {
  const theme = ACCENTS[accent];
  return (
    <div
      className={`grid grid-cols-2 gap-2 border-b border-zinc-200 p-3 sm:grid-cols-4 dark:border-zinc-800 ${theme.soft}`}
    >
      <StatCard
        Icon={Users}
        tone={theme.iconBg}
        label={targetLabel}
        value={formatNumber(target)}
      />
      <StatCard
        Icon={CheckCircle2}
        tone="bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300"
        label="คัดกรองแล้ว"
        value={formatNumber(screened)}
      />
      <StatCard
        Icon={UserX}
        tone="bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300"
        label="ยังไม่คัดกรอง"
        value={formatNumber(Math.max(0, unscreened))}
      />
      <StatCard
        Icon={Percent}
        tone="bg-brand-100 text-brand-800 dark:bg-brand-900 dark:text-brand-200"
        label={percentLabel}
        value={`${formatPercent(percent)}%`}
      />
    </div>
  );
}

function pct(n: number, d: number): number {
  return d > 0 ? Math.round((n / d) * 10000) / 100 : 0;
}

export function VillageDialogContent({
  code,
  accent,
  title,
  fiscalYear,
  targetPercent,
  periodLabel,
  denominatorFactor,
  statusLabels,
  titleId,
  onClose,
}: Props) {
  const [village, setVillage] = useState<VillageBreakdown | null>(null);
  const base = `code=${code}&fy=${fiscalYear}`;
  const theme = ACCENTS[accent];

  return (
    <div className="flex min-h-0 w-full flex-col">
      <header
        className={`flex items-start gap-3 bg-linear-to-r ${theme.band} p-3 text-white`}
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/20">
          <theme.Icon aria-hidden="true" className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id={titleId} className="text-base font-bold leading-6">
            {title}
          </h2>
          <p className="text-sm text-white/90">
            ปีงบประมาณ {fiscalYear}
            {periodLabel !== `ปีงบประมาณ ${fiscalYear}` && ` · ${periodLabel}`}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="ปิด"
          title="ปิด"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/15 hover:bg-white/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          <X aria-hidden="true" className="h-4 w-4" />
        </button>
      </header>
      {village ? (
        <PersonsView
          key={village.villageId}
          base={base}
          accent={accent}
          title={title}
          statusLabels={statusLabels}
          denominatorFactor={denominatorFactor}
          village={village}
          onBack={() => setVillage(null)}
        />
      ) : (
        <VillagesView
          base={base}
          accent={accent}
          targetPercent={targetPercent}
          denominatorFactor={denominatorFactor}
          onSelect={setVillage}
        />
      )}
    </div>
  );
}

function VillagesView({
  base,
  accent,
  targetPercent,
  denominatorFactor,
  onSelect,
}: {
  base: string;
  accent: AccentKey;
  targetPercent: number;
  denominatorFactor: number;
  onSelect: (v: VillageBreakdown) => void;
}) {
  const { loading, error, data, retry } = useApiList<VillageBreakdown>(
    `/api/kpi/screening/villages?${base}`,
  );
  const rows = data ?? [];
  const totalD = rows.reduce((s, r) => s + r.denominator, 0);
  const totalN = rows.reduce((s, r) => s + r.numerator, 0);
  const totalP = pct(totalN, totalD);
  const totalE = rows.reduce((s, r) => s + r.eligible, 0);
  const showEligible = denominatorFactor !== 1;
  const theme = ACCENTS[accent];

  return (
    <>
      {rows.length > 0 && (
        <StatRow
          accent={accent}
          target={totalD}
          screened={totalN}
          unscreened={(showEligible ? totalE : totalD) - totalN}
          percent={totalP}
          targetLabel={showEligible ? "เป้าหมาย" : "กลุ่มเป้าหมาย"}
        />
      )}
      <div
        className={`flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200 p-3 dark:border-zinc-800 ${theme.soft}`}
      >
        <p className="inline-flex items-center gap-1.5 text-xs text-zinc-700 dark:text-zinc-300">
          <Info aria-hidden="true" className={iconCls} />
          เกณฑ์ ≥ {formatNumber(targetPercent)}%
        </p>
        <a
          href={`/api/kpi/screening/export?${base}`}
          download
          className={excelClass}
        >
          <FileSpreadsheet aria-hidden="true" className={iconCls} />
          Export Excel
          <Download aria-hidden="true" className={iconCls} />
        </a>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <Status
          loading={loading}
          error={error}
          empty={!loading && !error && rows.length === 0}
          onRetry={retry}
        />
        {rows.length > 0 && (
          <table className="w-full min-w-[46rem] text-xs">
            <thead className={`sticky top-0 z-10 text-left ${theme.thead}`}>
              <tr>
                <th scope="col" className={th}>หมู่</th>
                <th scope="col" className={th}>ชื่อหมู่บ้าน</th>
                {showEligible && (
                  <th scope="col" className={`${th} text-right`}>
                    กลุ่มเป้าหมายทั้งหมด
                  </th>
                )}
                <th scope="col" className={`${th} text-right`}>เป้าหมาย</th>
                <th scope="col" className={`${th} text-right`}>ผลงาน</th>
                <th scope="col" className={th}>ร้อยละ</th>
                <th scope="col" className={`${th} text-center`}>รายชื่อ</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const level = levelOf(r.percent, targetPercent);
                const L = LEVELS[level];
                return (
                  <tr
                    key={r.villageId}
                    className={`border-t border-zinc-200 dark:border-zinc-800 ${
                      level === "low"
                        ? "bg-red-50 hover:bg-red-100 dark:bg-red-950/40 dark:hover:bg-red-950/60"
                        : `odd:bg-surface even:bg-zinc-50 dark:even:bg-zinc-900/60 ${theme.rowHover}`
                    }`}
                  >
                    <td className={td}>
                      <span
                        className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${theme.badge}`}
                      >
                        {r.moo}
                      </span>
                    </td>
                    <td className={td}>
                      <span className="inline-flex items-center gap-1.5">
                        {r.villageId > 0 ? (
                          <Home
                            aria-hidden="true"
                            className={`${iconCls} ${theme.text}`}
                          />
                        ) : (
                          <MapPin
                            aria-hidden="true"
                            className={`${iconCls} text-zinc-500`}
                          />
                        )}
                        {r.villageName}
                      </span>
                    </td>
                    {showEligible && (
                      <td className={`${td} text-right tabular-nums`}>
                        {formatNumber(r.eligible)}
                      </td>
                    )}
                    <td className={`${td} text-right tabular-nums`}>
                      {formatNumber(r.denominator)}
                    </td>
                    <td className={`${td} text-right tabular-nums`}>
                      {formatNumber(r.numerator)}
                    </td>
                    <td className={td}>
                      <div className="flex items-center gap-2">
                        <span className="w-14 text-right font-semibold tabular-nums">
                          {formatPercent(r.percent)}
                        </span>
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${L.chip}`}
                        >
                          <L.Icon aria-hidden="true" className="h-3.5 w-3.5" />
                          {L.label}
                        </span>
                      </div>
                      <div className="mt-1">
                        <ProgressBar
                          percent={r.percent}
                          targetPercent={targetPercent}
                          barClass={L.bar}
                          label={`ร้อยละหมู่ ${r.moo}`}
                        />
                      </div>
                    </td>
                    <td className={`${td} text-center`}>
                      {r.villageId > 0 ? (
                        <button
                          type="button"
                          onClick={() => onSelect(r)}
                          className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 ${theme.pill}`}
                        >
                          <Users aria-hidden="true" className={iconCls} />
                          รายชื่อ
                          <ChevronRight aria-hidden="true" className={iconCls} />
                        </button>
                      ) : (
                        <InfoPopover
                          label="รายละเอียดเพิ่มเติม ไม่ระบุหมู่บ้าน"
                          title="ไม่ระบุหมู่บ้าน"
                          items={[
                            {
                              icon: <FileSpreadsheet size={14} />,
                              label: "ดูรายชื่อ",
                              value: "ดูได้ในไฟล์ Excel ทั้งปีงบฯ",
                            },
                          ]}
                        />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className={`font-bold ${theme.footer}`}>
              <tr>
                <td className={td} colSpan={2}>
                  รวม
                </td>
                {showEligible && (
                  <td className={`${td} text-right tabular-nums`}>
                    {formatNumber(totalE)}
                  </td>
                )}
                <td className={`${td} text-right tabular-nums`}>
                  {formatNumber(totalD)}
                </td>
                <td className={`${td} text-right tabular-nums`}>
                  {formatNumber(totalN)}
                </td>
                <td className={`${td} tabular-nums`}>
                  <span className="inline-block w-14 text-right">
                    {formatPercent(totalP)}
                  </span>
                </td>
                <td className={td} />
              </tr>
            </tfoot>
          </table>
        )}
      </div>
    </>
  );
}

type Filter = "all" | "pending" | "done";

const FILTERS: {
  value: Filter;
  label: string;
  Icon: LucideIcon;
  icon: string;
  active: string;
}[] = [
  {
    value: "all",
    label: "ทั้งหมด",
    Icon: ListFilter,
    icon: "text-brand-700 dark:text-brand-300",
    active: "bg-brand-700 text-white dark:bg-brand-400 dark:text-brand-950",
  },
  {
    value: "pending",
    label: "ยังไม่คัดกรอง",
    Icon: UserX,
    icon: "text-red-700 dark:text-red-300",
    active: "bg-red-700 text-white dark:bg-red-400 dark:text-red-950",
  },
  {
    value: "done",
    label: "คัดกรองแล้ว",
    Icon: UserCheck,
    icon: "text-green-700 dark:text-green-300",
    active: "bg-green-700 text-white dark:bg-green-400 dark:text-green-950",
  },
];

const SEX_STYLE: Record<ScreeningPerson["sex"], { letter: string; cls: string }> =
  {
    ชาย: {
      letter: "ช",
      cls: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
    },
    หญิง: {
      letter: "ญ",
      cls: "bg-pink-100 text-pink-800 dark:bg-pink-950 dark:text-pink-300",
    },
    ไม่ระบุ: {
      letter: "-",
      cls: "bg-zinc-200 text-zinc-800 dark:bg-zinc-700 dark:text-zinc-200",
    },
  };

function filterLabel(
  value: Filter,
  fallback: string,
  labels: StatusLabels,
): string {
  if (value === "done") return labels.screened;
  if (value === "pending") return labels.notScreened;
  return fallback;
}

function PersonsView({
  base,
  accent,
  title,
  statusLabels,
  denominatorFactor,
  village,
  onBack,
}: {
  base: string;
  accent: AccentKey;
  title: string;
  statusLabels: StatusLabels;
  denominatorFactor: number;
  village: VillageBreakdown;
  onBack: () => void;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const { loading, error, truncated, data, retry } = useApiList<ScreeningPerson>(
    `/api/kpi/screening/persons?${base}&village=${village.villageId}`,
  );
  const theme = ACCENTS[accent];

  const all = data ?? [];
  const doneCount = all.filter((p) => p.screened).length;
  const counts: Record<Filter, number> = {
    all: all.length,
    done: doneCount,
    pending: all.length - doneCount,
  };

  const q = query.trim().toLowerCase();
  const rows = all.filter((p) => {
    if (filter === "done" && !p.screened) return false;
    if (filter === "pending" && p.screened) return false;
    if (!q) return true;
    return (
      p.fullName.toLowerCase().includes(q) ||
      (p.hn ?? "").toLowerCase().includes(q)
    );
  });

  return (
    <>
      <nav
        aria-label="ตำแหน่งปัจจุบัน"
        className={`flex flex-wrap items-center gap-1.5 border-b border-zinc-200 px-3 py-2 text-sm dark:border-zinc-800 ${theme.soft}`}
      >
        <button
          type="button"
          onClick={onBack}
          className={`inline-flex items-center gap-1 rounded font-medium underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-brand-600 ${theme.text}`}
        >
          <theme.Icon aria-hidden="true" className={iconCls} />
          <span className="max-w-60 truncate">{title}</span>
        </button>
        <ChevronRight
          aria-hidden="true"
          className="h-4 w-4 text-zinc-500"
        />
        <span
          aria-current="page"
          className="inline-flex items-center gap-1 font-semibold"
        >
          <MapPin aria-hidden="true" className={`${iconCls} ${theme.text}`} />
          หมู่ {village.moo} {village.villageName}
        </span>
      </nav>
      {!loading && !error && all.length > 0 && (
        <StatRow
          accent={accent}
          target={all.length}
          screened={doneCount}
          unscreened={all.length - doneCount}
          percent={pct(doneCount, all.length)}
          percentLabel={
            denominatorFactor !== 1 ? "ร้อยละของกลุ่มเป้าหมาย" : "ร้อยละ"
          }
        />
      )}
      <div className="flex flex-wrap items-center gap-2 border-b border-zinc-200 p-3 dark:border-zinc-800">
        <button type="button" onClick={onBack} className={btnClass}>
          <ArrowLeft aria-hidden="true" className={iconCls} />
          กลับไปรายหมู่บ้าน
        </button>
        <div className="relative min-w-40 flex-1">
          <label className="sr-only" htmlFor="person-search">
            ค้นหาชื่อหรือ HN
          </label>
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500"
          />
          <input
            id="person-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ค้นหาชื่อ / HN"
            className={`w-full rounded-lg border border-zinc-300 bg-surface py-1.5 pl-8 pr-3 text-sm dark:border-zinc-700 ${theme.focus}`}
          />
        </div>
        <div
          role="group"
          aria-label="กรองสถานะการคัดกรอง"
          className="inline-flex overflow-hidden rounded-lg border border-zinc-300 dark:border-zinc-700"
        >
          {FILTERS.map((f) => {
            const on = filter === f.value;
            return (
              <button
                key={f.value}
                type="button"
                aria-pressed={on}
                onClick={() => setFilter(f.value)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-600 ${
                  on ? f.active : "bg-surface hover:bg-zinc-100 dark:hover:bg-zinc-800"
                }`}
              >
                <f.Icon
                  aria-hidden="true"
                  className={`${iconCls} ${on ? "" : f.icon}`}
                />
                {filterLabel(f.value, f.label, statusLabels)} ({formatNumber(counts[f.value])})
              </button>
            );
          })}
        </div>
        <a
          href={`/api/kpi/screening/export?${base}&village=${village.villageId}`}
          download
          className={excelClass}
        >
          <FileSpreadsheet aria-hidden="true" className={iconCls} />
          Export Excel
          <Download aria-hidden="true" className={iconCls} />
        </a>
      </div>
      {truncated && (
        <p
          role="status"
          className="flex items-center gap-2 border-b border-amber-300 bg-amber-100 px-3 py-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200"
        >
          <Info aria-hidden="true" className={iconCls} />
          แสดงเพียง 5,000 รายการแรก — ดาวน์โหลด Excel เพื่อดูทั้งหมด
        </p>
      )}
      <div className="min-h-0 flex-1 overflow-auto">
        <Status
          loading={loading}
          error={error}
          empty={!loading && !error && rows.length === 0}
          onRetry={retry}
        />
        {rows.length > 0 && (
          <table className="w-full min-w-[46rem] text-xs">
            <thead className={`sticky top-0 z-10 text-left ${theme.thead}`}>
              <tr>
                <th scope="col" className={th}>ลำดับ</th>
                <th scope="col" className={th}>HN</th>
                <th scope="col" className={th}>ชื่อ-สกุล</th>
                <th scope="col" className={th}>เพศ</th>
                <th scope="col" className={`${th} text-right`}>อายุ</th>
                <th scope="col" className={th}>สถานะ</th>
                <th scope="col" className={th}>
                  {denominatorFactor !== 1
                    ? "วันที่คัดกรอง (ใน Phase)"
                    : "วันที่คัดกรอง"}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p, i) => {
                const sex = SEX_STYLE[p.sex];
                return (
                  <tr
                    key={p.personId}
                    className={`border-t border-zinc-200 dark:border-zinc-800 ${
                      p.screened
                        ? `odd:bg-surface even:bg-zinc-50 dark:even:bg-zinc-900/60 ${theme.rowHover}`
                        : "bg-red-50/70 hover:bg-red-100/70 dark:bg-red-950/30 dark:hover:bg-red-950/50"
                    }`}
                  >
                    <td
                      className={`${td} border-l-4 tabular-nums ${
                        p.screened ? "border-transparent" : "border-red-500"
                      }`}
                    >
                      {formatNumber(i + 1)}
                    </td>
                    <td className={td}>{p.hn ?? "—"}</td>
                    <td className={`${td} font-medium`}>{p.fullName}</td>
                    <td className={td}>
                      <span className="inline-flex items-center gap-1.5">
                        <span
                          aria-hidden="true"
                          className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${sex.cls}`}
                        >
                          {sex.letter}
                        </span>
                        {p.sex}
                      </span>
                    </td>
                    <td className={`${td} text-right tabular-nums`}>
                      {formatNumber(p.age)}
                    </td>
                    <td className={td}>
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${
                          p.screened
                            ? "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300"
                            : "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300"
                        }`}
                      >
                        {p.screened ? (
                          <CheckCircle2
                            aria-hidden="true"
                            className="h-3.5 w-3.5"
                          />
                        ) : (
                          <XCircle aria-hidden="true" className="h-3.5 w-3.5" />
                        )}
                        {p.screened ? statusLabels.screened : statusLabels.notScreened}
                      </span>
                    </td>
                    <td className={td}>
                      {p.screenDate ? (
                        <span className="inline-flex items-center gap-1.5">
                          <CalendarCheck
                            aria-hidden="true"
                            className={`${iconCls} text-green-700 dark:text-green-300`}
                          />
                          {formatThaiDate(p.screenDate)}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      {rows.length > 0 && (
        <footer
          className={`flex flex-wrap items-center justify-between gap-2 border-t border-zinc-200 px-3 py-2 text-xs dark:border-zinc-800 ${theme.soft}`}
        >
          <span className="text-zinc-700 dark:text-zinc-300">
            แสดง {formatNumber(rows.length)} จาก {formatNumber(all.length)} รายการ
          </span>
        </footer>
      )}
    </>
  );
}
