"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Info,
  ListFilter,
  Loader2,
  Lock,
  RotateCcw,
  Search,
  UserCheck,
  UserX,
  Users,
  X,
  XCircle,
} from "lucide-react";
import type {
  DistrictCode,
  DistrictPerson,
  DistrictPersonsResponse,
} from "@/lib/kpi/types";
import {
  SCREENING_INDICATORS,
  type ScreeningStatusLabels,
} from "@/lib/kpi/screening-indicators";
import { ACCENTS } from "./indicator-theme";
import { DISTRICT_ACCENT, isLabIndicator } from "./district-codes";
import { formatNumber, formatThaiDate } from "./format";

export type DistrictPersonsScope =
  | { kind: "village"; vid: string }
  | { kind: "tambon"; tambonCode: string };

interface ButtonProps {
  code: DistrictCode;
  fiscalYear: number;
  scope: DistrictPersonsScope;
  /** Short heading of the area, e.g. "ต.ศิลา หมู่ 3" . */
  areaLabel: string;
  /** Button text, e.g. "รายชื่อ" or "รายชื่อทั้งตำบล". */
  buttonLabel?: string;
}

const iconCls = "h-4 w-4 shrink-0";
const th = "px-3 py-2 text-xs font-semibold";
const td = "px-3 py-2";
const btnClass =
  "inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 bg-surface px-3 py-1.5 text-sm font-medium hover:bg-brand-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 dark:border-zinc-700 dark:hover:bg-brand-900/40";
const excelClass =
  "inline-flex items-center gap-1.5 rounded-lg bg-green-700 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-green-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-700 disabled:opacity-60 dark:bg-green-600 dark:hover:bg-green-500";

/** Same wording as the hospital page; CX drops the hospital "Phase" suffix. */
function statusLabelsOf(code: DistrictCode): ScreeningStatusLabels {
  if (code === "CX") {
    return { screened: "คัดกรองแล้ว", notScreened: "ยังไม่คัดกรอง" };
  }
  return SCREENING_INDICATORS[code].statusLabels;
}

function dateHeaderOf(code: DistrictCode): string {
  if (isLabIndicator(code)) return "วันที่ตรวจ";
  if (code === "DMC" || code === "HTC") return "วันที่ยืนยัน";
  return "วันที่คัดกรอง";
}

function queryOf(code: DistrictCode, fy: number, scope: DistrictPersonsScope) {
  const base = `code=${code}&fy=${fy}`;
  return scope.kind === "village"
    ? `${base}&vid=${scope.vid}`
    : `${base}&tambon=${scope.tambonCode}`;
}

function filenameFrom(header: string | null): string {
  const m = header?.match(/filename="([A-Za-z0-9._-]{1,100})"/);
  return m ? m[1] : "district-persons.xlsx";
}

function saveBlob(blob: Blob, filename: string) {
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 10_000);
}

function currentLocation(): string {
  return `${window.location.pathname}${window.location.search}`;
}

export function DistrictPersonsButton({
  code,
  fiscalYear,
  scope,
  areaLabel,
  buttonLabel = "รายชื่อ",
}: ButtonProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const titleId = `dpd-title-${code}-${scope.kind === "village" ? scope.vid : scope.tambonCode}`;
  const theme = ACCENTS[DISTRICT_ACCENT[code]];

  function openDialog() {
    setOpen(true);
    if (!dialogRef.current?.open) dialogRef.current?.showModal();
  }

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        aria-label={`${buttonLabel} ${areaLabel}`}
        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 ${theme.pill}`}
      >
        <Users aria-hidden="true" className={iconCls} />
        {buttonLabel}
      </button>
      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        onClose={() => setOpen(false)}
        onClick={(e) => {
          if (e.target === e.currentTarget) e.currentTarget.close();
        }}
        className="m-0 h-dvh max-h-none w-screen max-w-none overflow-hidden bg-surface p-0 text-left text-foreground backdrop:bg-black/50 backdrop:backdrop-blur-sm open:flex sm:m-auto sm:h-[85vh] sm:w-full sm:max-w-5xl sm:rounded-xl"
      >
        {open && (
          <PersonsDialogContent
            code={code}
            fiscalYear={fiscalYear}
            scope={scope}
            areaLabel={areaLabel}
            titleId={titleId}
            onClose={() => dialogRef.current?.close()}
          />
        )}
      </dialog>
    </>
  );
}

type LoadState =
  | { kind: "loading" }
  | { kind: "unauthorized" }
  | { kind: "error"; message: string }
  | { kind: "ok"; data: DistrictPersonsResponse };

type Filter = "all" | "pending" | "done";

const SEX_STYLE: Record<DistrictPerson["sex"], { letter: string; cls: string }> =
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

function compareMoo(a: string, b: string): number {
  const na = Number(a);
  const nb = Number(b);
  const fa = Number.isFinite(na);
  const fb = Number.isFinite(nb);
  if (fa && fb && na !== nb) return na - nb;
  if (fa !== fb) return fa ? -1 : 1;
  return a.localeCompare(b, "th");
}

function PersonsDialogContent(props: {
  code: DistrictCode;
  fiscalYear: number;
  scope: DistrictPersonsScope;
  areaLabel: string;
  titleId: string;
  onClose: () => void;
}) {
  // Remount on retry (keeps fetching inside an effect callback only).
  const [attempt, setAttempt] = useState(0);
  return (
    <PersonsBody
      key={attempt}
      {...props}
      onRetry={() => setAttempt((n) => n + 1)}
    />
  );
}

function PersonsBody({
  code,
  fiscalYear,
  scope,
  areaLabel,
  titleId,
  onClose,
  onRetry,
}: {
  code: DistrictCode;
  fiscalYear: number;
  scope: DistrictPersonsScope;
  areaLabel: string;
  titleId: string;
  onClose: () => void;
  onRetry: () => void;
}) {
  const theme = ACCENTS[DISTRICT_ACCENT[code]];
  const labels = statusLabelsOf(code);
  const query = queryOf(code, fiscalYear, scope);
  const indicatorName = SCREENING_INDICATORS[code].name;

  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [loginHref, setLoginHref] = useState<string | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    fetch(`/api/kpi/district/persons?${query}`, {
      cache: "no-store",
      signal: ctrl.signal,
    })
      .then(async (res) => {
        if (res.status === 401) {
          setLoginHref(
            `/login?callbackUrl=${encodeURIComponent(currentLocation())}`,
          );
          return setState({ kind: "unauthorized" });
        }
        const body: unknown = await res.json().catch(() => null);
        if (!res.ok) {
          const apiMessage =
            body && typeof body === "object" && "error" in body
              ? String((body as { error: unknown }).error)
              : null;
          const message =
            res.status === 404
              ? "ไม่พบรายชื่อของพื้นที่นี้"
              : (apiMessage ?? "ไม่สามารถดึงรายชื่อได้ กรุณาลองใหม่");
          return setState({ kind: "error", message });
        }
        setState({ kind: "ok", data: body as DistrictPersonsResponse });
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setState({ kind: "error", message: "ไม่สามารถดึงรายชื่อได้ กรุณาลองใหม่" });
      });
    return () => ctrl.abort();
  }, [query]);

  const all = useMemo(() => {
    if (state.kind !== "ok") return [];
    return [...state.data.persons].sort(
      (a, b) =>
        compareMoo(a.moo, b.moo) || a.fullName.localeCompare(b.fullName, "th"),
    );
  }, [state]);

  const doneCount = all.filter((p) => p.screened).length;
  const counts: Record<Filter, number> = {
    all: all.length,
    done: doneCount,
    pending: all.length - doneCount,
  };
  const q = search.trim().toLowerCase();
  const rows = all.filter((p) => {
    if (filter === "done" && !p.screened) return false;
    if (filter === "pending" && p.screened) return false;
    return !q || p.fullName.toLowerCase().includes(q);
  });
  const showSuspect = code === "DMC" || code === "HTC";
  const showMoo = scope.kind === "tambon";

  async function downloadExport() {
    setExporting(true);
    setExportError(null);
    try {
      const res = await fetch(`/api/kpi/district/export?${query}`, {
        cache: "no-store",
      });
      if (res.status === 401) {
        setLoginHref(
          `/login?callbackUrl=${encodeURIComponent(currentLocation())}`,
        );
        setState({ kind: "unauthorized" });
        return;
      }
      if (!res.ok) {
        setExportError("ไม่สามารถดาวน์โหลดไฟล์ได้");
        return;
      }
      const blob = await res.blob();
      saveBlob(blob, filenameFrom(res.headers.get("Content-Disposition")));
    } catch {
      setExportError("ไม่สามารถดาวน์โหลดไฟล์ได้");
    } finally {
      setExporting(false);
    }
  }

  const filters: {
    value: Filter;
    label: string;
    Icon: typeof ListFilter;
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
      label: labels.notScreened,
      Icon: UserX,
      icon: "text-red-700 dark:text-red-300",
      active: "bg-red-700 text-white dark:bg-red-400 dark:text-red-950",
    },
    {
      value: "done",
      label: labels.screened,
      Icon: UserCheck,
      icon: "text-green-700 dark:text-green-300",
      active: "bg-green-700 text-white dark:bg-green-400 dark:text-green-950",
    },
  ];

  let body: React.ReactNode;
  if (state.kind === "loading") {
    body = (
      <div role="status" className="animate-pulse space-y-2 p-4">
        <span className="sr-only">กำลังโหลดรายชื่อ...</span>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className="h-10 rounded-lg bg-brand-100 dark:bg-brand-900/40"
          />
        ))}
      </div>
    );
  } else if (state.kind === "unauthorized") {
    body = (
      <div className="flex flex-col items-center gap-3 p-6 text-center">
        <Lock aria-hidden="true" className="h-8 w-8 text-zinc-500" />
        <p className="max-w-sm text-sm">
          รายชื่อมีข้อมูลระบุตัวบุคคล ต้องเข้าสู่ระบบก่อนจึงจะดูได้
          (หรือการเข้าสู่ระบบหมดอายุ)
        </p>
        <Link
          href={loginHref ?? "/login"}
          className={`rounded-full px-4 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 ${theme.pill}`}
        >
          เข้าสู่ระบบ
        </Link>
      </div>
    );
  } else if (state.kind === "error") {
    body = (
      <div
        role="alert"
        className="flex flex-col items-center gap-3 p-6 text-center"
      >
        <AlertTriangle
          aria-hidden="true"
          className="h-8 w-8 text-amber-700 dark:text-amber-300"
        />
        <p className="text-sm font-semibold text-red-800 dark:text-red-300">
          {state.message}
        </p>
        <button type="button" onClick={onRetry} className={btnClass}>
          <RotateCcw aria-hidden="true" className={iconCls} />
          ลองใหม่
        </button>
      </div>
    );
  } else if (rows.length === 0) {
    body = (
      <p className="p-6 text-center text-sm text-zinc-700 dark:text-zinc-300">
        ไม่พบรายชื่อ
      </p>
    );
  } else {
    body = (
      <table
        className={`w-full text-left text-xs ${showSuspect ? "min-w-[64rem]" : "min-w-[56rem]"}`}
      >
        <thead className={`sticky top-0 z-10 ${theme.thead}`}>
          <tr>
            <th scope="col" className={th}>ลำดับ</th>
            <th scope="col" className={th}>ชื่อ-สกุล</th>
            <th scope="col" className={th}>เพศ</th>
            <th scope="col" className={`${th} text-right`}>อายุ</th>
            <th scope="col" className={th}>หมู่</th>
            <th scope="col" className={th}>หน่วยรับผิดชอบ</th>
            <th scope="col" className={th}>สถานะ</th>
            {showSuspect && (
              <th scope="col" className={th}>วันที่พบกลุ่มสงสัย</th>
            )}
            <th scope="col" className={th}>
              {dateHeaderOf(code)} / หน่วยที่ให้บริการ
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p, i) => {
            const sex = SEX_STYLE[p.sex];
            return (
              <tr
                key={p.key}
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
                <td className={td}>{p.moo}</td>
                <td className={td}>{p.unitName}</td>
                <td className={td}>
                  <span
                    className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${
                      p.screened
                        ? "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300"
                        : "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300"
                    }`}
                  >
                    {p.screened ? (
                      <CheckCircle2 aria-hidden="true" className="h-3.5 w-3.5" />
                    ) : (
                      <XCircle aria-hidden="true" className="h-3.5 w-3.5" />
                    )}
                    {p.screened ? labels.screened : labels.notScreened}
                  </span>
                </td>
                {showSuspect && (
                  <td className={td}>
                    {p.suspectDate ? formatThaiDate(p.suspectDate) : "—"}
                  </td>
                )}
                <td className={td}>
                  {p.screenDate ? (
                    <>
                      <span className="block">{formatThaiDate(p.screenDate)}</span>
                      {p.screenUnitName && (
                        <span className="block text-zinc-600 dark:text-zinc-400">
                          {p.screenUnitName}
                        </span>
                      )}
                    </>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    );
  }

  const ready = state.kind === "ok";

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
            รายชื่อ {areaLabel}
          </h2>
          <p className="text-sm text-white/90">
            {indicatorName} · ปีงบประมาณ {fiscalYear}
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

      {ready && (
        <div
          className={`flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-zinc-200 px-3 py-2 text-xs text-zinc-700 dark:border-zinc-800 dark:text-zinc-300 ${theme.soft}`}
        >
          <span className="inline-flex items-center gap-1.5">
            <Info aria-hidden="true" className={iconCls} />
            ข้อมูล ณ วันที่{" "}
            {state.data.dataAsOf ? formatThaiDate(state.data.dataAsOf) : "—"}
          </span>
          <span>
            ข้อมูล HDC ล่าช้า คนที่เพิ่งคัดกรองอาจยังแสดงว่ายังไม่ได้คัดกรอง
          </span>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 border-b border-zinc-200 p-3 dark:border-zinc-800">
        <div className="relative min-w-40 flex-1">
          <label className="sr-only" htmlFor="district-person-search">
            ค้นหาชื่อ
          </label>
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500"
          />
          <input
            id="district-person-search"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ค้นหาชื่อ"
            className={`w-full rounded-lg border border-zinc-300 bg-surface py-1.5 pl-8 pr-3 text-sm dark:border-zinc-700 ${theme.focus}`}
          />
        </div>
        <div
          role="group"
          aria-label="กรองสถานะ"
          className="inline-flex max-w-full flex-wrap overflow-hidden rounded-lg border border-zinc-300 dark:border-zinc-700"
        >
          {filters.map((f) => {
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
                {f.label} ({formatNumber(counts[f.value])})
              </button>
            );
          })}
        </div>
        <span className="inline-flex flex-col items-end gap-1">
          <button
            type="button"
            onClick={() => void downloadExport()}
            disabled={exporting || state.kind === "loading"}
            className={excelClass}
          >
            <FileSpreadsheet aria-hidden="true" className={iconCls} />
            ส่งออก Excel
            {exporting ? (
              <Loader2 aria-hidden="true" className={`${iconCls} animate-spin`} />
            ) : (
              <Download aria-hidden="true" className={iconCls} />
            )}
          </button>
          {exportError && (
            <span role="alert" className="text-xs text-red-800 dark:text-red-300">
              {exportError}
            </span>
          )}
        </span>
      </div>

      {ready && state.data.truncated && (
        <p
          role="status"
          className="flex items-center gap-2 border-b border-amber-300 bg-amber-100 px-3 py-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200"
        >
          <Info aria-hidden="true" className={iconCls} />
          แสดงรายชื่อไม่ครบ — กด &quot;ส่งออก Excel&quot; เพื่อดูทั้งหมด
        </p>
      )}

      <div className="min-h-0 flex-1 overflow-auto">
        {body}
      </div>

      {ready && rows.length > 0 && (
        <footer
          className={`border-t border-zinc-200 px-3 py-2 text-xs text-zinc-700 dark:border-zinc-800 dark:text-zinc-300 ${theme.soft}`}
        >
          แสดง {formatNumber(rows.length)} จาก {formatNumber(all.length)} รายการ
          {showMoo ? " (เรียงตามหมู่ แล้วชื่อ)" : ""}
        </footer>
      )}
    </div>
  );
}
