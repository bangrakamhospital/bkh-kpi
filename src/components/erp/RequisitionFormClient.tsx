"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FilePlus2, Plus, Save, Send, Trash2 } from "lucide-react";
import type { ErpLookups, ErpMe, RequisitionDetail, RequisitionInput } from "@/lib/erp/types";
import { erpFetch, ErpClientError, parseNumberInput, useErpGet } from "./erp-client";
import { ItemPicker } from "./ItemPicker";
import { requisitionHref } from "./RequisitionTable";
import {
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
  tableCls,
  tableWrapCls,
  tdCls,
  theadCls,
  thCls,
} from "./ui";

interface LineState {
  key: number;
  itemId: number | null;
  qty: string;
  note: string;
}

interface FormInit {
  id: number | null;
  version: number;
  orgUnitId: number | null;
  storeId: number | null;
  purpose: string;
  lines: LineState[];
}

let lineKey = 0;
const newLine = (): LineState => ({ key: ++lineKey, itemId: null, qty: "", note: "" });

/** /erp/requisitions/new (new draft) and /erp/requisitions/new?id= (edit a draft). */
export function RequisitionFormClient() {
  const params = useSearchParams();
  const editId = Number(params.get("id")) || null;
  const lookups = useErpGet<ErpLookups & { me: ErpMe }>("/api/erp/lookups");
  const detail = useErpGet<RequisitionDetail>(editId ? `/api/erp/requisitions/${editId}` : null);

  if (lookups.error) return <ErrorCard error={lookups.error} onRetry={lookups.reload} />;
  if (detail.error) return <ErrorCard error={detail.error} onRetry={detail.reload} />;
  if (!lookups.data || (editId && !detail.data)) return <LoadingCard />;

  const me = lookups.data.me;
  const myUnitIds = new Set(
    me.roles.flatMap((r) => (r.orgUnitId !== null && (r.role === "recorder" || r.role === "unit_head") ? [r.orgUnitId] : [])),
  );
  const units = lookups.data.orgUnits.filter((u) => myUnitIds.has(u.id));
  if (units.length === 0) {
    return (
      <div className={`${cardCls} text-xs`}>
        คุณยังไม่มีบทบาท &quot;ผู้บันทึก&quot; หรือ &quot;หัวหน้าหน่วยงาน&quot; ของหน่วยงานใด จึงสร้างใบเบิกไม่ได้
      </div>
    );
  }

  let init: FormInit;
  if (detail.data) {
    const d = detail.data;
    if (!d.permissions.canEdit) {
      return (
        <div className={`${cardCls} space-y-2 text-xs`}>
          <p>ใบเบิกนี้แก้ไขไม่ได้แล้ว (แก้ไขได้เฉพาะสถานะร่าง)</p>
          <Link href={requisitionHref(d.id)} className="text-brand-700 underline dark:text-brand-300">
            กลับไปหน้าใบเบิก
          </Link>
        </div>
      );
    }
    init = {
      id: d.id,
      version: d.version,
      orgUnitId: d.orgUnitId,
      storeId: d.storeId,
      purpose: d.purpose,
      lines: d.lines.map((l) => ({ key: ++lineKey, itemId: l.itemId, qty: String(l.qty), note: l.note })),
    };
  } else {
    init = {
      id: null,
      version: 1,
      orgUnitId: units.length === 1 ? units[0].id : null,
      storeId: lookups.data.stores.length === 1 ? lookups.data.stores[0].id : null,
      purpose: "",
      lines: [newLine()],
    };
  }
  return <RequisitionForm key={init.id ?? "new"} init={init} lookups={lookups.data} units={units} />;
}

function RequisitionForm({
  init,
  lookups,
  units,
}: {
  init: FormInit;
  lookups: ErpLookups;
  units: ErpLookups["orgUnits"];
}) {
  const router = useRouter();
  const [orgUnitId, setOrgUnitId] = useState<number | null>(init.orgUnitId);
  const [storeId, setStoreId] = useState<number | null>(init.storeId);
  const [purpose, setPurpose] = useState(init.purpose);
  const [lines, setLines] = useState<LineState[]>(init.lines);
  const [busy, setBusy] = useState<"save" | "submit" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const updateLine = (key: number, patch: Partial<LineState>) =>
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  function buildInput(): RequisitionInput | string {
    if (!orgUnitId) return "กรุณาเลือกหน่วยงาน";
    if (!storeId) return "กรุณาเลือกคลัง";
    const filled = lines.filter((l) => l.itemId !== null || l.qty.trim());
    if (filled.length === 0) return "กรุณาเพิ่มรายการพัสดุอย่างน้อย 1 รายการ";
    const out: RequisitionInput["lines"] = [];
    for (const [i, l] of filled.entries()) {
      if (l.itemId === null) return `รายการที่ ${i + 1}: กรุณาเลือกพัสดุจากรายการ`;
      const qty = parseNumberInput(l.qty);
      if (qty === null || qty <= 0) return `รายการที่ ${i + 1}: จำนวนต้องมากกว่า 0`;
      out.push({ itemId: l.itemId, qty, note: l.note.trim() });
    }
    const ids = out.map((l) => l.itemId);
    if (new Set(ids).size !== ids.length) return "มีพัสดุซ้ำกัน กรุณารวมเป็นรายการเดียว";
    return { orgUnitId, storeId, purpose: purpose.trim(), lines: out };
  }

  async function save(andSubmit: boolean) {
    const input = buildInput();
    if (typeof input === "string") {
      setError(input);
      return;
    }
    setBusy(andSubmit ? "submit" : "save");
    setError(null);
    try {
      let id: number;
      let version: number;
      if (init.id === null) {
        id = (await erpFetch<{ id: number }>("/api/erp/requisitions", { method: "POST", body: input })).id;
        version = 1;
      } else {
        const d = await erpFetch<RequisitionDetail>(`/api/erp/requisitions/${init.id}`, {
          method: "PATCH",
          body: { ...input, version: init.version },
        });
        id = d.id;
        version = d.version;
      }
      if (andSubmit) {
        // The draft is saved; if submitting fails the detail page shows
        // the draft (and its submit button) instead of re-creating it here.
        await erpFetch(`/api/erp/requisitions/${id}/actions`, {
          method: "POST",
          body: { action: "submit", version },
        }).catch(() => undefined);
      }
      router.push(requisitionHref(id));
    } catch (err) {
      setError(err instanceof ErpClientError ? err.message : "บันทึกไม่สำเร็จ");
      setBusy(null);
    }
  }

  return (
    <form
      className={`${cardCls} space-y-4`}
      onSubmit={(e) => {
        e.preventDefault();
        void save(false);
      }}
    >
      <SectionTitle icon={FilePlus2}>{init.id ? "แก้ไขร่างใบเบิก" : "สร้างใบเบิกพัสดุ"}</SectionTitle>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={labelCls}>
          <span className="font-medium">หน่วยงานที่เบิก</span>
          <select
            className={inputCls}
            value={orgUnitId ?? ""}
            onChange={(e) => setOrgUnitId(Number(e.target.value) || null)}
          >
            <option value="">-- เลือกหน่วยงาน --</option>
            {units.map((u) => (
              <option key={u.id} value={u.id}>
                {u.code} · {u.name}
              </option>
            ))}
          </select>
        </label>
        <label className={labelCls}>
          <span className="font-medium">เบิกจากคลัง</span>
          <select className={inputCls} value={storeId ?? ""} onChange={(e) => setStoreId(Number(e.target.value) || null)}>
            <option value="">-- เลือกคลัง --</option>
            {lookups.stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.code} · {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className={`${labelCls} sm:col-span-2`}>
          <span className="font-medium">วัตถุประสงค์ / หมายเหตุ</span>
          <textarea
            className={inputCls}
            rows={2}
            maxLength={500}
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
          />
        </label>
      </div>

      <div className={tableWrapCls}>
        <table className={tableCls}>
          <thead className={theadCls}>
            <tr>
              <th scope="col" className={thCls}>#</th>
              <th scope="col" className={thCls}>พัสดุ</th>
              <th scope="col" className={thCls}>จำนวนที่ขอ</th>
              <th scope="col" className={thCls}>หมายเหตุ</th>
              <th scope="col" className={thCls}>
                <span className="sr-only">ลบ</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {lines.map((l, i) => {
              const item = lookups.items.find((it) => it.id === l.itemId);
              return (
                <tr key={l.key}>
                  <td className={`${tdCls} tabular-nums`}>{i + 1}</td>
                  <td className={tdCls}>
                    <ItemPicker
                      items={lookups.items}
                      value={l.itemId}
                      label={`พัสดุรายการที่ ${i + 1}`}
                      onChange={(itemId) => updateLine(l.key, { itemId })}
                    />
                  </td>
                  <td className={tdCls}>
                    <div className="flex items-center gap-1">
                      <input
                        type="text"
                        inputMode="decimal"
                        aria-label={`จำนวนรายการที่ ${i + 1}`}
                        className={`${inputCls} w-24 text-right`}
                        value={l.qty}
                        onChange={(e) => updateLine(l.key, { qty: e.target.value })}
                      />
                      <span className="text-zinc-500">{item?.unit}</span>
                    </div>
                  </td>
                  <td className={tdCls}>
                    <input
                      type="text"
                      aria-label={`หมายเหตุรายการที่ ${i + 1}`}
                      className={inputCls}
                      maxLength={200}
                      value={l.note}
                      onChange={(e) => updateLine(l.key, { note: e.target.value })}
                    />
                  </td>
                  <td className={tdCls}>
                    <button
                      type="button"
                      className={`${btnOutline} text-red-700 dark:text-red-300`}
                      aria-label={`ลบรายการที่ ${i + 1}`}
                      disabled={lines.length === 1}
                      onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}
                    >
                      <Trash2 aria-hidden="true" className={iconCls} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <button
        type="button"
        className={btnOutline}
        disabled={lines.length >= 100}
        onClick={() => setLines((ls) => [...ls, newLine()])}
      >
        <Plus aria-hidden="true" className={iconCls} />
        เพิ่มรายการ
      </button>

      <InlineError message={error} />
      <div className="flex flex-wrap gap-2">
        <button type="submit" className={btnPrimary} disabled={busy !== null}>
          <BusyIcon busy={busy === "save"} icon={Save} />
          บันทึกร่าง
        </button>
        <button type="button" className={btnSuccess} disabled={busy !== null} onClick={() => void save(true)}>
          <BusyIcon busy={busy === "submit"} icon={Send} />
          บันทึกและส่งขออนุมัติ
        </button>
        <Link href={init.id ? requisitionHref(init.id) : "/erp/requisitions"} className={btnOutline}>
          ยกเลิก
        </Link>
      </div>
    </form>
  );
}
