import type { DiseaseGroupRanking, DiseaseGroups } from "@/lib/kpi/overview-types";
import { formatNumber } from "../format";
import { ChartCard } from "./ChartCard";
import {
  tableClass,
  tdClass,
  tdRightClass,
  theadClass,
  thClass,
  thRightClass,
  trClass,
} from "./table-styles";

const TOP_N = 10;
const pct1 = new Intl.NumberFormat("th-TH", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

function DiseaseGroupCard({
  title,
  source,
  unit,
  ranking,
  unclassifiedNote,
}: {
  title: string;
  source: string;
  unit: string;
  ranking: DiseaseGroupRanking;
  unclassifiedNote: string;
}) {
  const rows = ranking.groups.slice(0, TOP_N);
  const total = ranking.classified;
  const max = rows.reduce((m, r) => Math.max(m, r.count), 0);
  const pct = (v: number) => (total > 0 ? (v / total) * 100 : 0);

  const note = (
    <p className="mt-3 text-xs text-zinc-600 dark:text-zinc-400">
      {source} · ร้อยละคิดจาก {formatNumber(total)} {unit} ที่จัดกลุ่มได้
      {ranking.unclassified > 0 && (
        <>
          {" "}· ไม่จัดกลุ่ม {formatNumber(ranking.unclassified)} {unit} ({unclassifiedNote})
        </>
      )}
      {ranking.uncoded > 0 && (
        <>
          {" "}· ยังไม่ลงวินิจฉัยหลัก {formatNumber(ranking.uncoded)} {unit}
        </>
      )}
    </p>
  );
  const hasNote = ranking.unclassified > 0 || ranking.uncoded > 0;

  const chart =
    rows.length === 0 ? (
      <>
        <p className="py-6 text-center text-xs text-zinc-600 dark:text-zinc-400">ไม่มีข้อมูล</p>
        {hasNote && note}
      </>
    ) : (
      <>
        <ol aria-label={`${TOP_N} อันดับ ${title}`} className="space-y-2">
          {rows.map((r, i) => (
            <li key={r.code} className="flex items-start gap-2 text-xs">
              <span
                aria-hidden="true"
                className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-50 font-semibold tabular-nums text-brand-800 dark:bg-brand-900 dark:text-brand-100"
              >
                {i + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="truncate" title={`${r.name} (${r.icd})`}>
                    <span className="sr-only">อันดับ {i + 1} </span>
                    {r.name}
                  </span>
                  <span className="shrink-0 tabular-nums">
                    {formatNumber(r.count)} · {pct1.format(pct(r.count))}%
                  </span>
                </span>
                <span className="block truncate text-zinc-500 dark:text-zinc-400" title={r.icd}>
                  {r.icd}
                </span>
                <span className="mt-0.5 block h-2 rounded-sm bg-zinc-100 dark:bg-zinc-800">
                  <span
                    className="block h-full rounded-sm bg-emerald-500 dark:bg-emerald-500/80"
                    style={{ width: `${max > 0 ? (r.count / max) * 100 : 0}%` }}
                  />
                </span>
              </span>
            </li>
          ))}
        </ol>
        {note}
      </>
    );

  const table = (
    <>
      <table className={tableClass}>
        <caption className="sr-only">{`${TOP_N} อันดับ ${title}`}</caption>
        <thead className={theadClass}>
          <tr>
            <th scope="col" className={thRightClass}>อันดับ</th>
            <th scope="col" className={thClass}>กลุ่มโรค</th>
            <th scope="col" className={thClass}>ICD-10</th>
            <th scope="col" className={thRightClass}>{unit}</th>
            <th scope="col" className={thRightClass}>ร้อยละ</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr className={trClass}>
              <td colSpan={5} className={`${tdClass} text-center text-zinc-600 dark:text-zinc-400`}>
                ไม่มีข้อมูล
              </td>
            </tr>
          ) : (
            rows.map((r, i) => (
              <tr key={r.code} className={trClass}>
                <td className={tdRightClass}>{i + 1}</td>
                <th scope="row" className={`${tdClass} text-left font-normal`}>{r.name}</th>
                <td className={`${tdClass} text-zinc-600 dark:text-zinc-400`}>{r.icd}</td>
                <td className={tdRightClass}>{formatNumber(r.count)}</td>
                <td className={tdRightClass}>{pct1.format(pct(r.count))}%</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
      {note}
    </>
  );

  return (
    <ChartCard
      title={title}
      badge={`${formatNumber(total)} ${unit}`}
      chart={chart}
      table={table}
    />
  );
}

/** Top 10 disease groups: OPD (รง.504) and IPD discharges (รง.505), side by side. */
export function DiseaseGroupTop({ groups }: { groups: DiseaseGroups }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <DiseaseGroupCard
        title="10 อันดับกลุ่มโรค ผู้ป่วยนอก"
        source="กลุ่มโรค รง.504 ตามวินิจฉัยหลัก (วันที่รับบริการ)"
        unit="ครั้ง"
        ranking={groups.opd}
        unclassifiedNote="รหัส Z ตรวจสุขภาพ/รับวัคซีน/ติดตามอาการ, รหัส U ฯลฯ"
      />
      <DiseaseGroupCard
        title="10 อันดับกลุ่มโรค ผู้ป่วยใน"
        source="กลุ่มโรค รง.505 ตามวินิจฉัยหลัก (วันที่จำหน่าย)"
        unit="ครั้ง"
        ranking={groups.ipd}
        unclassifiedNote="รหัส Z, มะเร็งอวัยวะอื่น ฯลฯ"
      />
    </div>
  );
}
