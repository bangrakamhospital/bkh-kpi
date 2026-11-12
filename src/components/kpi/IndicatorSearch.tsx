"use client";

import { Fragment, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Building2, Search, SearchX, Users, X } from "lucide-react";
import type { ScreeningCode } from "@/lib/kpi/types";
import {
  categoryAnchorId,
  EMPTY_CATEGORY_NOTE,
  KPI_CATEGORIES,
  SHOW_EMPTY_CATEGORIES,
  type CategoryId,
} from "@/lib/kpi/categories";
import { CategoryChipBar } from "./CategoryChipBar";
import { toneFor, type Department } from "./department-theme";

export interface SearchableRow {
  no: number;
  /** ScreeningCode ของแถว (ใช้กรองตามแผนก) */
  code?: ScreeningCode;
  /** ข้อความที่ใช้ค้นหา (เลขข้อ ชื่อ กลุ่มเป้าหมาย code คำพ้อง) */
  keywords: string;
  /** หมวดตัวชี้วัด (lib/kpi/categories) */
  categoryId: CategoryId;
  /** แถว <tr> ที่ server เตรียมไว้แล้ว */
  node: React.ReactNode;
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * ช่องค้นหา + ตารางตัวชี้วัด กรองฝั่ง client
 * คำค้นเก็บใน URL `?q=` ด้วย history.replaceState (ไม่ยิง server ซ้ำ,
 * คง `fy` เดิม) ต้องอยู่ภายใต้ Suspense เพราะใช้ useSearchParams
 */
export function IndicatorSearch({
  rows,
  fiscalYear,
}: {
  rows: SearchableRow[];
  fiscalYear: number;
}) {
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(searchParams.get("q") ?? "");
  const [deptId, setDeptId] = useState(searchParams.get("dept") ?? "");
  const [departments, setDepartments] = useState<Department[]>([]);

  // โหลดแผนกหลัง hydrate ถ้าล้มเหลว/ไม่มี จะซ่อนแถว chip เงียบๆ
  useEffect(() => {
    let cancelled = false;
    fetch("/api/departments")
      .then(async (res) => {
        if (!res.ok) return [];
        const json = (await res.json()) as { departments?: Department[] };
        return Array.isArray(json.departments) ? json.departments : [];
      })
      .catch((): Department[] => [])
      .then((list) => {
        if (!cancelled) setDepartments(list);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function selectDept(next: string) {
    setDeptId(next);
    const params = new URLSearchParams(window.location.search);
    if (next) params.set("dept", next);
    else params.delete("dept");
    const qs = params.toString();
    window.history.replaceState(
      null,
      "",
      qs ? `?${qs}` : window.location.pathname,
    );
  }

  function update(next: string) {
    setQuery(next);
    const params = new URLSearchParams(window.location.search);
    if (next.trim()) params.set("q", next);
    else params.delete("q");
    const qs = params.toString();
    window.history.replaceState(
      null,
      "",
      qs ? `?${qs}` : window.location.pathname,
    );
  }

  const q = normalize(query);
  const activeDept = departments.find((d) => d.id === deptId);
  const visible = rows.filter(
    (r) =>
      (!activeDept || (r.code !== undefined && activeDept.codes.includes(r.code))) &&
      (!q || normalize(r.keywords).includes(q)),
  );

  // Group by category (number order). Empty categories are only shown when
  // no search / department filter is active (and SHOW_EMPTY_CATEGORIES).
  const filtering = Boolean(q) || Boolean(activeDept);
  const sections = KPI_CATEGORIES.map((category) => ({
    category,
    rows: visible.filter((r) => r.categoryId === category.id),
  })).filter(
    (s) => s.rows.length > 0 || (SHOW_EMPTY_CATEGORIES && !filtering),
  );

  return (
    <div className="space-y-2">
      {visible.length > 0 && (
        <CategoryChipBar categories={sections.map((s) => s.category)} />
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="relative w-full max-w-sm">
          <label htmlFor="indicator-search" className="sr-only">
            ค้นหาตัวชี้วัด
          </label>
          <Search
            aria-hidden="true"
            size={14}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500"
          />
          <input
            id="indicator-search"
            type="search"
            value={query}
            onChange={(e) => update(e.target.value)}
            placeholder="ค้นหาตัวชี้วัด เช่น เบาหวาน, มะเร็ง, ข้อ 3"
            className="w-full rounded-lg border border-zinc-300 bg-surface py-1.5 pl-8 pr-8 text-xs focus:border-brand-600 focus:outline-2 focus:outline-brand-600 dark:border-zinc-700 [&::-webkit-search-cancel-button]:hidden"
          />
          {query && (
            <button
              type="button"
              onClick={() => update("")}
              aria-label="ล้างการค้นหา"
              className="absolute right-1.5 top-1/2 inline-flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full text-zinc-600 hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-brand-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              <X aria-hidden="true" size={14} />
            </button>
          )}
        </div>
        <p
          aria-live="polite"
          className="text-xs text-zinc-600 dark:text-zinc-400"
        >
          พบ {visible.length} จาก {rows.length} ตัวชี้วัด
        </p>
      </div>

      {departments.length > 0 && (
        <div
          role="group"
          aria-label="กรองตามแผนก"
          className="flex flex-wrap items-center gap-2"
        >
          <button
            type="button"
            aria-pressed={!activeDept}
            onClick={() => selectDept("")}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 ${
              !activeDept
                ? "border-brand-700 bg-brand-700 text-white"
                : "border-brand-200 bg-brand-50 text-brand-800 hover:bg-brand-100 dark:border-brand-800 dark:bg-brand-900/30 dark:text-brand-100"
            }`}
          >
            <Users aria-hidden="true" size={14} />
            ทั้งหมด
          </button>
          {departments.map((d, i) => {
            const tone = toneFor(d.color, i);
            const active = activeDept?.id === d.id;
            return (
              <button
                key={d.id}
                type="button"
                aria-pressed={active}
                onClick={() => selectDept(active ? "" : d.id)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 ${
                  active ? tone.chipActive : tone.chip
                }`}
              >
                <Building2 aria-hidden="true" size={14} />
                {d.name}
              </button>
            );
          })}
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-surface shadow-sm dark:border-zinc-800">
        <table className="w-full min-w-[52rem] text-xs">
          <caption className="sr-only">
            ตารางตัวชี้วัดการคัดกรอง ปีงบประมาณ {fiscalYear}
          </caption>
          <thead className="bg-brand-700 text-left text-white dark:bg-brand-800">
            <tr>
              <th scope="col" className="px-3 py-2.5 text-sm font-semibold">ข้อ</th>
              <th scope="col" className="px-3 py-2.5 text-sm font-semibold">ตัวชี้วัด</th>
              <th scope="col" className="px-3 py-2.5 text-right text-sm font-semibold">เป้าหมาย</th>
              <th scope="col" className="px-3 py-2.5 text-right text-sm font-semibold">ผลงาน</th>
              <th scope="col" className="px-3 py-2.5 text-sm font-semibold">ร้อยละ</th>
              <th scope="col" className="px-3 py-2.5 text-center text-sm font-semibold">Action</th>
            </tr>
          </thead>
          <tbody>
            {visible.length > 0 ? (
              sections.map((s) => (
                <Fragment key={s.category.id}>
                  <tr
                    id={categoryAnchorId(s.category.id)}
                    className="scroll-mt-4 border-t border-zinc-200 bg-brand-100 dark:border-zinc-800 dark:bg-brand-900/50"
                  >
                    <th
                      scope="colgroup"
                      colSpan={6}
                      className="px-3 py-2 text-left text-sm font-semibold text-brand-900 dark:text-brand-100"
                    >
                      {s.category.number}. {s.category.name}
                    </th>
                  </tr>
                  {s.rows.length > 0 ? (
                    s.rows.map((r) => <Fragment key={r.no}>{r.node}</Fragment>)
                  ) : (
                    <tr className="border-t border-zinc-200 dark:border-zinc-800">
                      <td
                        colSpan={6}
                        className="px-3 py-2.5 text-xs text-zinc-500 dark:text-zinc-400"
                      >
                        {EMPTY_CATEGORY_NOTE}
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))
            ) : (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center">
                  <SearchX
                    aria-hidden="true"
                    size={32}
                    className="mx-auto text-zinc-500"
                  />
                  <p className="mt-2 text-xs text-zinc-700 dark:text-zinc-300">
                    {activeDept && !q
                      ? "ยังไม่มีตัวชี้วัดของแผนกนี้"
                      : q
                        ? `ไม่พบตัวชี้วัดที่ตรงกับ “${query.trim()}”${activeDept ? ` ในแผนก ${activeDept.name}` : ""}`
                        : "ไม่พบตัวชี้วัด"}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      update("");
                      selectDept("");
                    }}
                    className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium hover:bg-brand-50 focus-visible:outline-2 focus-visible:outline-brand-600 dark:border-zinc-700 dark:hover:bg-brand-900/40"
                  >
                    <X aria-hidden="true" size={16} />
                    {activeDept ? "ล้างตัวกรอง" : "ล้างการค้นหา"}
                  </button>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
