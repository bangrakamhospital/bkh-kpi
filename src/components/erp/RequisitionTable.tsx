"use client";

import Link from "next/link";
import type { RequisitionSummary } from "@/lib/erp/types";
import { fmtDateTime, fmtMoney } from "./erp-client";
import { EmptyRow, StatusBadge, tableCls, tableWrapCls, tdCls, theadCls, thCls } from "./ui";

export function requisitionHref(id: number): string {
  return `/erp/requisitions/view?id=${id}`;
}

/** Requisition list table (home page + /erp/requisitions). */
export function RequisitionTable({
  items,
  empty = "ไม่มีใบเบิก",
}: {
  items: RequisitionSummary[];
  empty?: string;
}) {
  return (
    <div className={tableWrapCls}>
      <table className={tableCls}>
        <thead className={theadCls}>
          <tr>
            <th scope="col" className={thCls}>เลขที่</th>
            <th scope="col" className={thCls}>หน่วยงาน</th>
            <th scope="col" className={thCls}>คลัง</th>
            <th scope="col" className={`${thCls} text-right`}>รายการ</th>
            <th scope="col" className={`${thCls} text-right`}>มูลค่าจ่าย (บาท)</th>
            <th scope="col" className={thCls}>ผู้สร้าง</th>
            <th scope="col" className={thCls}>อัปเดตล่าสุด</th>
            <th scope="col" className={thCls}>สถานะ</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
          {items.length === 0 ? (
            <EmptyRow colSpan={8}>{empty}</EmptyRow>
          ) : (
            items.map((r) => (
              <tr key={r.id} className="hover:bg-brand-50/50 dark:hover:bg-brand-900/20">
                <td className={tdCls}>
                  <Link
                    href={requisitionHref(r.id)}
                    className="font-medium text-brand-700 underline-offset-2 hover:underline dark:text-brand-300"
                  >
                    {r.docNo ?? `ร่าง #${r.id}`}
                  </Link>
                  {r.purpose && (
                    <p className="max-w-56 truncate text-zinc-500 dark:text-zinc-400" title={r.purpose}>
                      {r.purpose}
                    </p>
                  )}
                </td>
                <td className={tdCls}>{r.orgUnitName}</td>
                <td className={tdCls}>{r.storeName}</td>
                <td className={`${tdCls} text-right tabular-nums`}>{r.lineCount}</td>
                <td className={`${tdCls} text-right tabular-nums`}>{fmtMoney(r.totalAmount)}</td>
                <td className={tdCls}>{r.createdByName}</td>
                <td className={`${tdCls} whitespace-nowrap`}>{fmtDateTime(r.updatedAt)}</td>
                <td className={tdCls}>
                  <StatusBadge status={r.status} />
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
