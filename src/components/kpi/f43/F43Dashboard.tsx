import Link from "next/link";
import { connection } from "next/server";
import { ClipboardCheck, FileWarning, OctagonAlert, Receipt } from "lucide-react";
import { getF43Report } from "@/lib/kpi/f43";
import { F43_MAX_RANGE_DAYS, f43Presets, parseF43Range } from "@/lib/kpi/f43-range";
import type { F43CheckResult, F43FileResult, F43Report } from "@/lib/kpi/f43-types";
import { todayIsoDate } from "@/lib/kpi/fiscal-year";
import { ClinicAlert } from "../clinic/FiscalYearBar";
import { ClinicPanel } from "../clinic/ClinicPanel";
import { STAT_TONES, StatCard } from "../clinic/StatCard";
import { formatNumber, formatThaiDate } from "../format";
import {
  mutedClass,
  tableClass,
  tdClass,
  tdRightClass,
  theadClass,
  thClass,
  thRightClass,
  trClass,
} from "../overview/table-styles";
import { CheckInfo, F43FileDetail } from "./F43FileDetail";
import { F43RangePicker } from "./F43RangePicker";
import { F43Sidebar } from "./F43Sidebar";
import { F43UnitSelect } from "./F43UnitSelect";
import { F43StaffTable, F43UnitTable, STAFF_NOTE } from "./F43UnitTable";
import { f43Href } from "./f43-ui";

type Param = string | string[] | undefined;
const one = (v: Param) => (Array.isArray(v) ? v[0] : v);

const RED_TONE = "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300";

function ReadinessCards({ data }: { data: F43Report }) {
  const count = (g: "hdc" | "fdh", s: F43FileResult["status"]) =>
    data.files.filter((f) => f.group === g && f.status === s).length;
  return (
    <section aria-label="สรุปความพร้อมส่ง" className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard
        title="HDC 52 แฟ้ม"
        value={data.hdc.ready ? "พร้อมส่ง" : "ยังไม่พร้อม"}
        sub={`ยังไม่พร้อม ${formatNumber(count("hdc", "error"))} แฟ้ม · ผ่าน/มีเตือน ${formatNumber(count("hdc", "pass") + count("hdc", "warn"))} แฟ้ม`}
        Icon={ClipboardCheck}
        tone={data.hdc.ready ? STAT_TONES.emerald : RED_TONE}
      />
      <StatCard
        title="HDC ผิดร้ายแรง / เตือน"
        value={`${formatNumber(data.hdc.errorFailed)} / ${formatNumber(data.hdc.warnFailed)}`}
        sub="ผิดร้ายแรง = HDC reject ต้องแก้ก่อนส่ง"
        Icon={OctagonAlert}
        tone={RED_TONE}
      />
      <StatCard
        title="FDH OP"
        value={data.fdh.ready ? "พร้อมส่ง" : "ยังไม่พร้อม"}
        sub={`ยังไม่พร้อม ${formatNumber(count("fdh", "error"))} แฟ้ม · ผ่าน/มีเตือน ${formatNumber(count("fdh", "pass") + count("fdh", "warn"))} แฟ้ม`}
        Icon={Receipt}
        tone={data.fdh.ready ? STAT_TONES.emerald : RED_TONE}
      />
      <StatCard
        title="FDH ผิดร้ายแรง / เตือน"
        value={`${formatNumber(data.fdh.errorFailed)} / ${formatNumber(data.fdh.warnFailed)}`}
        sub="ผิดร้ายแรง = เบิกจ่ายไม่ผ่าน/ติด C"
        Icon={FileWarning}
        tone={STAT_TONES.amber}
      />
    </section>
  );
}

const TOP_N = 15;

/** The most-failed checks across every file (errors first). */
function TopProblems({ data, hrefFor }: { data: F43Report; hrefFor: (file: string) => string }) {
  const items: { f: F43FileResult; c: F43CheckResult }[] = data.files
    .flatMap((f) => f.checks.filter((c) => c.failed > 0).map((c) => ({ f, c })))
    .sort(
      (a, b) =>
        Number(b.c.severity === "error") - Number(a.c.severity === "error") || b.c.failed - a.c.failed,
    )
    .slice(0, TOP_N);
  return (
    <ClinicPanel title="สิ่งที่ต้องแก้มากที่สุด" note={`${TOP_N} รายการแรก เรียงผิดร้ายแรงก่อน แล้วตามจำนวน · กดชื่อแฟ้มเพื่อดูรายละเอียด`}>
      {items.length === 0 ? (
        <p className="mt-3 text-xs">ไม่พบรายการผิดในช่วงวันที่และหน่วยบริการที่เลือก</p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className={`${tableClass} min-w-[36rem]`}>
            <thead className={theadClass}>
              <tr>
                <th scope="col" className={thClass}>แฟ้ม</th>
                <th scope="col" className={thClass}>รายการตรวจ</th>
                <th scope="col" className={thRightClass}>จำนวนผิด</th>
                <th scope="col" className={thClass}>ระดับ</th>
              </tr>
            </thead>
            <tbody>
              {items.map(({ f, c }) => (
                <tr key={`${f.code}-${c.id}`} className={trClass}>
                  <td className={tdClass}>
                    <Link
                      href={hrefFor(f.code)}
                      className="font-mono text-brand-700 underline-offset-2 hover:underline dark:text-brand-300"
                    >
                      {f.group === "fdh" ? `FDH ${f.label}` : f.label}
                    </Link>
                  </td>
                  <td className={tdClass}>
                    <span className="inline-flex items-start gap-1.5">
                      {c.label}
                      <CheckInfo c={c} groupLabel={f.group === "fdh" ? "FDH" : "HDC"} />
                    </span>
                  </td>
                  <td
                    className={`${tdRightClass} font-semibold ${
                      c.severity === "error" ? "text-red-700 dark:text-red-300" : "text-amber-700 dark:text-amber-300"
                    }`}
                  >
                    {formatNumber(c.failed)}
                  </td>
                  <td className={`${tdClass} ${mutedClass}`}>{c.severity === "error" ? "ร้ายแรง" : "เตือน"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </ClinicPanel>
  );
}

function Notes({ data }: { data: F43Report }) {
  const unsupported = data.files.filter((f) => f.status === "unsupported").map((f) => f.label);
  return (
    <section
      aria-label="หมายเหตุ"
      className="min-w-0 rounded-xl border border-zinc-200 bg-surface p-4 shadow-sm dark:border-zinc-800"
    >
      <h2 className="text-base font-semibold">หมายเหตุ</h2>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-zinc-700 dark:text-zinc-300">
        <li>
          ตรวจจากฐาน HOSxP ของโรงพยาบาลก่อนส่งออก ไม่ใช่ผลตอบกลับจาก HDC/FDH · <span className="font-semibold">ผิดร้ายแรง</span> = ฟิลด์บังคับว่าง รหัสไม่อยู่ในตารางมาตรฐาน หรือขาดความสัมพันธ์ข้ามแฟ้ม · <span className="font-semibold">เตือน</span> = ความสมเหตุสมผลและฟิลด์ที่ใช้คิดตัวชี้วัด · <span className="font-semibold">พร้อมส่ง</span> = ไม่มีรายการผิดร้ายแรงในช่วงวันที่และหน่วยบริการที่เลือก
        </li>
        <li>แสดงเฉพาะจำนวน ไม่แสดงชื่อ/HN/เลขบัตรผู้ป่วย ให้ค้นรายผู้ป่วยในหน้าจอ HOSxP ตามคำแนะนำในไอคอน (i)</li>
        <li>
          รพ.สต. ในอำเภอใช้ฐาน HOSxP PCU ของตนเอง (ไม่อยู่ในฐานนี้) จึงไม่อยู่ในรายการหน่วยบริการ · PCU ในรายการคือจุดบริการ PCU ของโรงพยาบาล
        </li>
        <li>
          ผู้ป่วยใน (ADMISSION, แฟ้ม IPD, LABOR, NEWBORN) นับตามวันจำหน่าย · โครงสร้างแฟ้มอ้างอิง HDC 52 แฟ้ม v2.4.1 และหัวไฟล์ส่งออก FDH OP · แฟ้มที่ยังไม่รองรับ: {unsupported.join(", ")}
        </li>
        <li>ชื่อเมนูใน HOSxP อาจต่างกันเล็กน้อยตามเวอร์ชัน · ข้อมูลช่วงล่าสุดปรับปรุงทุกไม่กี่นาที</li>
      </ul>
    </section>
  );
}

export async function F43Dashboard({
  searchParams,
}: {
  searchParams: Promise<{ from?: Param; to?: Param; u?: Param; file?: Param }>;
}) {
  const sp = await searchParams;
  await connection();
  const today = todayIsoDate();
  const presets = f43Presets(today);
  const parsed = parseF43Range(sp.from, sp.to, today);

  if (parsed.error !== undefined) {
    return (
      <div className="space-y-4">
        <ClinicAlert>{parsed.error}</ClinicAlert>
        <div className="rounded-xl border border-zinc-200 bg-surface p-3 shadow-sm dark:border-zinc-800">
          <F43RangePicker
            from={presets[0].from}
            to={presets[0].to}
            presets={presets}
            keep=""
            maxDays={F43_MAX_RANGE_DAYS}
          />
        </div>
      </div>
    );
  }

  const range = parsed.range;
  let data: F43Report | null = null;
  try {
    data = await getF43Report(range, one(sp.u) ?? "*", one(sp.file) ?? null);
  } catch {
    data = null;
  }
  if (!data) {
    return <ClinicAlert>ไม่สามารถโหลดผลตรวจ 43 แฟ้มได้ในขณะนี้ กรุณาลองใหม่ภายหลัง</ClinicAlert>;
  }

  const report = data;
  const fileHref = (file: string | null) => f43Href({ from: range.from, to: range.to, u: report.unit, file });
  const unitHref = (u: string) => f43Href({ from: range.from, to: range.to, u, file: report.file });
  const keep = `${report.unit === "*" ? "" : `&u=${encodeURIComponent(report.unit)}`}${report.file ? `&file=${encodeURIComponent(report.file)}` : ""}`;
  const selected = report.files.find((f) => f.code === report.file) ?? null;

  return (
    <div className="space-y-4">
      <section
        aria-label="เลือกช่วงวันที่และหน่วยบริการ"
        className="flex flex-col gap-3 rounded-xl border border-zinc-200 bg-surface p-3 shadow-sm dark:border-zinc-800"
      >
        <F43RangePicker
          from={range.from}
          to={range.to}
          presets={presets}
          keep={keep}
          maxDays={F43_MAX_RANGE_DAYS}
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <F43UnitSelect
            units={report.units}
            value={report.unit}
            baseHref={f43Href({ from: range.from, to: range.to, file: report.file })}
          />
          <p className="text-xs text-zinc-600 dark:text-zinc-400">
            {formatThaiDate(range.from)} – {formatThaiDate(range.to)} ({formatNumber(range.days)} วัน) · {report.unitName}
          </p>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[13rem_minmax(0,1fr)]">
        <aside className="min-w-0">
          <F43Sidebar files={report.files} selected={report.file} hrefFor={fileHref} />
        </aside>
        <div className="min-w-0 space-y-4">
          {selected ? (
            <>
              <F43FileDetail f={selected} />
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                <F43UnitTable
                  title="แฟ้มนี้ รายหน่วยบริการ"
                  rows={report.unitRows}
                  selected={report.unit}
                  hrefFor={unitHref}
                  groups={[selected.group]}
                />
                <F43StaffTable rows={report.staffRows} note={STAFF_NOTE} />
              </div>
            </>
          ) : (
            <>
              <ReadinessCards data={report} />
              <TopProblems data={report} hrefFor={(f) => fileHref(f)} />
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                <F43UnitTable
                  title="เปรียบเทียบรายหน่วยบริการ"
                  rows={report.unitRows}
                  selected={report.unit}
                  hrefFor={unitHref}
                  groups={["hdc", "fdh"]}
                />
                <F43StaffTable rows={report.staffRows} note={`นับเฉพาะแฟ้ม HDC (FDH ใช้ข้อมูลชุดเดียวกัน) · ${STAFF_NOTE}`} />
              </div>
              <Notes data={report} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
