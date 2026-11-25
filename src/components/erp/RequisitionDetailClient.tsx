"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Ban, Check, ClipboardList, History, PackageCheck, Pencil, Printer, Send, X } from "lucide-react";
import {
  DOC_EVENT_LABELS,
  DOC_STATUS_LABELS,
  isDocStatus,
  type RequisitionAction,
  type RequisitionDetail,
} from "@/lib/erp/types";
import { erpFetch, ErpClientError, fmtCost, fmtDateTime, fmtMoney, fmtQty, parseNumberInput, useErpGet } from "./erp-client";
import {
  btnDanger,
  btnOutline,
  btnPrimary,
  btnSuccess,
  BusyIcon,
  cardCls,
  ErrorCard,
  iconCls,
  InlineError,
  inputCls,
  labelCls,
  LoadingCard,
  SectionTitle,
  StatusBadge,
  tableCls,
  tableWrapCls,
  tdCls,
  theadCls,
  thCls,
} from "./ui";

/** /erp/requisitions/view?id= : details, history and the allowed actions. */
export function RequisitionDetailClient() {
  const params = useSearchParams();
  const id = Number(params.get("id")) || null;
  const detail = useErpGet<RequisitionDetail>(id ? `/api/erp/requisitions/${id}` : null);

  if (!id) return <div className={`${cardCls} text-xs`}>ไม่พบใบเบิก</div>;
  if (detail.error) return <ErrorCard error={detail.error} onRetry={detail.reload} />;
  if (!detail.data) return <LoadingCard />;
  // key: a new version resets the per-line inputs.
  return <Detail key={`${detail.data.id}:${detail.data.version}`} d={detail.data} onChange={detail.setData} reload={detail.reload} />;
}

function Detail({
  d,
  onChange,
  reload,
}: {
  d: RequisitionDetail;
  onChange: (d: RequisitionDetail) => void;
  reload: () => void;
}) {
  const p = d.permissions;
  const mode: "approve" | "issue" | null = p.canApprove ? "approve" : p.canIssue ? "issue" : null;
  const [qty, setQty] = useState<Record<number, string>>(() =>
    Object.fromEntries(
      d.lines.map((l) => [
        l.id,
        String(mode === "approve" ? l.qty : mode === "issue" ? Math.min(l.qtyApproved ?? 0, l.onHand ?? 0) : ""),
      ]),
    ),
  );
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<RequisitionAction | null>(null);
  const [confirm, setConfirm] = useState<"reject" | "cancel" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(action: RequisitionAction) {
    let lines: { lineId: number; qty: number }[] | undefined;
    if (action === "approve" || action === "issue") {
      lines = [];
      for (const l of d.lines) {
        const v = parseNumberInput(qty[l.id] ?? "");
        if (v === null || v < 0) {
          setError(`${l.itemCode}: จำนวนไม่ถูกต้อง`);
          return;
        }
        lines.push({ lineId: l.id, qty: v });
      }
    }
    if (action === "reject" && !note.trim()) {
      setError("กรุณาระบุเหตุผลที่ไม่อนุมัติ");
      return;
    }
    setBusy(action);
    setError(null);
    try {
      const next = await erpFetch<RequisitionDetail>(`/api/erp/requisitions/${d.id}/actions`, {
        method: "POST",
        body: { action, version: d.version, note: note.trim() || undefined, lines },
      });
      onChange(next);
    } catch (err) {
      setError(err instanceof ErpClientError ? err.message : "ทำรายการไม่สำเร็จ");
      setBusy(null);
      if (err instanceof ErpClientError && err.code === "stale") reload();
    }
  }

  const showStock = d.status === "submitted" || d.status === "approved";
  const showCost = d.status === "issued";

  return (
    <div className="space-y-4">
      <section className={`${cardCls} space-y-3`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <SectionTitle icon={ClipboardList}>ใบเบิก {d.docNo ?? `ร่าง #${d.id}`}</SectionTitle>
          <div className="flex items-center gap-2">
            <Link href={`/erp/requisitions/print?id=${d.id}`} className={btnOutline}>
              <Printer aria-hidden="true" className={iconCls} />
              พิมพ์
            </Link>
            <StatusBadge status={d.status} />
          </div>
        </div>
        <dl className="grid gap-x-6 gap-y-1 text-xs sm:grid-cols-2">
          <Info label="หน่วยงานที่เบิก" value={d.orgUnitName} />
          <Info label="เบิกจากคลัง" value={d.storeName} />
          <Info label="ผู้สร้าง" value={`${d.createdByName} · ${fmtDateTime(d.createdAt)}`} />
          {d.fiscalYear && <Info label="ปีงบประมาณ" value={String(d.fiscalYear)} />}
          {d.decidedByName && <Info label="ผู้อนุมัติ/ไม่อนุมัติ" value={`${d.decidedByName} · ${fmtDateTime(d.decidedAt)}`} />}
          {d.completedByName && <Info label="ผู้จ่าย" value={`${d.completedByName} · ${fmtDateTime(d.completedAt)}`} />}
          {d.purpose && <Info label="วัตถุประสงค์" value={d.purpose} wide />}
          {d.totalAmount !== null && <Info label="มูลค่าที่จ่าย (บาท)" value={fmtMoney(d.totalAmount)} />}
        </dl>
      </section>

      <section className={`${cardCls} space-y-3`}>
        <div className={tableWrapCls}>
          <table className={tableCls}>
            <thead className={theadCls}>
              <tr>
                <th scope="col" className={thCls}>#</th>
                <th scope="col" className={thCls}>พัสดุ</th>
                <th scope="col" className={`${thCls} text-right`}>ขอ</th>
                <th scope="col" className={`${thCls} text-right`}>อนุมัติ</th>
                <th scope="col" className={`${thCls} text-right`}>จ่าย</th>
                {showStock && <th scope="col" className={`${thCls} text-right`}>คงคลัง</th>}
                {mode && <th scope="col" className={thCls}>{mode === "approve" ? "จำนวนอนุมัติ" : "จำนวนจ่าย"}</th>}
                {showCost && <th scope="col" className={`${thCls} text-right`}>ต้นทุน/หน่วย</th>}
                {showCost && <th scope="col" className={`${thCls} text-right`}>มูลค่า</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {d.lines.map((l) => {
                const short = showStock && (l.onHand ?? 0) < (l.qtyApproved ?? l.qty);
                return (
                  <tr key={l.id}>
                    <td className={`${tdCls} tabular-nums`}>{l.lineNo}</td>
                    <td className={tdCls}>
                      <span className="font-medium">{l.itemCode}</span> {l.itemName}
                      <span className="text-zinc-500"> ({l.unit})</span>
                      {l.note && <p className="text-zinc-500">{l.note}</p>}
                    </td>
                    <td className={`${tdCls} text-right tabular-nums`}>{fmtQty(l.qty)}</td>
                    <td className={`${tdCls} text-right tabular-nums`}>{fmtQty(l.qtyApproved)}</td>
                    <td className={`${tdCls} text-right tabular-nums`}>{fmtQty(l.qtyIssued)}</td>
                    {showStock && (
                      <td className={`${tdCls} text-right tabular-nums ${short ? "font-semibold text-red-700 dark:text-red-300" : ""}`}>
                        {fmtQty(l.onHand)}
                      </td>
                    )}
                    {mode && (
                      <td className={tdCls}>
                        <input
                          type="text"
                          inputMode="decimal"
                          aria-label={`${mode === "approve" ? "จำนวนอนุมัติ" : "จำนวนจ่าย"} ${l.itemCode}`}
                          className={`${inputCls} w-24 text-right`}
                          value={qty[l.id] ?? ""}
                          onChange={(e) => setQty((q) => ({ ...q, [l.id]: e.target.value }))}
                        />
                      </td>
                    )}
                    {showCost && <td className={`${tdCls} text-right tabular-nums`}>{fmtCost(l.unitCost)}</td>}
                    {showCost && <td className={`${tdCls} text-right tabular-nums`}>{fmtMoney(l.amount)}</td>}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {mode === "issue" && (
          <p className="text-xs text-zinc-600 dark:text-zinc-400">
            ค่าเริ่มต้นคือจำนวนที่อนุมัติ (ไม่เกินยอดคงคลัง) ต้นทุนคิดแบบถัวเฉลี่ยเคลื่อนที่ ณ เวลาจ่าย และตัดล็อตที่หมดอายุก่อน
          </p>
        )}

        {(p.canEdit || p.canSubmit || p.canApprove || p.canIssue || p.canCancel) && (
          <div className="space-y-3 border-t border-zinc-200 pt-3 dark:border-zinc-800">
            {(p.canApprove || p.canIssue || p.canCancel || p.canSubmit) && (
              <label className={labelCls}>
                <span className="font-medium">
                  หมายเหตุ{p.canApprove ? " (จำเป็นเมื่อไม่อนุมัติ)" : ""}
                </span>
                <textarea
                  className={inputCls}
                  rows={2}
                  maxLength={500}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </label>
            )}
            <InlineError message={error} />
            <div className="flex flex-wrap gap-2">
              {p.canEdit && (
                <Link href={`/erp/requisitions/new?id=${d.id}`} className={btnOutline}>
                  <Pencil aria-hidden="true" className={iconCls} />
                  แก้ไขร่าง
                </Link>
              )}
              {p.canSubmit && (
                <button type="button" className={btnPrimary} disabled={busy !== null} onClick={() => void run("submit")}>
                  <BusyIcon busy={busy === "submit"} icon={Send} />
                  ส่งขออนุมัติ
                </button>
              )}
              {p.canApprove && (
                <button type="button" className={btnSuccess} disabled={busy !== null} onClick={() => void run("approve")}>
                  <BusyIcon busy={busy === "approve"} icon={Check} />
                  อนุมัติ
                </button>
              )}
              {p.canApprove &&
                (confirm === "reject" ? (
                  <ConfirmButtons
                    label="ยืนยันไม่อนุมัติ"
                    busy={busy === "reject"}
                    onConfirm={() => void run("reject")}
                    onCancel={() => setConfirm(null)}
                  />
                ) : (
                  <button type="button" className={btnOutline} disabled={busy !== null} onClick={() => setConfirm("reject")}>
                    <X aria-hidden="true" className={iconCls} />
                    ไม่อนุมัติ
                  </button>
                ))}
              {p.canIssue && (
                <button type="button" className={btnSuccess} disabled={busy !== null} onClick={() => void run("issue")}>
                  <BusyIcon busy={busy === "issue"} icon={PackageCheck} />
                  จ่ายพัสดุและตัดสต็อก
                </button>
              )}
              {p.canCancel &&
                (confirm === "cancel" ? (
                  <ConfirmButtons
                    label="ยืนยันยกเลิกใบเบิก"
                    busy={busy === "cancel"}
                    onConfirm={() => void run("cancel")}
                    onCancel={() => setConfirm(null)}
                  />
                ) : (
                  <button
                    type="button"
                    className={`${btnOutline} text-red-700 dark:text-red-300`}
                    disabled={busy !== null}
                    onClick={() => setConfirm("cancel")}
                  >
                    <Ban aria-hidden="true" className={iconCls} />
                    ยกเลิกใบเบิก
                  </button>
                ))}
            </div>
          </div>
        )}
      </section>

      <section className={`${cardCls} space-y-3`}>
        <SectionTitle icon={History}>ประวัติเอกสาร</SectionTitle>
        <ol className="space-y-2 text-xs">
          {d.events.map((e) => (
            <li key={e.id} className="border-l-2 border-brand-200 pl-3 dark:border-brand-800">
              <p>
                <span className="font-semibold">{DOC_EVENT_LABELS[e.action] ?? e.action}</span>
                {e.toStatus && isDocStatus(e.toStatus) && ` → ${DOC_STATUS_LABELS[e.toStatus]}`}
                <span className="text-zinc-500"> · {e.actorName} · {fmtDateTime(e.createdAt)}</span>
              </p>
              {e.note && <p className="text-zinc-600 dark:text-zinc-400">{e.note}</p>}
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

function Info({ label, value, wide }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={wide ? "sm:col-span-2" : undefined}>
      <dt className="inline text-zinc-500 dark:text-zinc-400">{label}: </dt>
      <dd className="inline whitespace-pre-line">{value}</dd>
    </div>
  );
}

function ConfirmButtons({
  label,
  busy,
  onConfirm,
  onCancel,
}: {
  label: string;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button type="button" className={btnDanger} disabled={busy} onClick={onConfirm}>
        <BusyIcon busy={busy} icon={Check} />
        {label}
      </button>
      <button type="button" className={btnOutline} disabled={busy} onClick={onCancel}>
        ไม่ใช่
      </button>
    </span>
  );
}
