"use client";

import { useState } from "react";
import { Ban, Check, ClipboardCheck, X } from "lucide-react";
import type { AdjustmentAction, AdjustmentRow } from "@/lib/erp/types";
import { erpFetch, ErpClientError, fmtDate, fmtDateTime, fmtQty, useErpGet } from "./erp-client";
import {
  btnDanger,
  btnOutline,
  btnSuccess,
  BusyIcon,
  cardCls,
  EmptyRow,
  ErrorCard,
  iconCls,
  InlineError,
  inputCls,
  LoadingCard,
  SectionTitle,
  tableCls,
  tableWrapCls,
  tdCls,
  theadCls,
  thCls,
} from "./ui";

/**
 * Stock adjustments waiting for the second approval (finance / director,
 * not the creator). Buttons come from the server's canApprove / canCancel.
 * storeId = one store (stock page), omitted = every store I may see (home).
 */
export function AdjustmentList({
  storeId,
  title,
  onlyActionable = false,
  onChanged,
}: {
  storeId?: number;
  title: string;
  /** Hide rows I cannot approve / cancel (home page "work for me"). */
  onlyActionable?: boolean;
  onChanged?: () => void;
}) {
  const qs = new URLSearchParams({ status: "submitted" });
  if (storeId) qs.set("storeId", String(storeId));
  const data = useErpGet<{ rows: AdjustmentRow[]; total: number }>(`/api/erp/stock/adjustments?${qs.toString()}`);
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState<{ id: number; action: AdjustmentAction } | null>(null);
  const [confirm, setConfirm] = useState<{ id: number; action: "reject" | "cancel" } | null>(null);
  const [error, setError] = useState<{ id: number; message: string } | null>(null);

  if (data.error) return <ErrorCard error={data.error} onRetry={data.reload} />;
  if (!data.data) return <LoadingCard />;
  const rows = onlyActionable ? data.data.rows.filter((r) => r.canApprove || r.canCancel) : data.data.rows;

  async function run(r: AdjustmentRow, action: AdjustmentAction) {
    const note = (notes[r.id] ?? "").trim();
    if (action === "reject" && !note) {
      setError({ id: r.id, message: "กรุณาระบุเหตุผลที่ไม่อนุมัติ" });
      return;
    }
    setBusy({ id: r.id, action });
    setError(null);
    try {
      await erpFetch(`/api/erp/stock/adjustments/${r.id}/actions`, {
        method: "POST",
        body: { action, version: r.version, note: note || undefined },
      });
      setConfirm(null);
      data.reload();
      onChanged?.();
    } catch (err) {
      setError({ id: r.id, message: err instanceof ErpClientError ? err.message : "ทำรายการไม่สำเร็จ" });
      if (err instanceof ErpClientError && err.code === "stale") data.reload();
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className={`${cardCls} space-y-3`}>
      <SectionTitle icon={ClipboardCheck}>
        {title} ({rows.length.toLocaleString("th-TH")})
      </SectionTitle>
      <div className={tableWrapCls}>
        <table className={tableCls}>
          <thead className={theadCls}>
            <tr>
              <th scope="col" className={thCls}>เลขที่</th>
              <th scope="col" className={thCls}>คลัง / พัสดุ</th>
              <th scope="col" className={thCls}>ประเภท</th>
              <th scope="col" className={`${thCls} text-right`}>ยอดตอนบันทึก</th>
              <th scope="col" className={`${thCls} text-right`}>ยอดขณะนี้</th>
              <th scope="col" className={`${thCls} text-right`}>ปรับ</th>
              <th scope="col" className={thCls}>เหตุผล / ผู้บันทึก</th>
              <th scope="col" className={thCls}>ดำเนินการ</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {rows.length === 0 ? (
              <EmptyRow colSpan={8}>ไม่มีใบปรับยอดรออนุมัติ</EmptyRow>
            ) : (
              rows.map((r) => {
                const moved = r.onHand !== r.expectedQty;
                const isBusy = busy?.id === r.id;
                return (
                  <tr key={r.id}>
                    <td className={`${tdCls} whitespace-nowrap font-medium`}>{r.docNo}</td>
                    <td className={tdCls}>
                      <p className="text-zinc-500">{r.storeName}</p>
                      <span className="font-medium">{r.itemCode}</span> {r.itemName}
                      {(r.lotNo || r.expiryDate) && (
                        <p className="text-zinc-500">
                          Lot {r.lotNo || "-"}
                          {r.expiryDate && ` · หมดอายุ ${fmtDate(r.expiryDate)}`}
                        </p>
                      )}
                    </td>
                    <td className={tdCls}>
                      {r.mode === "count" ? `ตรวจนับได้ ${fmtQty(r.countedQty)}` : "ปรับยอด"}
                    </td>
                    <td className={`${tdCls} text-right tabular-nums`}>{fmtQty(r.expectedQty)}</td>
                    <td
                      className={`${tdCls} text-right tabular-nums ${moved ? "font-semibold text-red-700 dark:text-red-300" : ""}`}
                      title={moved ? "ยอดเปลี่ยนตั้งแต่บันทึก" : undefined}
                    >
                      {fmtQty(r.onHand)}
                    </td>
                    <td
                      className={`${tdCls} whitespace-nowrap text-right tabular-nums ${
                        r.delta < 0 ? "text-red-700 dark:text-red-300" : "text-emerald-700 dark:text-emerald-300"
                      }`}
                    >
                      {r.delta > 0 ? "+" : ""}
                      {fmtQty(r.delta)} {r.unit}
                    </td>
                    <td className={tdCls}>
                      <p className="whitespace-pre-line">{r.note}</p>
                      <p className="text-zinc-500">
                        {r.createdByName} · {fmtDateTime(r.createdAt)}
                      </p>
                    </td>
                    <td className={`${tdCls} min-w-56 space-y-2`}>
                      {moved && r.mode === "count" && (
                        <p className="text-red-700 dark:text-red-300">ยอดเปลี่ยนแล้ว อนุมัติไม่ได้ ให้ยกเลิกและตรวจนับใหม่</p>
                      )}
                      {(r.canApprove || r.canCancel) && (
                        <input
                          type="text"
                          aria-label={`หมายเหตุ ${r.docNo}`}
                          placeholder="หมายเหตุ (จำเป็นเมื่อไม่อนุมัติ)"
                          className={inputCls}
                          maxLength={500}
                          value={notes[r.id] ?? ""}
                          onChange={(e) => setNotes((n) => ({ ...n, [r.id]: e.target.value }))}
                        />
                      )}
                      <div className="flex flex-wrap gap-2">
                        {r.canApprove && (
                          <button type="button" className={btnSuccess} disabled={isBusy} onClick={() => void run(r, "approve")}>
                            <BusyIcon busy={isBusy && busy?.action === "approve"} icon={Check} />
                            อนุมัติและลงบัญชี
                          </button>
                        )}
                        {(["reject", "cancel"] as const).map((action) =>
                          (action === "reject" ? r.canApprove : r.canCancel) ? (
                            confirm?.id === r.id && confirm.action === action ? (
                              <span key={action} className="inline-flex gap-2">
                                <button type="button" className={btnDanger} disabled={isBusy} onClick={() => void run(r, action)}>
                                  <BusyIcon busy={isBusy && busy?.action === action} icon={Check} />
                                  {action === "reject" ? "ยืนยันไม่อนุมัติ" : "ยืนยันยกเลิก"}
                                </button>
                                <button type="button" className={btnOutline} onClick={() => setConfirm(null)}>
                                  ไม่ใช่
                                </button>
                              </span>
                            ) : (
                              <button
                                key={action}
                                type="button"
                                className={btnOutline}
                                disabled={isBusy}
                                onClick={() => setConfirm({ id: r.id, action })}
                              >
                                {action === "reject" ? (
                                  <X aria-hidden="true" className={iconCls} />
                                ) : (
                                  <Ban aria-hidden="true" className={iconCls} />
                                )}
                                {action === "reject" ? "ไม่อนุมัติ" : "ยกเลิก"}
                              </button>
                            )
                          ) : null,
                        )}
                      </div>
                      {!r.canApprove && !r.canCancel && <p className="text-zinc-500">รอการเงิน/ผู้บริหารอนุมัติ</p>}
                      {error?.id === r.id && <InlineError message={error.message} />}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
