"use client";

import { Fragment, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Search, SearchX, X } from "lucide-react";

export interface SearchableRow {
  no: number;
  /** ข้อความที่ใช้ค้นหา (เลขข้อ ชื่อ กลุ่มเป้าหมาย code คำพ้อง) */
  keywords: string;
  /** ชื่อกลุ่ม: แสดงแถวหัวกลุ่มก่อนแถวแรกของกลุ่ม (แถวของกลุ่มเดียวกันต้องอยู่ติดกัน) */
  group?: string;
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
  const visible = q
    ? rows.filter((r) => normalize(r.keywords).includes(q))
    : rows;

  return (
    <div className="space-y-2">
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
              visible.map((r, i) => (
                <Fragment key={r.no}>
                  {r.group && r.group !== visible[i - 1]?.group && (
                    <tr className="border-t border-zinc-200 bg-brand-100 text-brand-900 dark:border-zinc-800 dark:bg-brand-900/60 dark:text-brand-100">
                      <th
                        scope="colgroup"
                        colSpan={6}
                        className="px-3 py-2 text-left text-sm font-semibold"
                      >
                        {r.group}
                      </th>
                    </tr>
                  )}
                  {r.node}
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
                    ไม่พบตัวชี้วัดที่ตรงกับ “{query.trim()}”
                  </p>
                  <button
                    type="button"
                    onClick={() => update("")}
                    className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium hover:bg-brand-50 focus-visible:outline-2 focus-visible:outline-brand-600 dark:border-zinc-700 dark:hover:bg-brand-900/40"
                  >
                    <X aria-hidden="true" size={16} />
                    ล้างการค้นหา
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
