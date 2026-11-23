import type { PpfsGrade, PpfsItem, PpfsTotals } from "@/lib/kpi/ppfs-types";
import { ExcelDownloadButton, type ExcelExport } from "../overview/ExcelDownloadButton";
import { ProgressBar } from "../ProgressBar";
import { formatBaht, formatNumber } from "../format";
import {
  tableClass,
  tdClass,
  tdRightClass,
  theadClass,
  thClass,
  thRightClass,
  trClass,
} from "../overview/table-styles";
import { PpfsVillageButton } from "./PpfsVillageButton";

const GRADE_CLASS: Record<PpfsGrade, string> = {
  A: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-300",
  B: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300",
  C: "bg-zinc-200 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-300",
};

/** Plain-language label + explanation of the data-quality grade (A/B/C). */
const GRADE_INFO: Record<PpfsGrade, { label: string; hint: string }> = {
  A: {
    label: "ตัวเลขตรงเงื่อนไข",
    hint: "เป้าหมายและผลงานนับจากข้อมูลที่ตรงเงื่อนไข สปสช. โดยตรง เชื่อถือได้สูง",
  },
  B: {
    label: "ตัวเลขประมาณการ",
    hint: "บางส่วนต้องใช้ข้อมูลอื่นแทนเงื่อนไขจริง (เช่น ใช้ช่วงอายุแทนกลุ่มเสี่ยง หรือเห็นเฉพาะประวัติใน รพ.) ตัวเลขอาจคลาดเคลื่อน",
  },
  C: {
    label: "ไม่มีเป้าหมาย",
    hint: "ไม่มีข้อมูลกลุ่มเป้าหมาย นับได้เฉพาะบริการที่ทำแล้ว ไม่รวมในเงินเป้าหมายและยอดที่ยังไม่ได้",
  },
};

const chipClass =
  "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold";

const NONE = "—";

const RATE_UNCONFIRMED_HINT =
  "อัตราจากราคาที่ตั้งใน HOSxP รอยืนยันกับประกาศ สปสช. ปี 2569";

const potentialClass = "block text-xs font-medium text-amber-800 dark:text-amber-300";

/** "ต่อคน" -> "คน" (count unit shown next to target / done). */
function countUnit(unit: string): string {
  return unit.replace(/^ต่อ/, "") || unit;
}

/** Gap desc; items without a target (null gap) go last, then by earned desc. */
function byGapDesc(a: PpfsItem, b: PpfsItem): number {
  const ga = a.gapBaht ?? -1;
  const gb = b.gapBaht ?? -1;
  if (gb !== ga) return gb - ga;
  return b.earnedBaht - a.earnedBaht;
}

export function PpfsTable({
  items,
  fiscalYear,
  totals,
  rateYear,
  rateLabel = "อัตรา PPFS ปี",
  notes = [],
  fileKey = "ppfs",
  ariaLabel = "รายการ PPFS",
  title = "รายการ PPFS เรียงตามยอดที่ยังไม่ได้",
}: {
  items: PpfsItem[];
  fiscalYear: number;
  totals?: PpfsTotals;
  rateYear?: number;
  rateLabel?: string;
  notes?: string[];
  fileKey?: string;
  ariaLabel?: string;
  title?: string;
}) {
  const rows = [...items].sort(byGapDesc);

  const excel: ExcelExport = {
    fileName: `${fileKey}-fy${fiscalYear}`,
    title: `${title} ปีงบประมาณ ${fiscalYear}`,
    subtitle: `ปีงบประมาณ ${fiscalYear}${rateYear ? ` · ${rateLabel} ${rateYear}` : ""} · แหล่งข้อมูล HOSxP (ยอดเงินเป็นค่าประมาณ ไม่ใช่ยอดโอนจริง)`,
    sheetName: "รายการ",
    columns: [
      { header: "รายการ" },
      { header: "กลุ่ม" },
      { header: "เงื่อนไข" },
      { header: "คุณภาพข้อมูล" },
      { header: "ประชากร" },
      { header: "อัตรา (บาท)" },
      { header: "หน่วยอัตรา" },
      { header: "เป้าหมาย", format: "int" },
      { header: "ทำแล้ว", format: "int" },
      { header: "คิดเงินแล้ว (ครั้ง)", format: "int" },
      { header: "เป้าหมาย (บาท)", format: "int" },
      { header: "ได้แล้ว (บาท)", format: "int" },
      { header: "ยังไม่ได้ (บาท)", format: "int" },
      { header: "ร้อยละ", format: "pct" },
      { header: "รอพิจารณา (หน่วย)", format: "int" },
      { header: "รอพิจารณา (บาท)", format: "int" },
      { header: "หมายเหตุ" },
    ],
    rows: rows.map((it) => {
      const potential = it.error ? null : it.potential;
      const percent =
        it.targetBaht !== null && it.targetBaht > 0
          ? (it.earnedBaht / it.targetBaht) * 100
          : null;
      const remark = [
        it.caveat,
        it.ceiling ? "เป้าหมายเป็นเพดาน" : null,
        it.rateUnconfirmed ? RATE_UNCONFIRMED_HINT : null,
        it.error ?? null,
      ]
        .filter((x): x is string => Boolean(x))
        .join(" / ");
      return [
        it.name,
        it.group,
        it.condition,
        GRADE_INFO[it.grade].label,
        it.population === "service" ? "ผู้มารับบริการที่ รพ." : "ประชากรในเขต",
        it.rate,
        it.unit,
        it.target,
        it.error ? null : it.done,
        it.billed,
        it.targetBaht,
        it.error ? null : it.earnedBaht,
        it.gapBaht,
        percent,
        potential ? potential.units : null,
        potential ? potential.baht : null,
        remark || null,
      ];
    }),
    footer: totals
      ? [
          [
            "รวม", "", "", "", "", null, "", null, null, null,
            totals.targetBaht, totals.earnedBaht, totals.gapBaht, totals.coveragePercent,
            null, null, null,
          ],
        ]
      : undefined,
    notes: [
      "\"คิดเงินแล้ว\" = จำนวนครั้ง (visit) ที่ถูกคิดรายการ ADP ของ สปสช. ไม่ใช่สถานะการเบิกจ่ายจริง",
      ...notes,
    ],
  };

  return (
    <section
      aria-label={ariaLabel}
      className="min-w-0 rounded-xl border border-zinc-200 bg-surface p-4 shadow-sm dark:border-zinc-800"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 className="text-base font-semibold">{title}</h2>
        <ExcelDownloadButton data={excel} />
      </div>
      <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
        &quot;คิดเงินแล้ว&quot; = จำนวนครั้ง (visit) ที่ถูกคิดรายการ ADP ของ สปสช. ตรงกับรายการใน HOSxP ในปีงบฯ นี้ (ขอบเขตของแต่ละรายการดูหมายเหตุใต้ชื่อ) ไม่ใช่สถานะการเบิกจ่ายจริง
      </p>
      <dl className="mt-2 space-y-1 text-xs text-zinc-600 dark:text-zinc-400">
        {(["A", "B", "C"] as const).map((g) => (
          <div key={g} className="flex flex-wrap items-center gap-1.5">
            <dt className={`${chipClass} ${GRADE_CLASS[g]}`}>{GRADE_INFO[g].label}</dt>
            <dd>{GRADE_INFO[g].hint}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-3 overflow-x-auto">
        <table className={`${tableClass} min-w-[64rem]`}>
          <thead className={theadClass}>
            <tr>
              <th scope="col" className={thClass}>รายการ</th>
              <th scope="col" className={thRightClass}>อัตรา (บาท)</th>
              <th scope="col" className={thRightClass}>เป้าหมาย</th>
              <th scope="col" className={thRightClass}>ทำแล้ว</th>
              <th scope="col" className={thRightClass}>คิดเงินแล้ว (ครั้ง)</th>
              <th scope="col" className={thRightClass}>เป้าหมาย (บาท)</th>
              <th scope="col" className={thRightClass}>ได้แล้ว (บาท)</th>
              <th scope="col" className={thRightClass}>ยังไม่ได้ (บาท)</th>
              <th scope="col" className={thClass}>ความคืบหน้า</th>
              <th scope="col" className={thClass}>
                <span className="sr-only">รายหมู่บ้าน</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((it) => {
              const targetBaht = it.targetBaht;
              const hasTarget = it.target !== null && targetBaht !== null;
              const percent =
                targetBaht !== null && targetBaht > 0
                  ? (it.earnedBaht / targetBaht) * 100
                  : 0;
              const unit = countUnit(it.unit);
              const potential = it.error ? null : it.potential;
              return (
                <tr key={it.code} className={trClass}>
                  <td className={tdClass}>
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 space-y-0.5">
                        <p className="font-medium">{it.name}</p>
                        <p className="text-xs text-zinc-600 dark:text-zinc-400">
                          {it.group} · {it.condition}
                        </p>
                        <div className="flex flex-wrap gap-1">
                          <span
                            title={GRADE_INFO[it.grade].hint}
                            className={`${chipClass} ${GRADE_CLASS[it.grade]}`}
                          >
                            {GRADE_INFO[it.grade].label}
                          </span>
                          <span
                            className={`${chipClass} ${
                              it.population === "service"
                                ? "bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-300"
                                : "bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-300"
                            }`}
                          >
                            {it.population === "service"
                              ? "ผู้มารับบริการที่ รพ."
                              : "ประชากรในเขต"}
                          </span>
                          {it.ceiling && (
                            <span
                              title="เป้าหมายเป็นค่าสูงสุดที่เป็นไปได้ อาจสูงกว่าจริง"
                              className={`${chipClass} bg-orange-100 text-orange-900 dark:bg-orange-950 dark:text-orange-300`}
                            >
                              เพดาน
                            </span>
                          )}
                        </div>
                        {it.caveat && (
                          <p className="text-xs text-zinc-600 dark:text-zinc-400">
                            {it.caveat}
                          </p>
                        )}
                        {potential && (
                          <div className="rounded-md border border-dashed border-amber-400 bg-amber-50 px-2 py-1 dark:border-amber-700 dark:bg-amber-950/40">
                            <p className="text-xs font-semibold text-amber-900 dark:text-amber-200">
                              {potential.label}: {formatNumber(potential.units)} {unit} ({formatNumber(potential.persons)} {potential.personsUnit}) ≈ {formatBaht(potential.baht)} บาท
                            </p>
                            <p className="text-xs text-amber-900 dark:text-amber-200">
                              {potential.note}
                            </p>
                          </div>
                        )}
                        {it.error && (
                          <p role="alert" className="text-xs font-semibold text-red-700 dark:text-red-300">
                            {it.error}
                          </p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className={tdRightClass}>
                    {formatBaht(it.rate)}
                    <span className="block text-xs text-zinc-600 dark:text-zinc-400">
                      {it.unit}
                    </span>
                    {it.rateUnconfirmed && (
                      <span
                        title={RATE_UNCONFIRMED_HINT}
                        className={`${chipClass} mt-0.5 bg-rose-100 text-rose-900 dark:bg-rose-950 dark:text-rose-300`}
                      >
                        รอยืนยันอัตรา
                      </span>
                    )}
                  </td>
                  <td className={tdRightClass}>
                    {it.target === null ? (
                      NONE
                    ) : (
                      <>
                        {formatNumber(it.target)}
                        <span className="block text-xs text-zinc-600 dark:text-zinc-400">
                          {unit}
                        </span>
                      </>
                    )}
                  </td>
                  <td className={tdRightClass}>
                    {it.error ? NONE : formatNumber(it.done)}
                    {potential && (
                      <span className={potentialClass} title={potential.label}>
                        +{formatNumber(potential.units)} {potential.shortLabel}
                      </span>
                    )}
                  </td>
                  <td className={tdRightClass}>
                    {it.billed === null ? NONE : formatNumber(it.billed)}
                  </td>
                  <td className={tdRightClass}>
                    {targetBaht === null ? NONE : formatBaht(targetBaht)}
                  </td>
                  <td className={tdRightClass}>
                    {it.error ? NONE : formatBaht(it.earnedBaht)}
                    {potential && (
                      <span className={potentialClass} title={potential.note}>
                        +{formatBaht(potential.baht)} บาท รอพิจารณา
                      </span>
                    )}
                  </td>
                  <td className={tdRightClass}>
                    {it.gapBaht === null ? NONE : formatBaht(it.gapBaht)}
                  </td>
                  <td className={tdClass}>
                    {hasTarget ? (
                      <ProgressBar
                        percent={percent}
                        targetPercent={100}
                        barClass="bg-brand-600"
                        label={`ความคืบหน้า ${it.name}`}
                      />
                    ) : (
                      NONE
                    )}
                  </td>
                  <td className={tdClass}>
                    {it.villages && it.villages.length > 0 ? (
                      <PpfsVillageButton
                        code={it.code}
                        name={it.name}
                        rate={it.rate}
                        countUnit={unit}
                        fiscalYear={fiscalYear}
                        fileKey={fileKey}
                        hasBilled={it.billed !== null}
                        villages={it.villages}
                      />
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
