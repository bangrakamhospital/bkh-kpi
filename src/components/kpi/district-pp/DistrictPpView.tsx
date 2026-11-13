"use client";

import { useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CalendarDays } from "lucide-react";
import type {
  DistrictPpItemDef,
  DistrictPpPage,
  DistrictPpRateBasis,
  DistrictPpSummary,
  DistrictPpVillage,
} from "@/lib/kpi/district-pp-types";
import { FiscalYearSelect } from "../FiscalYearSelect";
import { ProgressBar } from "../ProgressBar";
import {
  formatBaht,
  formatNumber,
  formatPercent,
  formatThaiDate,
} from "../format";
import {
  tableClass,
  tdClass,
  tdRightClass,
  theadClass,
  thClass,
  thRightClass,
  trClass,
} from "../overview/table-styles";
import { DistrictPpStatCards, type DistrictPpMoney } from "./DistrictPpStatCards";

const NONE = "—";

const BASIS_LABEL: Record<DistrictPpRateBasis, string> = {
  nhso: "อัตรา สปสช.",
  reference: "มูลค่าอ้างอิง",
  unset: "เหมาจ่ายรายหัว",
};

const BASIS_CLASS: Record<DistrictPpRateBasis, string> = {
  nhso: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-300",
  reference: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300",
  unset: "bg-zinc-200 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-300",
};

const chipClass =
  "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold";
const selectClass =
  "w-full min-w-40 rounded-lg border border-zinc-300 bg-surface px-2 py-1.5 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 disabled:opacity-50 dark:border-zinc-700";
const subTextClass = "block text-xs text-zinc-600 dark:text-zinc-400";

interface Sum {
  target: number;
  done: number;
}

function addMoney(m: DistrictPpMoney, item: DistrictPpItemDef, s: Sum): void {
  if (item.error || item.rate === null) return;
  if (item.basis === "nhso") {
    m.nhsoTarget += s.target * item.rate;
    m.nhsoDone += s.done * item.rate;
  } else if (item.basis === "reference") {
    m.refTarget += s.target * item.rate;
    m.refDone += s.done * item.rate;
  }
}

const emptyMoney = (): DistrictPpMoney => ({
  nhsoTarget: 0,
  nhsoDone: 0,
  refTarget: 0,
  refDone: 0,
});

const percentOf = (done: number, target: number): number =>
  target > 0 ? (done / target) * 100 : 0;

/** "ต่อคน" -> "คน". */
function countUnit(unit: string): string {
  return unit.replace(/^ต่อ/, "") || unit;
}

const mooNum = (v: DistrictPpVillage): number => Number(v.moo) || 0;

/** A unit's data is flagged when it stops more than this before dataAsOf. */
const STALE_DAYS = 30;

const isoDays = (iso: string): number =>
  Date.UTC(
    Number(iso.slice(0, 4)),
    Number(iso.slice(5, 7)) - 1,
    Number(iso.slice(8, 10)),
  ) / 86_400_000;

interface CompareRow {
  key: string;
  label: string;
  /** null = summary row with no drill-down (EPI doses to non-residents). */
  filter: "unit" | "tambon" | "moo" | null;
  money: DistrictPpMoney;
}

const EXTRAS_ROW_KEY = "__extras";

export function DistrictPpView({
  summary,
  minYear,
  maxYear,
}: {
  summary: DistrictPpSummary;
  minYear: number;
  maxYear: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  const { villages, items, cells, unitExtras, unitDataAsOf } = summary;

  // Effective filters: invalid URL values are ignored; lower levels need valid parents.
  const unitRaw = sp.get("unit") ?? "";
  const unit = villages.some((v) => v.hospcode === unitRaw) ? unitRaw : "";
  const byUnit = useMemo(
    () => villages.filter((v) => !unit || v.hospcode === unit),
    [villages, unit],
  );
  const tambonRaw = sp.get("tambon") ?? "";
  const tambon = byUnit.some((v) => v.tambon === tambonRaw) ? tambonRaw : "";
  const byTambon = useMemo(
    () => byUnit.filter((v) => !tambon || v.tambon === tambon),
    [byUnit, tambon],
  );
  const mooRaw = sp.get("moo") ?? "";
  const moo = tambon && byTambon.some((v) => v.moo === mooRaw) ? mooRaw : "";
  const filtered = useMemo(
    () => byTambon.filter((v) => !moo || v.moo === moo),
    [byTambon, moo],
  );
  const view: DistrictPpPage = sp.get("view") === "basic" ? "basic" : "ppfs";

  const unitOptions = useMemo(() => {
    const m = new Map<string, string>();
    for (const v of villages) m.set(v.hospcode, v.hospName);
    return [...m].sort((a, b) => a[1].localeCompare(b[1], "th"));
  }, [villages]);
  const tambonOptions = useMemo(() => {
    const m = new Map<string, string>();
    for (const v of byUnit) m.set(v.tambon, v.tambonName);
    return [...m].sort((a, b) => a[0].localeCompare(b[0]));
  }, [byUnit]);
  // One entry per village (a village served by two units appears twice in byTambon).
  const mooOptions = useMemo(() => {
    const m = new Map<string, DistrictPpVillage>();
    for (const v of byTambon) if (!m.has(v.vid)) m.set(v.vid, v);
    return [...m.values()].sort((a, b) => mooNum(a) - mooNum(b));
  }, [byTambon]);

  const setParams = useCallback(
    (next: Record<string, string>) => {
      const q = new URLSearchParams(sp.toString());
      for (const [k, v] of Object.entries(next)) {
        if (v) q.set(k, v);
        else q.delete(k);
      }
      const s = q.toString();
      router.replace(s ? `${pathname}?${s}` : pathname, { scroll: false });
    },
    [sp, router, pathname],
  );

  const pageItems = useMemo(
    () =>
      items.filter((i) => i.page === view).sort((a, b) => a.order - b.order),
    [items, view],
  );

  // village key (vid:hospcode) -> code -> {target, done}
  const cellMap = useMemo(() => {
    const m = new Map<string, Map<string, Sum>>();
    for (const c of cells) {
      let inner = m.get(c.key);
      if (!inner) {
        inner = new Map();
        m.set(c.key, inner);
      }
      inner.set(c.code, { target: c.target, done: c.done });
    }
    return m;
  }, [cells]);

  // Work with no village (EPI doses to non-resident children): hospcode -> code -> done.
  // Counted (done = target) only without a ตำบล / หมู่ filter.
  const extrasActive = !tambon && !moo;
  const extraMap = useMemo(() => {
    const m = new Map<string, Map<string, number>>();
    for (const e of unitExtras) {
      let inner = m.get(e.hospcode);
      if (!inner) {
        inner = new Map();
        m.set(e.hospcode, inner);
      }
      inner.set(e.code, (inner.get(e.code) ?? 0) + e.done);
    }
    return m;
  }, [unitExtras]);

  /** Extra units of `code` for the given hospcodes. */
  const extraOf = useCallback(
    (hospcodes: Iterable<string>, code: string): number => {
      let n = 0;
      for (const h of hospcodes) n += extraMap.get(h)?.get(code) ?? 0;
      return n;
    },
    [extraMap],
  );

  /** Units in the current รพ.สต. filter (all units without one). */
  const scopeUnits = useMemo(
    () => (unit ? [unit] : [...extraMap.keys()]),
    [unit, extraMap],
  );

  const moneyOf = useCallback(
    (vs: DistrictPpVillage[], extraUnits: readonly string[] = []): DistrictPpMoney => {
      const money = emptyMoney();
      for (const v of vs) {
        const inner = cellMap.get(v.key);
        if (!inner) continue;
        for (const item of pageItems) {
          const s = inner.get(item.code);
          if (s) addMoney(money, item, s);
        }
      }
      for (const item of pageItems) {
        const n = extraOf(extraUnits, item.code);
        if (n > 0) addMoney(money, item, { target: n, done: n });
      }
      return money;
    },
    [cellMap, pageItems, extraOf],
  );

  const itemRows = useMemo(
    () =>
      pageItems.map((item) => {
        const sum: Sum = { target: 0, done: 0 };
        for (const v of filtered) {
          const s = cellMap.get(v.key)?.get(item.code);
          if (s) {
            sum.target += s.target;
            sum.done += s.done;
          }
        }
        const extra =
          extrasActive && !item.error ? extraOf(scopeUnits, item.code) : 0;
        sum.target += extra;
        sum.done += extra;
        const priced =
          !item.error && item.rate !== null && item.basis !== "unset";
        return {
          item,
          sum,
          targetBaht: priced ? sum.target * (item.rate ?? 0) : null,
          doneBaht: priced ? sum.done * (item.rate ?? 0) : null,
        };
      }),
    [pageItems, filtered, cellMap, extrasActive, extraOf, scopeUnits],
  );

  const total = useMemo(
    () => moneyOf(filtered, extrasActive ? scopeUnits : []),
    [moneyOf, filtered, extrasActive, scopeUnits],
  );
  const extraDoses = useMemo(
    () =>
      extrasActive
        ? pageItems
            .filter((i) => !i.error)
            .reduce((n, i) => n + extraOf(scopeUnits, i.code), 0)
        : 0,
    [extrasActive, pageItems, extraOf, scopeUnits],
  );
  const hasReference = pageItems.some(
    (i) => i.basis === "reference" && !i.error,
  );

  const compare = useMemo<{ title: string; rows: CompareRow[] } | null>(() => {
    if (moo) return null;
    const groups = new Map<
      string,
      { label: string; vs: DistrictPpVillage[] }
    >();
    let filter: CompareRow["filter"];
    let title: string;
    if (!unit) {
      filter = "unit";
      title = "เปรียบเทียบรายหน่วยบริการ (รพ.สต.)";
    } else if (!tambon) {
      filter = "tambon";
      title = "เปรียบเทียบรายตำบล";
    } else {
      filter = "moo";
      title = "เปรียบเทียบรายหมู่";
    }
    for (const v of filtered) {
      const key =
        filter === "unit" ? v.hospcode : filter === "tambon" ? v.tambon : v.moo;
      const label =
        filter === "unit"
          ? v.hospName
          : filter === "tambon"
            ? `ต.${v.tambonName}`
            : `หมู่ ${v.moo}${v.villageName ? ` ${v.villageName}` : ""}`;
      const g = groups.get(key);
      if (g) g.vs.push(v);
      else groups.set(key, { label, vs: [v] });
    }
    const rows: CompareRow[] = [...groups].map(([key, g]) => ({
      key,
      label: g.label,
      filter,
      money: moneyOf(
        g.vs,
        filter === "unit" && extrasActive ? [key] : [],
      ),
    }));
    rows.sort(
      (a, b) =>
        b.money.nhsoTarget -
        b.money.nhsoDone -
        (a.money.nhsoTarget - a.money.nhsoDone),
    );
    // One unit by ตำบล: its non-resident EPI doses have no ตำบล, so they get
    // their own (last, not clickable) row and the rows add up to the cards.
    if (filter === "tambon" && extrasActive) {
      const money = moneyOf([], [unit]);
      if (money.nhsoTarget > 0 || money.refTarget > 0) {
        rows.push({
          key: EXTRAS_ROW_KEY,
          label: "เด็กนอกเขตอำเภอ (วัคซีน)",
          filter: null,
          money,
        });
      }
    }
    return { title, rows };
  }, [filtered, unit, tambon, moo, moneyOf, extrasActive]);

  // Units in the current filter whose HDC data stop > STALE_DAYS before dataAsOf.
  const staleUnits = useMemo(() => {
    if (!unitDataAsOf) return [];
    const inScope = new Set(filtered.map((v) => v.hospcode));
    const asOf = isoDays(summary.dataAsOf);
    return unitDataAsOf.filter(
      (u) =>
        inScope.has(u.hospcode) &&
        (u.lastDate === null || asOf - isoDays(u.lastDate) > STALE_DAYS),
    );
  }, [unitDataAsOf, filtered, summary.dataAsOf]);

  const buildHref = (fy: number) => {
    const q = new URLSearchParams(sp.toString());
    q.set("fy", String(fy));
    return `${pathname}?${q.toString()}`;
  };

  const pickRow = (r: CompareRow) => {
    if (r.filter === "unit") setParams({ unit: r.key, tambon: "", moo: "" });
    else if (r.filter === "tambon") setParams({ tambon: r.key, moo: "" });
    else if (r.filter === "moo") setParams({ moo: r.key });
  };

  const viewTabs: { value: DistrictPpPage; label: string }[] = [
    { value: "ppfs", label: "รายการ PPFS" },
    { value: "basic", label: "P&P Basic Services" },
  ];
  const viewTitle = view === "ppfs" ? "รายการ PPFS" : "P&P Basic Services";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-surface p-3 shadow-sm dark:border-zinc-800">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
          <span className="inline-flex items-center gap-1.5 font-semibold">
            <CalendarDays
              aria-hidden="true"
              className="h-4 w-4 text-brand-700 dark:text-brand-300"
            />
            ปีงบประมาณ {summary.fiscalYear}
          </span>
          <span className="text-zinc-700 dark:text-zinc-300">
            {summary.closed
              ? "ปีงบประมาณนี้ปิดแล้ว"
              : view === "ppfs"
                ? "ปีงบประมาณนี้ยังไม่สิ้นสุด เป้าหมายเป็นยอดทั้งปี"
                : "ปีงบประมาณนี้ยังไม่สิ้นสุด เป้าหมายพัฒนาการและวัคซีนนับเฉพาะเด็กที่ถึงกำหนดถึงวันที่ข้อมูล"}
          </span>
        </div>
        <div className="max-w-full overflow-x-auto">
          <FiscalYearSelect
            fiscalYear={summary.fiscalYear}
            minYear={minYear}
            maxYear={maxYear}
            buildHref={buildHref}
          />
        </div>
      </div>

      <div className="space-y-3 rounded-xl border border-zinc-200 bg-surface p-3 shadow-sm dark:border-zinc-800">
        <div
          role="group"
          aria-label="เลือกประเภทรายการ"
          className="flex flex-wrap gap-2"
        >
          {viewTabs.map((t) => {
            const active = view === t.value;
            return (
              <button
                key={t.value}
                type="button"
                aria-pressed={active}
                onClick={() =>
                  setParams({ view: t.value === "ppfs" ? "" : t.value })
                }
                className={`rounded-full px-3 py-1.5 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 ${
                  active
                    ? "bg-brand-700 text-white"
                    : "border border-brand-200 bg-brand-50 text-brand-800 hover:bg-brand-100 dark:border-brand-700 dark:bg-brand-900 dark:text-brand-100 dark:hover:bg-brand-800"
                }`}
              >
                {t.label}
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap gap-3">
          <label className="min-w-40 flex-1 space-y-1">
            <span className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
              หน่วยบริการ (รพ.สต.)
            </span>
            <select
              className={selectClass}
              value={unit}
              onChange={(e) =>
                setParams({ unit: e.target.value, tambon: "", moo: "" })
              }
            >
              <option value="">ทั้งหมด ({unitOptions.length} หน่วย)</option>
              {unitOptions.map(([code, name]) => (
                <option key={code} value={code}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label className="min-w-40 flex-1 space-y-1">
            <span className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
              ตำบล
            </span>
            <select
              className={selectClass}
              value={tambon}
              onChange={(e) => setParams({ tambon: e.target.value, moo: "" })}
            >
              <option value="">ทั้งหมด ({tambonOptions.length} ตำบล)</option>
              {tambonOptions.map(([code, name]) => (
                <option key={code} value={code}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label className="min-w-40 flex-1 space-y-1">
            <span className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
              หมู่
            </span>
            <select
              className={selectClass}
              value={moo}
              disabled={!tambon}
              onChange={(e) => setParams({ moo: e.target.value })}
            >
              <option value="">
                {tambon
                  ? `ทั้งหมด (${mooOptions.length} หมู่)`
                  : "เลือกตำบลก่อน"}
              </option>
              {tambon &&
                mooOptions.map((v) => (
                  <option key={v.vid} value={v.moo}>
                    หมู่ {v.moo}
                    {v.villageName ? ` ${v.villageName}` : ""}
                  </option>
                ))}
            </select>
          </label>
        </div>
      </div>

      <DistrictPpStatCards money={total} hasReference={hasReference} />

      <div className="space-y-1">
        <p className="text-xs text-zinc-600 dark:text-zinc-400">
          ข้อมูลจาก HDC อำเภอ (43 แฟ้ม) ถึงวันที่ {formatThaiDate(summary.dataAsOf)} นับตามที่อยู่ของประชากรและหน่วยบริการที่รับผิดชอบ ตัวเลขอาจต่างจากหน้าโรงพยาบาล (HOSxP)
        </p>
        {extraDoses > 0 && (
          <p className="text-xs text-zinc-600 dark:text-zinc-400">
            รวมวัคซีนเด็กนอกเขตอำเภอ {formatNumber(extraDoses)} เข็ม (นับเป็นทั้งเป้าหมายและผลงานของหน่วยที่ฉีด แสดงเฉพาะเมื่อไม่ได้กรองตำบล/หมู่)
          </p>
        )}
        {staleUnits.length > 0 && (
          <p
            role="note"
            className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200"
          >
            ข้อมูลใน HDC ของบางหน่วยยังส่งไม่ถึงวันที่ข้อมูล (ขาดเกิน {STALE_DAYS} วัน) ผลงานจึงอาจต่ำกว่าจริง:{" "}
            {staleUnits
              .map(
                (u) =>
                  `${u.hospName} (${u.lastDate ? `ถึง ${formatThaiDate(u.lastDate)}` : "ยังไม่มีข้อมูล"})`,
              )
              .join(", ")}
          </p>
        )}
      </div>

      {compare && compare.rows.length > 0 && (
        <section
          aria-label={compare.title}
          className="min-w-0 rounded-xl border border-zinc-200 bg-surface p-4 shadow-sm dark:border-zinc-800"
        >
          <h2 className="text-base font-semibold">{compare.title}</h2>
          <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
            เรียงตามยอดที่ยังไม่ได้ (เฉพาะอัตรา สปสช.) คลิกที่ชื่อเพื่อกรองลงไปในระดับนั้น
          </p>
          <div className="mt-3 overflow-x-auto">
            <table className={`${tableClass} min-w-[40rem]`}>
              <thead className={theadClass}>
                <tr>
                  <th scope="col" className={thClass}>ชื่อ</th>
                  <th scope="col" className={thRightClass}>เป้าหมาย (บาท)</th>
                  <th scope="col" className={thRightClass}>ได้แล้ว (บาท)</th>
                  <th scope="col" className={thRightClass}>ยังไม่ได้ (บาท)</th>
                  <th scope="col" className={thRightClass}>ร้อยละ</th>
                </tr>
              </thead>
              <tbody>
                {compare.rows.map((r) => (
                  <tr
                    key={r.key}
                    onClick={r.filter ? () => pickRow(r) : undefined}
                    className={
                      r.filter
                        ? `${trClass} cursor-pointer hover:bg-brand-50 dark:hover:bg-brand-900/40`
                        : trClass
                    }
                  >
                    <td className={tdClass}>
                      {r.filter === null ? (
                        <span className="font-medium text-zinc-700 dark:text-zinc-300">
                          {r.label}
                        </span>
                      ) : (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          pickRow(r);
                        }}
                        className="text-left font-medium text-brand-800 underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 dark:text-brand-200"
                      >
                        {r.label}
                      </button>
                      )}
                    </td>
                    <td className={tdRightClass}>
                      {formatBaht(r.money.nhsoTarget)}
                    </td>
                    <td className={tdRightClass}>
                      {formatBaht(r.money.nhsoDone)}
                    </td>
                    <td className={tdRightClass}>
                      {formatBaht(r.money.nhsoTarget - r.money.nhsoDone)}
                    </td>
                    <td className={tdRightClass}>
                      {formatPercent(
                        percentOf(r.money.nhsoDone, r.money.nhsoTarget),
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section
        aria-label={viewTitle}
        className="min-w-0 rounded-xl border border-zinc-200 bg-surface p-4 shadow-sm dark:border-zinc-800"
      >
        <h2 className="text-base font-semibold">{viewTitle}</h2>
        {itemRows.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-300">
            ไม่พบรายการ
          </p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className={`${tableClass} min-w-[60rem]`}>
              <thead className={theadClass}>
                <tr>
                  <th scope="col" className={thClass}>รายการ</th>
                  <th scope="col" className={thRightClass}>อัตรา (บาท)</th>
                  <th scope="col" className={thRightClass}>เป้าหมาย</th>
                  <th scope="col" className={thRightClass}>ทำแล้ว</th>
                  <th scope="col" className={thRightClass}>เป้าหมาย (บาท)</th>
                  <th scope="col" className={thRightClass}>ได้แล้ว (บาท)</th>
                  <th scope="col" className={thRightClass}>ยังไม่ได้ (บาท)</th>
                  <th scope="col" className={thClass}>ความคืบหน้า</th>
                </tr>
              </thead>
              <tbody>
                {itemRows.map(({ item, sum, targetBaht, doneBaht }) => {
                  const u = countUnit(item.unit);
                  const err = Boolean(item.error);
                  return (
                    <tr key={item.code} className={trClass}>
                      <td className={tdClass}>
                        <div className="min-w-0 space-y-0.5">
                          <p className="font-medium">{item.name}</p>
                          <p className="text-xs text-zinc-600 dark:text-zinc-400">
                            {item.group} · {item.condition}
                          </p>
                          <span
                            className={`${chipClass} ${BASIS_CLASS[item.basis]}`}
                          >
                            {BASIS_LABEL[item.basis]}
                          </span>
                          {item.caveat && (
                            <p className="text-xs text-zinc-600 dark:text-zinc-400">
                              {item.caveat}
                            </p>
                          )}
                          {item.error && (
                            <p
                              role="alert"
                              className="text-xs font-semibold text-red-700 dark:text-red-300"
                            >
                              {item.error}
                            </p>
                          )}
                        </div>
                      </td>
                      <td className={tdRightClass}>
                        {item.rate === null ? NONE : formatBaht(item.rate)}
                        <span className={subTextClass}>{item.rateUnit}</span>
                      </td>
                      <td className={tdRightClass}>
                        {err ? NONE : formatNumber(sum.target)}
                        {!err && <span className={subTextClass}>{u}</span>}
                      </td>
                      <td className={tdRightClass}>
                        {err ? NONE : formatNumber(sum.done)}
                        {!err && <span className={subTextClass}>{u}</span>}
                      </td>
                      <td className={tdRightClass}>
                        {targetBaht === null ? NONE : formatBaht(targetBaht)}
                      </td>
                      <td className={tdRightClass}>
                        {doneBaht === null ? NONE : formatBaht(doneBaht)}
                      </td>
                      <td className={tdRightClass}>
                        {targetBaht === null || doneBaht === null
                          ? NONE
                          : formatBaht(targetBaht - doneBaht)}
                      </td>
                      <td className={tdClass}>
                        {err || sum.target === 0 ? (
                          NONE
                        ) : (
                          <ProgressBar
                            percent={percentOf(sum.done, sum.target)}
                            targetPercent={100}
                            barClass="bg-brand-600"
                            label={`ความคืบหน้า ${item.name}`}
                          />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
