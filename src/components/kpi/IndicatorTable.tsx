import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  Clock,
  FileText,
  Info,
  Search,
  Target,
  TrendingUp,
  XCircle,
} from "lucide-react";
import type {
  ReductionIndicator,
  ScreeningIndicator,
} from "@/lib/kpi/types";
import {
  CKD5_INDICATOR,
  isLowerBetter,
  isReductionCode,
  meetsTarget,
  SCREENING_INDICATORS,
  targetOperatorSign,
} from "@/lib/kpi/screening-indicators";
import { ACCENTS } from "./indicator-theme";
import { INDICATOR_ROWS, type IndicatorRowConfig } from "./indicator-rows";
import { InfoPopover, type InfoItem } from "./InfoPopover";
import { IndicatorSearch, type SearchableRow } from "./IndicatorSearch";
import { ProgressBar } from "./ProgressBar";
import { VillageDetailButton } from "./VillageDetailButton";
import { formatNumber, formatPercent } from "./format";

/** Status labels of the CKD5 village dialog / person list (KPI 10). */
const CKD5_STATUS_LABELS = {
  screened: "รายใหม่",
  notScreened: "-",
  summary: { done: "รายใหม่", pending: "-" },
  dateHeader: "วันที่เป็นรายใหม่",
};

/** Definition summary shown in the (i) popover of KPI 10. */
const CKD5_DEFINITION =
  "รายใหม่ = ผู้ป่วย CKD ระยะ 5 (eGFR < 15) ที่ยืนยันความเรื้อรังอย่างน้อย 3 เดือน ไม่ใช่ AKI ไม่อยู่ระหว่างนอน รพ. และไม่ได้ฟอกไต · ร้อยละที่ลดลง = (B − A) / B × 100 เมื่อ A = รายใหม่ปีงบนี้ B = รายใหม่ปีงบก่อนหน้า (ทั้งปี)";

const disabledButtonClass =
  "inline-flex h-8 w-8 cursor-not-allowed items-center justify-center rounded-full bg-zinc-200 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-500";

function SummaryCard({
  icon,
  tone,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode;
  tone: string;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-surface p-3 shadow-sm dark:border-zinc-800">
      <span
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${tone}`}
      >
        {icon}
      </span>
      <div>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">{label}</p>
        <p className="text-base font-bold tabular-nums">{value}</p>
        {hint && (
          <p className="text-xs text-zinc-600 dark:text-zinc-400">{hint}</p>
        )}
      </div>
    </div>
  );
}

export function IndicatorTable({
  indicators,
  reduction,
  fiscalYear,
}: {
  indicators: ScreeningIndicator[];
  reduction: ReductionIndicator[];
  fiscalYear: number;
}) {
  // ตัวที่มีข้อมูลและโหลดสำเร็จเท่านั้น (ข้ามตัวที่ error)
  const measured = INDICATOR_ROWS.flatMap((row) => {
    const ind = row.code
      ? indicators.find((i) => i.code === row.code)
      : undefined;
    // ไม่มีกลุ่มเป้าหมาย (B = 0) ไม่นับเป็นผ่าน/ไม่ผ่าน
    return ind && !ind.error && ind.denominator > 0 ? [ind] : [];
  });
  // ข้อ 10 (ลดลงจากปีก่อน): นับผ่าน/ไม่ผ่านเมื่อมีปีก่อนเทียบ แต่ไม่รวมในร้อยละเฉลี่ย
  const measuredReduction = reduction.filter(
    (r) => !r.error && r.reductionPercent !== null,
  );
  const reductionPassed = measuredReduction.filter((r) =>
    meetsTarget(r.reductionPercent ?? 0, r.targetPercent, r.targetOperator),
  ).length;
  const pendingCount = INDICATOR_ROWS.filter(
    (row) =>
      !row.code ||
      !(
        indicators.some((i) => i.code === row.code) ||
        reduction.some((r) => r.code === row.code)
      ),
  ).length;
  const measuredCount = measured.length + measuredReduction.length;
  const passedCount =
    measured.filter((i) =>
      meetsTarget(i.percent, i.targetPercent, i.targetOperator),
    ).length + reductionPassed;
  const belowCount = measuredCount - passedCount;
  // ร้อยละเฉลี่ย: เฉพาะตัวที่ยิ่งสูงยิ่งดี (ข้อ 11 อัตราตาย ยิ่งต่ำยิ่งดี จึงไม่รวม)
  const averaged = measured.filter((i) => !isLowerBetter(i.targetOperator));
  const avg =
    averaged.length > 0
      ? averaged.reduce((s, i) => s + Math.min(100, i.percent), 0) /
        averaged.length
      : 0;

  function renderRow(row: IndicatorRowConfig) {
              if (row.code && isReductionCode(row.code)) {
                return renderReductionRow(
                  row,
                  reduction.find((r) => r.code === row.code),
                );
              }
              const accent = ACCENTS[row.accent];
              const ind = row.code
                ? indicators.find((i) => i.code === row.code)
                : undefined;
              const rowClass =
                "border-t border-zinc-200 odd:bg-surface even:bg-brand-50/60 hover:bg-brand-100/70 dark:border-zinc-800 dark:even:bg-brand-900/20 dark:hover:bg-brand-900/50";
              const details: InfoItem[] = [];
              if (ind && !ind.error) {
                details.push({
                  icon: <CalendarDays size={14} />,
                  label: "ช่วงเวลา",
                  value: ind.periodLabel,
                });
                details.push({
                  icon: <Target size={14} />,
                  label: "เกณฑ์",
                  value: `ร้อยละ ${targetOperatorSign(ind.targetOperator)} ${formatNumber(ind.targetPercent)}`,
                });
                if (ind.denominatorFactor !== 1) {
                  details.push({
                    icon: <Info size={14} />,
                    label: "กลุ่มเป้าหมายทั้งหมด",
                    value: `${ind.population} ${ind.ageRange} ${formatNumber(ind.eligible)} คน`,
                  });
                }
                if (ind.priorNumerator > 0) {
                  details.push({
                    icon: <CheckCircle2 size={14} />,
                    label: "สะสมจากปีก่อน",
                    value: `${formatNumber(ind.priorNumerator)} คน`,
                  });
                }
              }
              if (ind?.note) {
                details.push({
                  icon: <FileText size={14} />,
                  label: "หมายเหตุ",
                  value: ind.note,
                });
              }
              const titleCell = (
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-3">
                    <span
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${accent.iconBg}`}
                    >
                      <accent.Icon aria-hidden="true" className="h-4 w-4" />
                    </span>
                    <span className="text-sm">
                      <span className="block">{row.title}</span>
                      <span className="flex items-center gap-1 text-xs text-zinc-600 dark:text-zinc-400">
                        {row.subtitle}
                        {details.length > 0 && (
                          <InfoPopover
                            label={`รายละเอียดเพิ่มเติม ข้อ ${row.no}`}
                            title={row.title}
                            items={details}
                          />
                        )}
                      </span>
                    </span>
                  </div>
                </td>
              );
              const disabledButton = (
                <button
                  type="button"
                  disabled
                  aria-label={`ดูรายละเอียดรายหมู่บ้าน ข้อ ${row.no}`}
                  className={disabledButtonClass}
                >
                  <Search aria-hidden="true" size={16} />
                </button>
              );

              if (!ind || !row.code) {
                return (
                  <tr key={row.no} className={`${rowClass} opacity-70`}>
                    <td className="px-3 py-2.5 tabular-nums">{row.no}</td>
                    {titleCell}
                    <td className="px-3 py-2.5 text-right">—</td>
                    <td className="px-3 py-2.5 text-right">—</td>
                    <td className="px-3 py-2.5">
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900 dark:bg-amber-950 dark:text-amber-300">
                        <Clock aria-hidden="true" className="h-3.5 w-3.5" />
                        รอกำหนดนิยาม
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-center">{disabledButton}</td>
                  </tr>
                );
              }

              if (ind.error) {
                return (
                  <tr key={row.no} className={rowClass}>
                    <td className="px-3 py-2.5 tabular-nums">{row.no}</td>
                    {titleCell}
                    <td colSpan={3} className="px-3 py-2.5">
                      <span
                        role="alert"
                        className="inline-flex items-center gap-1.5 rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-800 dark:bg-red-950 dark:text-red-300"
                      >
                        <AlertTriangle
                          aria-hidden="true"
                          className="h-3.5 w-3.5"
                        />
                        ไม่สามารถดึงข้อมูลได้
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-center">{disabledButton}</td>
                  </tr>
                );
              }

              const noTarget = ind.denominator === 0;
              const passed =
                !noTarget &&
                meetsTarget(ind.percent, ind.targetPercent, ind.targetOperator);
              const StatusIcon = passed ? CheckCircle2 : XCircle;
              const meta = SCREENING_INDICATORS[row.code];
              // อัตราตาย (ยิ่งต่ำยิ่งดี): แสดง A/B คู่กับร้อยละ ไม่มีแถบ progress
              const lowerBetter = isLowerBetter(ind.targetOperator);
              return (
                <tr key={row.no} className={rowClass}>
                  <td className="px-3 py-2.5 tabular-nums">{row.no}</td>
                  {titleCell}
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {formatNumber(ind.denominator)}
                    {lowerBetter && (
                      <span className="block text-xs text-zinc-600 dark:text-zinc-400">
                        {meta.statusLabels.targetHeader}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {formatNumber(ind.numerator)}
                    {lowerBetter && (
                      <span className="block text-xs text-zinc-600 dark:text-zinc-400">
                        {meta.statusLabels.summary?.done}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className="w-16 text-right text-sm font-bold tabular-nums">
                        {noTarget ? "—" : formatPercent(ind.percent)}
                      </span>
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${
                          noTarget
                            ? "bg-zinc-200 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-300"
                            : passed
                              ? "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300"
                              : "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300"
                        }`}
                      >
                        {noTarget ? (
                          <Info aria-hidden="true" className="h-3.5 w-3.5" />
                        ) : (
                          <StatusIcon aria-hidden="true" className="h-3.5 w-3.5" />
                        )}
                        {noTarget ? "ยังไม่มีกลุ่มเป้าหมาย" : passed ? "ผ่าน" : "ไม่ผ่าน"}
                      </span>
                    </div>
                    {lowerBetter ? (
                      <span className="mt-1 block text-xs font-semibold tabular-nums">
                        {meta.statusLabels.summary?.done}{" "}
                        {formatNumber(ind.numerator)} /{" "}
                        {meta.statusLabels.targetHeader}{" "}
                        {formatNumber(ind.denominator)} ราย
                      </span>
                    ) : (
                      <div className="mt-2">
                        <ProgressBar
                          percent={ind.percent}
                          targetPercent={ind.targetPercent}
                          barClass={accent.bar}
                          label={`ร้อยละข้อ ${row.no}`}
                        />
                      </div>
                    )}
                    <span className="mt-1 block text-xs text-zinc-600 dark:text-zinc-400">
                      เกณฑ์ {targetOperatorSign(ind.targetOperator)} {formatNumber(ind.targetPercent)}%
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <VillageDetailButton
                      no={row.no}
                      code={row.code}
                      accent={row.accent}
                      title={row.title}
                      fiscalYear={fiscalYear}
                      targetPercent={ind.targetPercent}
                      targetOperator={ind.targetOperator}
                      periodLabel={ind.periodLabel}
                      denominatorFactor={ind.denominatorFactor}
                      statusLabels={meta.statusLabels}
                    />
                  </td>
                </tr>
              );
  }

  /** ข้อ 10: ร้อยละที่ลดลงจากปีงบก่อนหน้า (ยิ่งสูงยิ่งดี ไม่มีแถบ progress) */
  function renderReductionRow(
    row: IndicatorRowConfig,
    red: ReductionIndicator | undefined,
  ) {
    const accent = ACCENTS[row.accent];
    const rowClass =
      "border-t border-zinc-200 odd:bg-surface even:bg-brand-50/60 hover:bg-brand-100/70 dark:border-zinc-800 dark:even:bg-brand-900/20 dark:hover:bg-brand-900/50";
    const details: InfoItem[] = [];
    if (red && !red.error) {
      details.push({
        icon: <CalendarDays size={14} />,
        label: "ช่วงเวลา",
        value: red.periodLabel,
      });
      details.push({
        icon: <Target size={14} />,
        label: "เกณฑ์",
        value: `ร้อยละที่ลดลงจากปีก่อน ${targetOperatorSign(red.targetOperator)} ${formatNumber(red.targetPercent)}`,
      });
    }
    details.push({
      icon: <Info size={14} />,
      label: "นิยามโดยสรุป",
      value: CKD5_DEFINITION,
    });
    details.push({
      icon: <FileText size={14} />,
      label: "หมายเหตุ",
      value: red?.note ?? CKD5_INDICATOR.note,
    });
    const titleCell = (
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-3">
          <span
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${accent.iconBg}`}
          >
            <accent.Icon aria-hidden="true" className="h-4 w-4" />
          </span>
          <span className="text-sm">
            <span className="block">{row.title}</span>
            <span className="flex items-center gap-1 text-xs text-zinc-600 dark:text-zinc-400">
              {row.subtitle}
              <InfoPopover
                label={`รายละเอียดเพิ่มเติม ข้อ ${row.no}`}
                title={row.title}
                items={details}
              />
            </span>
          </span>
        </div>
      </td>
    );
    const disabledButton = (
      <button
        type="button"
        disabled
        aria-label={`ดูรายละเอียดรายหมู่บ้าน ข้อ ${row.no}`}
        className={disabledButtonClass}
      >
        <Search aria-hidden="true" size={16} />
      </button>
    );

    if (!red) {
      return (
        <tr key={row.no} className={`${rowClass} opacity-70`}>
          <td className="px-3 py-2.5 tabular-nums">{row.no}</td>
          {titleCell}
          <td className="px-3 py-2.5 text-right">—</td>
          <td className="px-3 py-2.5 text-right">—</td>
          <td className="px-3 py-2.5">
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900 dark:bg-amber-950 dark:text-amber-300">
              <Clock aria-hidden="true" className="h-3.5 w-3.5" />
              รอกำหนดนิยาม
            </span>
          </td>
          <td className="px-3 py-2.5 text-center">{disabledButton}</td>
        </tr>
      );
    }

    if (red.error) {
      return (
        <tr key={row.no} className={rowClass}>
          <td className="px-3 py-2.5 tabular-nums">{row.no}</td>
          {titleCell}
          <td colSpan={3} className="px-3 py-2.5">
            <span
              role="alert"
              className="inline-flex items-center gap-1.5 rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-800 dark:bg-red-950 dark:text-red-300"
            >
              <AlertTriangle aria-hidden="true" className="h-3.5 w-3.5" />
              ไม่สามารถดึงข้อมูลได้
            </span>
          </td>
          <td className="px-3 py-2.5 text-center">{disabledButton}</td>
        </tr>
      );
    }

    const percent = red.reductionPercent;
    const hasBase = percent !== null;
    const passed =
      hasBase && meetsTarget(percent, red.targetPercent, red.targetOperator);
    const increased = hasBase && percent < 0;
    const StatusIcon = passed ? CheckCircle2 : XCircle;
    return (
      <tr key={row.no} className={rowClass}>
        <td className="px-3 py-2.5 tabular-nums">{row.no}</td>
        {titleCell}
        <td className="px-3 py-2.5 text-right tabular-nums">
          {targetOperatorSign(red.targetOperator)} {formatNumber(red.targetPercent)}% (ลดลง)
        </td>
        <td className="px-3 py-2.5 text-right tabular-nums">
          <span className="block">
            รายใหม่ปีนี้ {formatNumber(red.currentCases)} คน / ปีก่อน{" "}
            {formatNumber(red.previousCases)} คน
          </span>
          <span className="block text-xs text-zinc-600 dark:text-zinc-400">
            ช่วงเดียวกันปีก่อน {formatNumber(red.previousSamePeriod)} คน
          </span>
        </td>
        <td className="px-3 py-2.5">
          <div className="flex items-center gap-2">
            <span className="min-w-16 text-right text-sm font-bold tabular-nums">
              {!hasBase
                ? "—"
                : increased
                  ? `เพิ่มขึ้น ${formatPercent(Math.abs(percent))}%`
                  : `${formatPercent(percent)}%`}
            </span>
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${
                !hasBase
                  ? "bg-zinc-200 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-300"
                  : passed
                    ? "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300"
                    : "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300"
              }`}
            >
              {hasBase ? (
                <StatusIcon aria-hidden="true" className="h-3.5 w-3.5" />
              ) : (
                <Info aria-hidden="true" className="h-3.5 w-3.5" />
              )}
              {!hasBase ? "ไม่มีปีก่อนเทียบ" : passed ? "ผ่าน" : "ไม่ผ่าน"}
            </span>
          </div>
          <span className="mt-1 block text-xs text-zinc-600 dark:text-zinc-400">
            เกณฑ์ {targetOperatorSign(red.targetOperator)} {formatNumber(red.targetPercent)}% (ลดลงจากปีงบก่อน)
          </span>
        </td>
        <td className="px-3 py-2.5 text-center">
          <VillageDetailButton
            no={row.no}
            code={red.code}
            accent={row.accent}
            title={row.title}
            fiscalYear={fiscalYear}
            targetPercent={red.targetPercent}
            targetOperator={red.targetOperator}
            periodLabel={red.periodLabel}
            denominatorFactor={1}
            statusLabels={CKD5_STATUS_LABELS}
          />
        </td>
      </tr>
    );
  }

  const rows: SearchableRow[] = INDICATOR_ROWS.map((row) => ({
    no: row.no,
    code: row.code,
    keywords: [
      `ข้อ ${row.no}`,
      row.title,
      row.subtitle,
      row.code ?? "",
      ...row.keywords,
    ].join(" "),
    node: renderRow(row),
  }));

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <SummaryCard
          icon={<CheckCircle2 aria-hidden="true" className="h-4 w-4" />}
          tone="bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300"
          label="ผ่านเกณฑ์"
          value={`${formatNumber(passedCount)} / ${formatNumber(measuredCount)}`}
          hint="ตัวชี้วัดที่มีข้อมูล"
        />
        <SummaryCard
          icon={<TrendingUp aria-hidden="true" className="h-4 w-4" />}
          tone="bg-brand-100 text-brand-800 dark:bg-brand-900 dark:text-brand-200"
          label="ร้อยละเฉลี่ย"
          value={`${formatPercent(avg)}%`}
          hint="เฉลี่ยจากตัวชี้วัดที่มีข้อมูล (สูงสุดข้อละ 100)"
        />
        {pendingCount > 0 ? (
          <SummaryCard
            icon={<Clock aria-hidden="true" className="h-4 w-4" />}
            tone="bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300"
            label="รอกำหนดนิยาม"
            value={formatNumber(pendingCount)}
            hint="ตัวชี้วัดที่ยังไม่มีข้อมูล"
          />
        ) : (
          <SummaryCard
            icon={<XCircle aria-hidden="true" className="h-4 w-4" />}
            tone="bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300"
            label="ต่ำกว่าเกณฑ์"
            value={`${formatNumber(belowCount)} / ${formatNumber(measuredCount)}`}
            hint="ตัวชี้วัดที่ยังไม่ถึงเกณฑ์"
          />
        )}
      </div>

      <IndicatorSearch rows={rows} fiscalYear={fiscalYear} />
    </div>
  );
}
