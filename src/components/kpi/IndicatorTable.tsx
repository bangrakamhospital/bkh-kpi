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
import type { ScreeningCode, ScreeningIndicator } from "@/lib/kpi/types";
import {
  meetsTarget,
  SCREENING_INDICATORS,
  targetOperatorSign,
} from "@/lib/kpi/screening-indicators";
import { ACCENTS, type AccentKey } from "./indicator-theme";
import { InfoPopover, type InfoItem } from "./InfoPopover";
import { IndicatorSearch, type SearchableRow } from "./IndicatorSearch";
import { ProgressBar } from "./ProgressBar";
import { VillageDetailButton } from "./VillageDetailButton";
import { formatNumber, formatPercent } from "./format";

interface IndicatorRowConfig {
  no: number;
  /** ชื่อหลัก (บรรทัดรองมาจากข้อมูลของ indicator) */
  title: string;
  /** กลุ่มเป้าหมาย + อายุ แบบสั้น (บรรทัดรอง) */
  subtitle: string;
  /** คำพ้อง/คำค้นเพิ่มเติม */
  keywords: string[];
  accent: AccentKey;
  /** ชื่อกลุ่ม (แถวหัวกลุ่มในตาราง) — แถวของกลุ่มเดียวกันต้องอยู่ติดกัน */
  group?: string;
  /** undefined = ยังไม่มีข้อมูล/นิยาม */
  code?: ScreeningCode;
}

const HDC_GROUP = "ตัวชี้วัด HDC";

/** เพิ่มตัวชี้วัดใหม่ที่นี่ (ไม่ใส่ code = แสดงเป็นรอกำหนดนิยาม) */
const INDICATOR_ROWS: IndicatorRowConfig[] = [
  { no: 1, code: "DM", accent: "dm", title: "คัดกรองเบาหวาน", subtitle: "ประชาชนอายุ 35 ปีขึ้นไป", keywords: ["เบาหวาน","DM","diabetes"] },
  { no: 2, code: "HT", accent: "ht", title: "คัดกรองความดันโลหิตสูง", subtitle: "ประชาชนอายุ 35 ปีขึ้นไป", keywords: ["ความดัน","HT","ความดันโลหิตสูง"] },
  { no: 3, code: "CX", accent: "cervix", title: "คัดกรองมะเร็งปากมดลูก", subtitle: "หญิงไทย 30–60 ปี", keywords: ["ปากมดลูก","HPV","Pap","มะเร็ง","CA cervix"] },
  { no: 4, code: "BR", accent: "breast", title: "คัดกรองมะเร็งเต้านม", subtitle: "หญิง 40–70 ปี", keywords: ["เต้านม","CBE","มะเร็ง","breast"] },
  // กลุ่ม HDC: เพิ่มข้อใหม่ต่อในกลุ่มนี้โดยใส่ group: HDC_GROUP (เรียงตามเลข HDC)
  { no: 2.1, group: HDC_GROUP, code: "DMC", accent: "confirmDm", title: "ยืนยันวินิจฉัยกลุ่มสงสัยป่วยเบาหวาน", subtitle: "ประชาชนไทยอายุ 35 ปีขึ้นไป กลุ่มสงสัยป่วย", keywords: ["เบาหวาน","ยืนยัน","สงสัยป่วย","FPG","DM","HDC","diabetes"] },
  { no: 2.2, group: HDC_GROUP, code: "HTC", accent: "confirmHt", title: "ยืนยันวินิจฉัยกลุ่มสงสัยป่วยความดันโลหิตสูง", subtitle: "ประชาชนไทยอายุ 35 ปีขึ้นไป กลุ่มสงสัยป่วย", keywords: ["ความดัน","ความดันโลหิตสูง","ยืนยัน","สงสัยป่วย","OBPM","HT","HDC"] },
  { no: 11.3, group: HDC_GROUP, code: "RLU_HBA1C", accent: "hba1c", title: "ผู้ป่วยเบาหวานได้รับการตรวจ HbA1c", subtitle: "ผู้ป่วยในทะเบียนคลินิกเบาหวาน", keywords: ["HbA1c","เบาหวาน","lab","RLU","HDC","diabetes"] },
  { no: 11.4, group: HDC_GROUP, code: "RLU_LDL", accent: "ldl", title: "ผู้ป่วยเบาหวานได้รับการตรวจ LDL", subtitle: "ผู้ป่วยในทะเบียนคลินิกเบาหวาน", keywords: ["LDL","ไขมัน","เบาหวาน","lab","RLU","HDC"] },
  { no: 11.5, group: HDC_GROUP, code: "RLU_CR", accent: "creatinine", title: "ผู้ป่วยเบาหวานได้รับการตรวจ Creatinine", subtitle: "ผู้ป่วยในทะเบียนคลินิกเบาหวาน", keywords: ["Creatinine","ครีเอตินีน","ไต","เบาหวาน","lab","RLU","HDC"] },
];

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
  fiscalYear,
}: {
  indicators: ScreeningIndicator[];
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
  const pendingCount = INDICATOR_ROWS.filter(
    (row) => !row.code || !indicators.some((i) => i.code === row.code),
  ).length;
  const passedCount = measured.filter((i) =>
    meetsTarget(i.percent, i.targetPercent, i.targetOperator),
  ).length;
  const belowCount = measured.length - passedCount;
  const avg =
    measured.length > 0
      ? measured.reduce((s, i) => s + Math.min(100, i.percent), 0) /
        measured.length
      : 0;

  function renderRow(row: IndicatorRowConfig) {
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
              return (
                <tr key={row.no} className={rowClass}>
                  <td className="px-3 py-2.5 tabular-nums">{row.no}</td>
                  {titleCell}
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {formatNumber(ind.denominator)}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {formatNumber(ind.numerator)}
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
                    <div className="mt-2">
                      <ProgressBar
                        percent={ind.percent}
                        targetPercent={ind.targetPercent}
                        barClass={accent.bar}
                        label={`ร้อยละข้อ ${row.no}`}
                      />
                    </div>
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

  const rows: SearchableRow[] = INDICATOR_ROWS.map((row) => ({
    no: row.no,
    group: row.group,
    keywords: [
      `ข้อ ${row.no}`,
      row.title,
      row.subtitle,
      row.code ?? "",
      row.group ?? "",
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
          value={`${formatNumber(passedCount)} / ${formatNumber(measured.length)}`}
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
            value={`${formatNumber(belowCount)} / ${formatNumber(measured.length)}`}
            hint="ตัวชี้วัดที่ยังไม่ถึงเกณฑ์"
          />
        )}
      </div>

      <IndicatorSearch rows={rows} fiscalYear={fiscalYear} />
    </div>
  );
}
