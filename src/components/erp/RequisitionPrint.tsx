"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, Printer } from "lucide-react";
import type { DocEvent, RequisitionDetail } from "@/lib/erp/types";
import { fmtCost, fmtDateTime, fmtMoney, fmtQty, useErpGet } from "./erp-client";
import { issuedShortCount } from "./RequisitionDetailClient";
import { btnOutline, btnPrimary, cardCls, ErrorCard, iconCls, LoadingCard } from "./ui";

const HOSPITAL_NAME = "โรงพยาบาลบางระกำ";

/** Hides the site header/tabs and page chrome when printing on A4. */
const PRINT_CSS = `
@page { size: A4; margin: 12mm; }
@media print {
  header, footer, nav { display: none !important; }
  main { margin: 0 !important; max-width: none !important; padding: 0 !important; }
  body { background: #fff !important; color: #000 !important; }
}
`;

/** /erp/requisitions/print?id= */
export function RequisitionPrint() {
  const params = useSearchParams();
  const id = Number(params.get("id")) || null;
  const detail = useErpGet<RequisitionDetail>(id ? `/api/erp/requisitions/${id}` : null);

  if (!id) return <div className={`${cardCls} text-xs`}>ไม่พบใบเบิก</div>;
  if (detail.error) return <ErrorCard error={detail.error} onRetry={detail.reload} />;
  if (!detail.data) return <LoadingCard />;
  return <Sheet d={detail.data} />;
}

function lastEvent(events: DocEvent[], action: string): DocEvent | undefined {
  return events.filter((e) => e.action === action).at(-1);
}

function Sheet({ d }: { d: RequisitionDetail }) {
  const submit = lastEvent(d.events, "submit");
  const requester = { name: submit?.actorName ?? d.createdByName, at: submit?.createdAt ?? d.createdAt };
  const approve = lastEvent(d.events, "approve");
  const approver = approve
    ? { name: approve.actorName, at: approve.createdAt }
    : d.status === "approved" || d.status === "issued"
      ? { name: d.decidedByName, at: d.decidedAt }
      : null;
  const issue = lastEvent(d.events, "issue");
  const issuer = issue
    ? { name: issue.actorName, at: issue.createdAt }
    : d.status === "issued"
      ? { name: d.completedByName, at: d.completedAt }
      : null;
  const total = d.lines.reduce((sum, l) => sum + (l.amount ?? 0), 0);
  const hasAmount = d.lines.some((l) => l.amount !== null);
  const cell = "border border-zinc-400 px-2 py-1";

  return (
    <div className="space-y-4">
      <style>{PRINT_CSS}</style>
      <div className="flex flex-wrap gap-2 print:hidden">
        <Link href={`/erp/requisitions/view?id=${d.id}`} className={btnOutline}>
          <ArrowLeft aria-hidden="true" className={iconCls} />
          กลับ
        </Link>
        <button type="button" className={btnPrimary} onClick={() => window.print()}>
          <Printer aria-hidden="true" className={iconCls} />
          พิมพ์
        </button>
      </div>

      <article className="mx-auto w-full max-w-[210mm] space-y-4 rounded-xl border border-zinc-200 bg-white p-6 text-sm text-black print:max-w-none print:rounded-none print:border-0 print:p-0">
        <div className="text-center">
          <p className="text-base font-bold">{HOSPITAL_NAME}</p>
          <h2 className="text-base font-bold">ใบเบิกพัสดุ</h2>
        </div>

        <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
          <Info label="เลขที่" value={d.docNo ?? `ร่าง #${d.id}`} />
          <Info label="วันที่" value={fmtDateTime(d.submittedAt ?? d.createdAt)} />
          <Info label="หน่วยงานผู้เบิก" value={d.orgUnitName} />
          <Info label="เบิกจากคลัง" value={d.storeName} />
          {d.purpose && (
            <div className="col-span-2">
              <Info label="วัตถุประสงค์" value={d.purpose} />
            </div>
          )}
        </dl>

        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="bg-zinc-100 print:bg-transparent">
              <th scope="col" className={`${cell} w-10`}>ลำดับ</th>
              <th scope="col" className={cell}>รหัส</th>
              <th scope="col" className={cell}>ชื่อพัสดุ</th>
              <th scope="col" className={cell}>หน่วยนับ</th>
              <th scope="col" className={`${cell} text-right`}>จำนวนขอ</th>
              <th scope="col" className={`${cell} text-right`}>อนุมัติ</th>
              <th scope="col" className={`${cell} text-right`}>จ่าย</th>
              <th scope="col" className={`${cell} text-right`}>ราคา/หน่วย</th>
              <th scope="col" className={`${cell} text-right`}>มูลค่า</th>
            </tr>
          </thead>
          <tbody>
            {d.lines.map((l) => (
              <tr key={l.id} className="break-inside-avoid">
                <td className={`${cell} text-center tabular-nums`}>{l.lineNo}</td>
                <td className={cell}>{l.itemCode}</td>
                <td className={cell}>
                  {l.itemName}
                  {l.note && <span className="block text-xs text-zinc-600">{l.note}</span>}
                </td>
                <td className={cell}>{l.unit}</td>
                <td className={`${cell} text-right tabular-nums`}>{fmtQty(l.qty)}</td>
                <td className={`${cell} text-right tabular-nums`}>{fmtQty(l.qtyApproved)}</td>
                <td className={`${cell} text-right tabular-nums`}>{fmtQty(l.qtyIssued)}</td>
                <td className={`${cell} text-right tabular-nums`}>{fmtCost(l.unitCost)}</td>
                <td className={`${cell} text-right tabular-nums`}>{fmtMoney(l.amount)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="font-semibold">
              <td colSpan={8} className={`${cell} text-right`}>รวมมูลค่า (บาท)</td>
              <td className={`${cell} text-right tabular-nums`}>{hasAmount ? fmtMoney(total) : "-"}</td>
            </tr>
          </tfoot>
        </table>
        {d.status === "issued" && issuedShortCount(d) > 0 && (
          <p className="text-xs">
            หมายเหตุ: จ่ายไม่ครบ {issuedShortCount(d)} รายการ ส่วนที่ขาดไม่ถูกค้างจ่าย หากยังต้องการให้เบิกใหม่
          </p>
        )}

        <div className="grid grid-cols-3 gap-4 pt-6 text-center text-xs break-inside-avoid">
          <Signature role="ผู้เบิก" who={requester} />
          <Signature role="ผู้อนุมัติ" who={approver} />
          <Signature role="ผู้จ่าย" who={issuer} />
        </div>
      </article>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="inline font-semibold">{label}: </dt>
      <dd className="inline whitespace-pre-line">{value}</dd>
    </div>
  );
}

function Signature({ role, who }: { role: string; who: { name: string | null; at: string | null } | null }) {
  return (
    <div className="space-y-1">
      <div className="h-12 border-b border-dotted border-zinc-500" />
      <p>({who?.name ?? "..........................................."})</p>
      <p className="font-semibold">{role}</p>
      <p>วันที่ {who?.at ? fmtDateTime(who.at) : "............................"}</p>
    </div>
  );
}
