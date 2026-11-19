import Link from "next/link";
import type { F43Counts, F43Group, F43StaffRow, F43UnitRow } from "@/lib/kpi/f43-types";
import { ClinicPanel } from "../clinic/ClinicPanel";
import { formatNumber } from "../format";
import {
  tableClass,
  tdClass,
  tdRightClass,
  theadClass,
  thClass,
  thRightClass,
  trClass,
} from "../overview/table-styles";
import { F43Chip } from "./f43-ui";

const errClass = (n: number) => (n > 0 ? "font-semibold text-red-700 dark:text-red-300" : "");
const warnClass = (n: number) => (n > 0 ? "text-amber-700 dark:text-amber-300" : "");

function CountCells({ c }: { c: F43Counts }) {
  return (
    <>
      <td className={`${tdRightClass} ${errClass(c.errorFailed)}`}>{formatNumber(c.errorFailed)}</td>
      <td className={`${tdRightClass} ${warnClass(c.warnFailed)}`}>{formatNumber(c.warnFailed)}</td>
    </>
  );
}

/**
 * Comparison of service units, most errors first. `groups` = the count
 * columns shown (overview: HDC + FDH; file view: that file's group).
 */
export function F43UnitTable({
  rows,
  selected,
  hrefFor,
  groups,
  title,
}: {
  rows: readonly F43UnitRow[];
  selected: string;
  hrefFor: (unit: string) => string;
  groups: readonly F43Group[];
  title: string;
}) {
  return (
    <ClinicPanel
      title={title}
      note="หน่วยบริการ = แผนก/จุดบริการหลักของ visit (ovst.main_dep) · ผู้ป่วยในรวมเป็นหน่วย IPD · แฟ้มที่ไม่มี visit (DEATH, CHRONIC, NCDSCREEN, NEWBORNCARE, COMMUNITY_ACTIVITY) ไม่แยกหน่วย · กดชื่อหน่วยเพื่อเลือก"
    >
      {rows.length === 0 ? (
        <p className="mt-3 text-xs">ไม่มีข้อมูลแยกหน่วยบริการ</p>
      ) : (
        <div className="mt-3 max-h-[28rem] overflow-auto">
          <table className={`${tableClass} min-w-[32rem]`}>
            <thead className={`${theadClass} sticky top-0`}>
              <tr>
                <th scope="col" className={thClass}>หน่วยบริการ</th>
                {groups.flatMap((g) => [
                  <th key={`${g}-e`} scope="col" className={thRightClass}>
                    {g === "hdc" ? "HDC" : "FDH"} ผิด
                  </th>,
                  <th key={`${g}-w`} scope="col" className={thRightClass}>
                    {g === "hdc" ? "HDC" : "FDH"} เตือน
                  </th>,
                ])}
                <th scope="col" className={thClass}>สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((u) => {
                const ready = groups.every((g) => u[g].errorFailed === 0);
                return (
                  <tr
                    key={u.code}
                    className={`${trClass} ${u.code === selected ? "bg-brand-50 dark:bg-brand-900/30" : ""}`}
                  >
                    <th scope="row" className={`${tdClass} text-left font-normal`}>
                      <Link
                        href={hrefFor(u.code)}
                        className="text-brand-700 underline-offset-2 hover:underline dark:text-brand-300"
                      >
                        {u.name}
                      </Link>
                    </th>
                    {groups.map((g) => (
                      <CountCells key={g} c={u[g]} />
                    ))}
                    <td className={tdClass}>
                      <F43Chip tone={ready ? "pass" : "error"}>{ready ? "พร้อมส่ง" : "ยังไม่พร้อม"}</F43Chip>
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

/** Recorders with the most problems (staff names, no patient data). */
export function F43StaffTable({ rows, note }: { rows: readonly F43StaffRow[]; note: string }) {
  return (
    <ClinicPanel title="แยกตามผู้บันทึก" note={note}>
      {rows.length === 0 ? (
        <p className="mt-3 text-xs">ไม่พบรายการผิดที่ระบุผู้บันทึกได้</p>
      ) : (
        <div className="mt-3 max-h-[28rem] overflow-auto">
          <table className={`${tableClass} min-w-[32rem]`}>
            <thead className={`${theadClass} sticky top-0`}>
              <tr>
                <th scope="col" className={thClass}>ผู้บันทึก</th>
                <th scope="col" className={thRightClass}>ผิดร้ายแรง</th>
                <th scope="col" className={thRightClass}>เตือน</th>
                <th scope="col" className={thClass}>แฟ้มที่ต้องแก้มากที่สุด</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s, i) => (
                <tr key={`${s.name}-${i}`} className={trClass}>
                  <th scope="row" className={`${tdClass} text-left font-normal`}>
                    {s.name}
                    <span className="block text-xs text-zinc-600 dark:text-zinc-400">{s.role}</span>
                  </th>
                  <CountCells c={s} />
                  <td className={tdClass}>{s.top.join(" · ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </ClinicPanel>
  );
}

/** Recorder column meaning per file (shared note text). */
export const STAFF_NOTE =
  "ผู้บันทึก: SERVICE/ACCIDENT/CHRONICFU = ผู้ลงทะเบียนส่งตรวจ, DIAGNOSIS = ผู้ลงรหัส, DRUG/CHARGE/ADP = ผู้คีย์รายการ, APPOINTMENT = ผู้ออกนัด, EPI = ผู้ลงวัคซีน, LABFU = ผู้ลงผล, IPD = ผู้บันทึก AN, DENTAL/SPECIALPP/NUTRITION/REHABILITATION/REFER = ผู้ให้บริการ · PERSON, PROVIDER, ANC, FP, DRUGALLERGY ไม่มีข้อมูลผู้บันทึก · แสดง 30 คนแรก";
