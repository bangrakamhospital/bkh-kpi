import { CircleAlert, CircleCheck, TriangleAlert, Wrench } from "lucide-react";
import type { F43CheckResult, F43FileResult } from "@/lib/kpi/f43-types";
import { ClinicPanel } from "../clinic/ClinicPanel";
import { formatNumber, formatPercent } from "../format";
import { InfoPopover } from "../InfoPopover";
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
import { F43Chip, type F43Tone, FILE_STATUS } from "./f43-ui";

function checkTone(c: F43CheckResult): F43Tone {
  if (c.failed === 0) return "pass";
  return c.severity === "error" ? "error" : "warn";
}

const TONE_LABEL: Record<F43Tone, string> = { pass: "ผ่าน", warn: "เตือน", error: "ผิด", muted: "" };

function passPercent(total: number | null, failed: number): string {
  if (!total) return "–";
  return `${formatPercent(Math.max(0, ((total - failed) / total) * 100))}%`;
}

function ToneIcon({ tone }: { tone: F43Tone }) {
  if (tone === "error") return <CircleAlert aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-600 dark:text-red-400" />;
  if (tone === "warn") return <TriangleAlert aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />;
  return <CircleCheck aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />;
}

/** Popover text of one check (what / severity / where to fix). */
export function CheckInfo({ c, groupLabel }: { c: F43CheckResult; groupLabel: string }) {
  return (
    <InfoPopover
      label={`คำอธิบาย: ${c.label}`}
      title={c.label}
      items={[
        { label: "ตรวจอะไร", value: c.what },
        {
          label: "ระดับ",
          value:
            c.severity === "error"
              ? `ร้ายแรง — ${groupLabel} ปฏิเสธ/แจ้ง error ต้องแก้ก่อนส่ง`
              : "เตือน — ส่งได้ แต่ควรแก้เพื่อให้ข้อมูลถูกต้อง",
        },
        { icon: <Wrench size={12} />, label: "แก้ที่ HOSxP", value: c.fix },
      ]}
    />
  );
}

/** Checks of one file (most failed first) with pass % and status. */
export function F43FileDetail({ f }: { f: F43FileResult }) {
  const st = FILE_STATUS[f.status];
  const groupLabel = f.group === "fdh" ? "FDH" : "HDC";
  const hasData = f.total !== null && f.total > 0;
  return (
    <ClinicPanel
      title={`${f.group === "fdh" ? "FDH OP · " : ""}${f.label} — ${f.name}`}
      note={f.note}
    >
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
        <F43Chip tone={st.tone}>{st.label}</F43Chip>
        {f.total !== null && (
          <span>
            ตรวจ <span className="font-semibold tabular-nums">{formatNumber(f.total)}</span> {f.unitLabel}
          </span>
        )}
        {hasData && (
          <>
            <span className="text-red-700 dark:text-red-300">
              ผิดร้ายแรง <span className="font-semibold tabular-nums">{formatNumber(f.errorFailed)}</span>
            </span>
            <span className="text-amber-700 dark:text-amber-300">
              เตือน <span className="font-semibold tabular-nums">{formatNumber(f.warnFailed)}</span>
            </span>
          </>
        )}
      </div>

      {f.status === "unsupported" && <p className={`mt-3 text-xs ${mutedClass}`}>แฟ้มนี้ยังไม่มีรายการตรวจ — {f.note}</p>}
      {f.status === "na" && (
        <p className={`mt-3 text-xs ${mutedClass}`}>
          แฟ้มนี้แยกตามหน่วยบริการไม่ได้ (ไม่มี visit หรือเป็นผู้ป่วยใน) เลือก &quot;ทุกหน่วยบริการ&quot; หรือ &quot;ผู้ป่วยใน&quot; เพื่อดูผลตรวจ
        </p>
      )}
      {f.status === "empty" && <p className={`mt-3 text-xs ${mutedClass}`}>ไม่มีข้อมูลของแฟ้มนี้ในช่วงวันที่และหน่วยบริการที่เลือก</p>}

      {hasData && (
        <div className="mt-3 overflow-x-auto">
          <table className={`${tableClass} min-w-[40rem]`}>
            <thead className={theadClass}>
              <tr>
                <th scope="col" className={thClass}>รายการตรวจ</th>
                <th scope="col" className={thRightClass}>จำนวนผิด</th>
                <th scope="col" className={thRightClass}>% ผ่าน</th>
                <th scope="col" className={thClass}>ระดับ</th>
                <th scope="col" className={thClass}>สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {f.checks.map((c) => {
                const tone = checkTone(c);
                return (
                  <tr key={c.id} className={trClass}>
                    <td className={tdClass}>
                      <span className="inline-flex items-start gap-1.5">
                        <ToneIcon tone={tone} />
                        <span>{c.label}</span>
                        <CheckInfo c={c} groupLabel={groupLabel} />
                      </span>
                    </td>
                    <td
                      className={`${tdRightClass} ${
                        tone === "error"
                          ? "font-semibold text-red-700 dark:text-red-300"
                          : tone === "warn"
                            ? "font-semibold text-amber-700 dark:text-amber-300"
                            : ""
                      }`}
                    >
                      {formatNumber(c.failed)}
                    </td>
                    <td className={tdRightClass}>{passPercent(f.total, c.failed)}</td>
                    <td className={`${tdClass} ${mutedClass}`}>{c.severity === "error" ? "ร้ายแรง" : "เตือน"}</td>
                    <td className={tdClass}>
                      <F43Chip tone={tone}>{TONE_LABEL[tone]}</F43Chip>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </ClinicPanel>
  );
}
