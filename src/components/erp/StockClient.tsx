"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowDownToLine, ClipboardCheck, ClipboardPen, FileText, History, PackagePlus, Plus, Save, Trash2, Warehouse } from "lucide-react";
import { ExcelDownloadButton, type ExcelExport } from "@/components/kpi/overview/ExcelDownloadButton";
import {
  DOC_STATUS_LABELS,
  MOVEMENT_TYPE_LABELS,
  MOVEMENT_TYPES,
  type ErpLookups,
  type ErpMe,
  type MovementType,
  type PostedDocResponse,
  type ReceiptInput,
  type StockBalanceRow,
  type StockDocType,
  type StockDocumentRow,
  type StockMovementRow,
} from "@/lib/erp/types";
import {
  erpFetch,
  ErpClientError,
  fmtCost,
  fmtDate,
  fmtDateTime,
  fmtMoney,
  fmtQty,
  parseNumberInput,
  todayBangkok,
  newIdempotencyKey,
  useErpGet,
} from "./erp-client";
import { AdjustmentList } from "./AdjustmentList";
import { ItemPicker } from "./ItemPicker";
import {
  btnOutline,
  btnPrimary,
  BusyIcon,
  cardCls,
  EmptyRow,
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
  StatusBadge,
} from "./ui";

const TABS = [
  { key: "balances", label: "คงคลัง", Icon: Warehouse, officerOnly: false },
  { key: "receive", label: "รับเข้าคลัง", Icon: PackagePlus, officerOnly: true },
  { key: "movements", label: "ประวัติเคลื่อนไหว", Icon: History, officerOnly: false },
  { key: "adjust", label: "ปรับปรุงยอด / ตรวจนับ", Icon: ClipboardPen, officerOnly: true },
  { key: "documents", label: "ใบรับ/ปรับยอด", Icon: FileText, officerOnly: false },
  // finance / director: second approval of adjustments (officers see them under "adjust")
  { key: "pending", label: "รออนุมัติปรับยอด", Icon: ClipboardCheck, officerOnly: false },
] as const;
type TabKey = (typeof TABS)[number]["key"];

function storesFor(me: ErpMe, lookups: ErpLookups) {
  const viewAll = me.appAdmin || me.roles.some((r) => ["erp_admin", "finance", "director"].includes(r.role));
  const grants = me.roles.filter((r) => r.role === "store_officer");
  const allOfficer = grants.some((r) => r.storeId === null);
  return lookups.stores.map((s) => ({
    ...s,
    officer: allOfficer || grants.some((r) => r.storeId === s.id),
    visible: viewAll || allOfficer || grants.some((r) => r.storeId === s.id),
  }));
}

/** /erp/stock?tab=&store= */
export function StockClient() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const lookups = useErpGet<ErpLookups & { me: ErpMe }>("/api/erp/lookups");

  if (lookups.error) return <ErrorCard error={lookups.error} onRetry={lookups.reload} />;
  if (!lookups.data) return <LoadingCard />;
  const stores = storesFor(lookups.data.me, lookups.data).filter((s) => s.visible);
  if (stores.length === 0) {
    return (
      <div className={`${cardCls} text-xs`}>
        หน้าคลังพัสดุสำหรับเจ้าหน้าที่คลัง การเงิน และผู้บริหาร — คุณยังไม่มีสิทธิ์ดูคลังใด
      </div>
    );
  }
  const storeId = Number(params.get("store")) || stores[0].id;
  const store = stores.find((s) => s.id === storeId) ?? stores[0];
  const tabRaw = params.get("tab");
  const approver = lookups.data.me.roles.some((r) => r.role === "finance" || r.role === "director");
  const tabs = TABS.filter((t) => (t.key === "pending" ? approver : !t.officerOnly || store.officer));
  const tab: TabKey = tabs.some((t) => t.key === tabRaw) ? (tabRaw as TabKey) : "balances";

  const go = (next: { tab?: TabKey; store?: number }) => {
    const q = new URLSearchParams({ tab: next.tab ?? tab, store: String(next.store ?? store.id) });
    router.replace(`${pathname}?${q.toString()}`, { scroll: false });
  };

  return (
    <div className="space-y-4">
      <div className={`${cardCls} flex flex-wrap items-end gap-3`}>
        <label className={labelCls}>
          <span className="font-medium">คลัง</span>
          <select className={`${inputCls} w-64`} value={store.id} onChange={(e) => go({ store: Number(e.target.value) })}>
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.code} · {s.name}
              </option>
            ))}
          </select>
        </label>
        <nav aria-label="เมนูคลัง" className="flex flex-wrap gap-2">
          {tabs.map(({ key, label, Icon }) => (
            <button
              key={key}
              type="button"
              aria-pressed={key === tab}
              onClick={() => go({ tab: key })}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium ${
                key === tab
                  ? "bg-brand-700 text-white"
                  : "bg-brand-50 text-brand-800 hover:bg-brand-100 dark:bg-brand-900/30 dark:text-brand-100"
              }`}
            >
              <Icon aria-hidden="true" className={iconCls} />
              {label}
            </button>
          ))}
        </nav>
      </div>
      {tab === "balances" && <Balances key={store.id} storeId={store.id} storeName={store.name} />}
      {tab === "movements" && <Movements key={store.id} storeId={store.id} storeName={store.name} lookups={lookups.data} />}
      {tab === "receive" && <ReceiveForm key={store.id} storeId={store.id} lookups={lookups.data} onDone={() => go({ tab: "balances" })} />}
      {tab === "adjust" && <AdjustForm key={store.id} storeId={store.id} lookups={lookups.data} />}
      {tab === "pending" && <AdjustmentList key={store.id} storeId={store.id} title={`ใบปรับยอดรออนุมัติ ${store.name}`} />}
      {tab === "documents" && <StockDocuments key={store.id} storeId={store.id} storeName={store.name} />}
    </div>
  );
}

// --- balances ------------------------------------------------------------------------

function Balances({ storeId, storeName }: { storeId: number; storeName: string }) {
  const [includeZero, setIncludeZero] = useState(false);
  const [filter, setFilter] = useState("");
  const data = useErpGet<{ rows: StockBalanceRow[] }>(
    `/api/erp/stock?storeId=${storeId}${includeZero ? "&includeZero=1" : ""}`,
  );
  const rows = useMemo(() => {
    const f = filter.trim().toLowerCase();
    const all = data.data?.rows ?? [];
    return f ? all.filter((r) => `${r.itemCode} ${r.itemName}`.toLowerCase().includes(f)) : all;
  }, [data.data, filter]);
  const totalValue = rows.reduce((s, r) => s + r.totalValue, 0);

  const excel: ExcelExport = {
    fileName: `erp-stock-${storeId}`,
    title: `คงคลัง ${storeName}`,
    subtitle: `ณ ${fmtDateTime(new Date().toISOString())} (ต้นทุนถัวเฉลี่ยเคลื่อนที่)`,
    sheetName: "คงคลัง",
    columns: [
      { header: "รหัส" },
      { header: "พัสดุ" },
      { header: "หมวด" },
      { header: "หน่วย" },
      { header: "คงเหลือ" },
      { header: "ต้นทุน/หน่วย" },
      { header: "มูลค่า (บาท)" },
      { header: "จุดสั่งซื้อ" },
      { header: "หมดอายุใกล้สุด" },
    ],
    rows: rows.map((r) => [
      r.itemCode,
      r.itemName,
      r.categoryName,
      r.unit,
      r.qtyOnHand,
      r.avgCost,
      Math.round(r.totalValue * 100) / 100,
      r.reorderPoint,
      r.nearestExpiry,
    ]),
    footer: [["รวม", null, null, null, null, null, Math.round(totalValue * 100) / 100, null, null]],
  };

  return (
    <section className={`${cardCls} space-y-3`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SectionTitle icon={Warehouse}>คงคลัง {storeName}</SectionTitle>
        {data.data && <ExcelDownloadButton data={excel} />}
      </div>
      <div className="flex flex-wrap items-center gap-3 text-xs">
        <input
          type="search"
          aria-label="ค้นหาพัสดุ"
          placeholder="ค้นหารหัส/ชื่อพัสดุ"
          className={`${inputCls} w-64`}
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <label className="inline-flex items-center gap-1.5">
          <input
            type="checkbox"
            className="h-4 w-4 accent-brand-700"
            checked={includeZero}
            onChange={(e) => setIncludeZero(e.target.checked)}
          />
          แสดงรายการที่คงเหลือ 0
        </label>
      </div>
      {data.error ? (
        <ErrorCard error={data.error} onRetry={data.reload} />
      ) : !data.data ? (
        <LoadingCard />
      ) : (
        <div className={tableWrapCls}>
          <table className={tableCls}>
            <thead className={theadCls}>
              <tr>
                <th scope="col" className={thCls}>รหัส</th>
                <th scope="col" className={thCls}>พัสดุ</th>
                <th scope="col" className={thCls}>หมวด</th>
                <th scope="col" className={`${thCls} text-right`}>คงเหลือ</th>
                <th scope="col" className={`${thCls} text-right`}>ต้นทุน/หน่วย</th>
                <th scope="col" className={`${thCls} text-right`}>มูลค่า (บาท)</th>
                <th scope="col" className={thCls}>หมดอายุใกล้สุด</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {rows.length === 0 ? (
                <EmptyRow colSpan={7}>ไม่มีพัสดุในคลังนี้</EmptyRow>
              ) : (
                rows.map((r) => {
                  const low = r.reorderPoint > 0 && r.qtyOnHand <= r.reorderPoint;
                  return (
                    <tr key={r.itemId}>
                      <td className={`${tdCls} font-medium`}>{r.itemCode}</td>
                      <td className={tdCls}>{r.itemName}</td>
                      <td className={tdCls}>{r.categoryName ?? "-"}</td>
                      <td className={`${tdCls} whitespace-nowrap text-right tabular-nums`}>
                        <span className={low ? "font-semibold text-red-700 dark:text-red-300" : ""}>
                          {fmtQty(r.qtyOnHand)}
                        </span>{" "}
                        {r.unit}
                        {low && <span className="block text-red-700 dark:text-red-300">ต่ำกว่าจุดสั่งซื้อ ({fmtQty(r.reorderPoint)})</span>}
                      </td>
                      <td className={`${tdCls} text-right tabular-nums`}>{fmtCost(r.avgCost)}</td>
                      <td className={`${tdCls} text-right tabular-nums`}>{fmtMoney(r.totalValue)}</td>
                      <td className={`${tdCls} whitespace-nowrap`}>{fmtDate(r.nearestExpiry)}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
            <tfoot className="bg-zinc-50 font-semibold dark:bg-zinc-900">
              <tr>
                <td className={tdCls} colSpan={5}>
                  รวม {rows.length.toLocaleString("th-TH")} รายการ
                </td>
                <td className={`${tdCls} text-right tabular-nums`}>{fmtMoney(totalValue)}</td>
                <td className={tdCls} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </section>
  );
}

// --- movements -----------------------------------------------------------------------

function daysAgo(n: number): string {
  const d = new Date(`${todayBangkok()}T00:00:00Z`);
  return new Date(d.getTime() - n * 86_400_000).toISOString().slice(0, 10);
}

function Movements({ storeId, storeName, lookups }: { storeId: number; storeName: string; lookups: ErpLookups }) {
  const [from, setFrom] = useState(daysAgo(30));
  const [to, setTo] = useState(todayBangkok());
  const [type, setType] = useState<MovementType | "">("");
  const [itemId, setItemId] = useState<number | null>(null);
  const qs = new URLSearchParams({ storeId: String(storeId), from, to });
  if (type) qs.set("type", type);
  if (itemId) qs.set("itemId", String(itemId));
  const data = useErpGet<{ rows: StockMovementRow[]; truncated: boolean; from: string; to: string }>(
    from && to ? `/api/erp/stock/movements?${qs.toString()}` : null,
  );
  const rows = data.data?.rows ?? [];

  const excel: ExcelExport = {
    fileName: `erp-movements-${storeId}-${from}_${to}`,
    title: `ประวัติเคลื่อนไหว ${storeName}`,
    subtitle: `ช่วงวันที่ ${fmtDate(from)} - ${fmtDate(to)}${type ? ` · ${MOVEMENT_TYPE_LABELS[type]}` : ""}`,
    sheetName: "เคลื่อนไหว",
    columns: [
      { header: "วันเวลา" },
      { header: "ประเภท" },
      { header: "เอกสาร" },
      { header: "รหัส" },
      { header: "พัสดุ" },
      { header: "Lot" },
      { header: "จำนวน" },
      { header: "ต้นทุน/หน่วย" },
      { header: "มูลค่า (บาท)" },
      { header: "คงเหลือหลังรายการ" },
      { header: "หน่วยงาน/ผู้ขาย" },
      { header: "ผู้บันทึก" },
      { header: "หมายเหตุ" },
    ],
    rows: rows.map((r) => [
      fmtDateTime(r.createdAt),
      MOVEMENT_TYPE_LABELS[r.type],
      r.docNo,
      r.itemCode,
      r.itemName,
      r.lotNo || null,
      r.qtyChange,
      r.unitCost,
      Math.round(r.valueChange * 100) / 100,
      r.qtyAfter,
      r.orgUnitName ?? r.vendorName,
      r.createdByName,
      r.note || null,
    ]),
    notes: data.data?.truncated ? ["แสดงเฉพาะ 5,000 รายการล่าสุด กรุณาเลือกช่วงวันที่ให้แคบลง"] : undefined,
  };

  return (
    <section className={`${cardCls} space-y-3`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SectionTitle icon={History}>ประวัติเคลื่อนไหว {storeName}</SectionTitle>
        {data.data && <ExcelDownloadButton data={excel} />}
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <label className={labelCls}>
          <span className="font-medium">ตั้งแต่</span>
          <input type="date" className={`${inputCls} w-40`} value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className={labelCls}>
          <span className="font-medium">ถึง</span>
          <input type="date" className={`${inputCls} w-40`} value={to} min={from} onChange={(e) => setTo(e.target.value)} />
        </label>
        <label className={labelCls}>
          <span className="font-medium">ประเภท</span>
          <select className={`${inputCls} w-40`} value={type} onChange={(e) => setType(e.target.value as MovementType | "")}>
            <option value="">ทุกประเภท</option>
            {MOVEMENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {MOVEMENT_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </label>
        <div className={labelCls}>
          <span className="font-medium">พัสดุ (ไม่บังคับ)</span>
          <ItemPicker items={lookups.items} value={itemId} onChange={setItemId} label="กรองตามพัสดุ" />
        </div>
      </div>
      {data.error ? (
        <ErrorCard error={data.error} onRetry={data.reload} />
      ) : !data.data ? (
        <LoadingCard />
      ) : (
        <>
          {data.data.truncated && (
            <p className="text-xs text-amber-800 dark:text-amber-200">แสดงเฉพาะ 5,000 รายการล่าสุด กรุณาเลือกช่วงวันที่ให้แคบลง</p>
          )}
          <div className={tableWrapCls}>
            <table className={tableCls}>
              <thead className={theadCls}>
                <tr>
                  <th scope="col" className={thCls}>วันเวลา</th>
                  <th scope="col" className={thCls}>ประเภท</th>
                  <th scope="col" className={thCls}>เอกสาร</th>
                  <th scope="col" className={thCls}>พัสดุ</th>
                  <th scope="col" className={`${thCls} text-right`}>จำนวน</th>
                  <th scope="col" className={`${thCls} text-right`}>มูลค่า (บาท)</th>
                  <th scope="col" className={`${thCls} text-right`}>คงเหลือ</th>
                  <th scope="col" className={thCls}>หน่วยงาน/ผู้ขาย</th>
                  <th scope="col" className={thCls}>ผู้บันทึก</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {rows.length === 0 ? (
                  <EmptyRow colSpan={9}>ไม่มีรายการในช่วงนี้</EmptyRow>
                ) : (
                  rows.map((r) => (
                    <tr key={r.id}>
                      <td className={`${tdCls} whitespace-nowrap`}>{fmtDateTime(r.createdAt)}</td>
                      <td className={tdCls}>{MOVEMENT_TYPE_LABELS[r.type]}</td>
                      <td className={`${tdCls} whitespace-nowrap`}>
                        {r.docId && r.docNo?.startsWith("RQ") ? (
                          <Link href={`/erp/requisitions/view?id=${r.docId}`} className="text-brand-700 underline dark:text-brand-300">
                            {r.docNo}
                          </Link>
                        ) : (
                          (r.docNo ?? "-")
                        )}
                      </td>
                      <td className={tdCls}>
                        <span className="font-medium">{r.itemCode}</span> {r.itemName}
                        {r.lotNo && <span className="text-zinc-500"> · Lot {r.lotNo}</span>}
                        {r.note && <p className="text-zinc-500">{r.note}</p>}
                      </td>
                      <td
                        className={`${tdCls} whitespace-nowrap text-right tabular-nums ${
                          r.qtyChange < 0 ? "text-red-700 dark:text-red-300" : "text-emerald-700 dark:text-emerald-300"
                        }`}
                      >
                        {r.qtyChange > 0 ? "+" : ""}
                        {fmtQty(r.qtyChange)} {r.unit}
                      </td>
                      <td className={`${tdCls} text-right tabular-nums`}>{fmtMoney(r.valueChange)}</td>
                      <td className={`${tdCls} text-right tabular-nums`}>{fmtQty(r.qtyAfter)}</td>
                      <td className={tdCls}>{r.orgUnitName ?? r.vendorName ?? "-"}</td>
                      <td className={tdCls}>{r.createdByName}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}


// --- receipt / adjustment documents ----------------------------------------------------

const DOC_TYPE_LABELS: Record<StockDocType, string> = { RECEIPT: "ใบรับ", ADJUSTMENT: "ใบปรับยอด" };

function StockDocuments({ storeId, storeName }: { storeId: number; storeName: string }) {
  const [from, setFrom] = useState(daysAgo(30));
  const [to, setTo] = useState(todayBangkok());
  const [type, setType] = useState<StockDocType>("RECEIPT");
  const data = useErpGet<{ rows: StockDocumentRow[]; truncated: boolean }>(
    from && to ? `/api/erp/stock/documents?${new URLSearchParams({ storeId: String(storeId), type, from, to }).toString()}` : null,
  );
  const rows = data.data?.rows ?? [];
  // Only posted documents changed the stock.
  const total = rows.reduce((s, r) => s + (r.status === "posted" ? r.totalAmount : 0), 0);
  const truncNote = "แสดงเฉพาะ 2,000 รายการล่าสุด กรุณาเลือกช่วงวันที่ให้แคบลง";

  const excel: ExcelExport = {
    fileName: `erp-documents-${storeId}-${type.toLowerCase()}-${from}_${to}`,
    title: `${DOC_TYPE_LABELS[type]} ${storeName}`,
    subtitle: `ช่วงวันที่ ${fmtDate(from)} - ${fmtDate(to)}`,
    sheetName: DOC_TYPE_LABELS[type],
    columns: [
      { header: "เลขที่" },
      { header: "วันเวลา" },
      { header: "ชนิด" },
      { header: type === "RECEIPT" ? "ผู้ขาย" : "เหตุผล" },
      { header: "เลขที่ใบส่งของ" },
      { header: "จำนวนรายการ" },
      { header: "มูลค่ารวม (บาท)" },
      { header: "ผู้บันทึก" },
    ],
    rows: rows.map((r) => [
      `${r.docNo ?? "-"} (${DOC_STATUS_LABELS[r.status]})`,
      fmtDateTime(r.createdAt),
      DOC_TYPE_LABELS[r.docType],
      r.docType === "RECEIPT" ? r.vendorName : r.note || null,
      r.refNo || null,
      r.lineCount,
      Math.round(r.totalAmount * 100) / 100,
      r.createdByName,
    ]),
    footer: [["รวม", null, null, null, null, null, Math.round(total * 100) / 100, null]],
    notes: data.data?.truncated ? [truncNote] : undefined,
  };

  return (
    <section className={`${cardCls} space-y-3`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SectionTitle icon={FileText}>ใบรับ / ใบปรับยอด {storeName}</SectionTitle>
        {data.data && <ExcelDownloadButton data={excel} />}
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <label className={labelCls}>
          <span className="font-medium">ชนิดเอกสาร</span>
          <select className={`${inputCls} w-40`} value={type} onChange={(e) => setType(e.target.value as StockDocType)}>
            <option value="RECEIPT">{DOC_TYPE_LABELS.RECEIPT}</option>
            <option value="ADJUSTMENT">{DOC_TYPE_LABELS.ADJUSTMENT}</option>
          </select>
        </label>
        <label className={labelCls}>
          <span className="font-medium">ตั้งแต่</span>
          <input type="date" className={`${inputCls} w-40`} value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className={labelCls}>
          <span className="font-medium">ถึง</span>
          <input type="date" className={`${inputCls} w-40`} value={to} min={from} onChange={(e) => setTo(e.target.value)} />
        </label>
      </div>
      {data.error ? (
        <ErrorCard error={data.error} onRetry={data.reload} />
      ) : !data.data ? (
        <LoadingCard />
      ) : (
        <>
          {data.data.truncated && <p className="text-xs text-amber-800 dark:text-amber-200">{truncNote}</p>}
          <div className={tableWrapCls}>
            <table className={tableCls}>
              <thead className={theadCls}>
                <tr>
                  <th scope="col" className={thCls}>เลขที่</th>
                  <th scope="col" className={thCls}>วันที่</th>
                  <th scope="col" className={thCls}>ชนิด</th>
                  <th scope="col" className={thCls}>{type === "RECEIPT" ? "ผู้ขาย" : "เหตุผล"}</th>
                  <th scope="col" className={`${thCls} text-right`}>จำนวนรายการ</th>
                  <th scope="col" className={`${thCls} text-right`}>มูลค่ารวม (บาท)</th>
                  <th scope="col" className={thCls}>ผู้บันทึก</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {rows.length === 0 ? (
                  <EmptyRow colSpan={7}>ไม่มีเอกสารในช่วงนี้</EmptyRow>
                ) : (
                  rows.map((r) => (
                    <tr key={r.id}>
                      <td className={`${tdCls} whitespace-nowrap font-medium`}>
                        {r.docNo ?? "-"}
                        <span className="ml-1">
                          <StatusBadge status={r.status} />
                        </span>
                      </td>
                      <td className={`${tdCls} whitespace-nowrap`}>{fmtDateTime(r.createdAt)}</td>
                      <td className={tdCls}>{DOC_TYPE_LABELS[r.docType]}</td>
                      <td className={tdCls}>
                        {r.docType === "RECEIPT" ? (r.vendorName ?? "-") : r.note || "-"}
                        {r.refNo && <p className="text-zinc-500">ใบส่งของ {r.refNo}</p>}
                      </td>
                      <td className={`${tdCls} text-right tabular-nums`}>{r.lineCount.toLocaleString("th-TH")}</td>
                      <td className={`${tdCls} text-right tabular-nums`}>{fmtMoney(r.totalAmount)}</td>
                      <td className={tdCls}>{r.createdByName}</td>
                    </tr>
                  ))
                )}
              </tbody>
              <tfoot className="bg-zinc-50 font-semibold dark:bg-zinc-900">
                <tr>
                  <td className={tdCls} colSpan={5}>
                    รวม {rows.length.toLocaleString("th-TH")} ฉบับ
                  </td>
                  <td className={`${tdCls} text-right tabular-nums`}>{fmtMoney(total)}</td>
                  <td className={tdCls} />
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}
    </section>
  );
}

// --- receive ---------------------------------------------------------------------------

interface ReceiveLine {
  key: number;
  itemId: number | null;
  qty: string;
  unitCost: string;
  lotNo: string;
  expiryDate: string;
}

let receiveKey = 0;
const newReceiveLine = (): ReceiveLine => ({ key: ++receiveKey, itemId: null, qty: "", unitCost: "", lotNo: "", expiryDate: "" });

function ReceiveForm({ storeId, lookups, onDone }: { storeId: number; lookups: ErpLookups; onDone: () => void }) {
  const [vendorId, setVendorId] = useState<number | null>(null);
  const [refNo, setRefNo] = useState("");
  const [refDate, setRefDate] = useState(todayBangkok());
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<ReceiveLine[]>(() => [newReceiveLine()]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<PostedDocResponse | null>(null);
  // One key per submission: a retry of the same submission cannot receive twice.
  const [idempotencyKey, setIdempotencyKey] = useState(newIdempotencyKey);

  const update = (key: number, patch: Partial<ReceiveLine>) =>
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const total = lines.reduce((s, l) => {
    const q = parseNumberInput(l.qty) ?? 0;
    const c = parseNumberInput(l.unitCost) ?? 0;
    return s + q * c;
  }, 0);

  async function submit() {
    const filled = lines.filter((l) => l.itemId !== null || l.qty.trim());
    if (filled.length === 0) return setError("กรุณาเพิ่มรายการรับเข้าอย่างน้อย 1 รายการ");
    const out: ReceiptInput["lines"] = [];
    for (const [i, l] of filled.entries()) {
      const qty = parseNumberInput(l.qty);
      const unitCost = parseNumberInput(l.unitCost);
      if (l.itemId === null) return setError(`รายการที่ ${i + 1}: กรุณาเลือกพัสดุจากรายการ`);
      if (qty === null || qty <= 0) return setError(`รายการที่ ${i + 1}: จำนวนต้องมากกว่า 0`);
      if (unitCost === null || unitCost < 0) return setError(`รายการที่ ${i + 1}: ราคาต่อหน่วยไม่ถูกต้อง`);
      out.push({ itemId: l.itemId, qty, unitCost, lotNo: l.lotNo.trim(), expiryDate: l.expiryDate || null });
    }
    setBusy(true);
    setError(null);
    try {
      const body: ReceiptInput = {
        storeId,
        vendorId,
        refNo: refNo.trim(),
        refDate: refDate || null,
        note: note.trim(),
        lines: out,
        idempotencyKey,
      };
      setDone(await erpFetch<PostedDocResponse>("/api/erp/stock/receipts", { method: "POST", body }));
      setIdempotencyKey(newIdempotencyKey());
      setLines([newReceiveLine()]);
      setRefNo("");
      setNote("");
    } catch (err) {
      setError(err instanceof ErpClientError ? err.message : "บันทึกไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className={`${cardCls} space-y-4`}
      onSubmit={(e) => {
        e.preventDefault();
        if (!busy) void submit();
      }}
    >
      <SectionTitle icon={ArrowDownToLine}>บันทึกรับพัสดุเข้าคลัง</SectionTitle>
      {done && (
        <p role="status" className="rounded-md bg-emerald-50 px-3 py-2 text-xs text-emerald-900 dark:bg-emerald-900/30 dark:text-emerald-100">
          บันทึกใบรับเลขที่ {done.docNo} แล้ว ({done.movements} รายการ){" "}
          <button type="button" className="underline" onClick={onDone}>
            ดูคงคลัง
          </button>
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-3">
        <label className={labelCls}>
          <span className="font-medium">ผู้ขาย</span>
          <select className={inputCls} value={vendorId ?? ""} onChange={(e) => setVendorId(Number(e.target.value) || null)}>
            <option value="">-- ไม่ระบุ --</option>
            {lookups.vendors.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </label>
        <label className={labelCls}>
          <span className="font-medium">เลขที่ใบส่งของ</span>
          <input type="text" className={inputCls} maxLength={50} value={refNo} onChange={(e) => setRefNo(e.target.value)} />
        </label>
        <label className={labelCls}>
          <span className="font-medium">วันที่ใบส่งของ</span>
          <input type="date" className={inputCls} value={refDate} onChange={(e) => setRefDate(e.target.value)} />
        </label>
        <label className={`${labelCls} sm:col-span-3`}>
          <span className="font-medium">หมายเหตุ</span>
          <input type="text" className={inputCls} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
      </div>
      <div className={tableWrapCls}>
        <table className={tableCls}>
          <thead className={theadCls}>
            <tr>
              <th scope="col" className={thCls}>พัสดุ</th>
              <th scope="col" className={thCls}>จำนวน</th>
              <th scope="col" className={thCls}>ราคา/หน่วย (บาท)</th>
              <th scope="col" className={thCls}>Lot</th>
              <th scope="col" className={thCls}>วันหมดอายุ</th>
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
                  <td className={tdCls}>
                    <ItemPicker
                      items={lookups.items}
                      value={l.itemId}
                      label={`พัสดุรายการที่ ${i + 1}`}
                      onChange={(itemId) => {
                        const it = lookups.items.find((x) => x.id === itemId);
                        update(l.key, {
                          itemId,
                          unitCost: l.unitCost || (it && it.lastUnitCost > 0 ? String(it.lastUnitCost) : ""),
                        });
                      }}
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
                        onChange={(e) => update(l.key, { qty: e.target.value })}
                      />
                      <span className="text-zinc-500">{item?.unit}</span>
                    </div>
                  </td>
                  <td className={tdCls}>
                    <input
                      type="text"
                      inputMode="decimal"
                      aria-label={`ราคาต่อหน่วยรายการที่ ${i + 1}`}
                      className={`${inputCls} w-28 text-right`}
                      value={l.unitCost}
                      onChange={(e) => update(l.key, { unitCost: e.target.value })}
                    />
                  </td>
                  <td className={tdCls}>
                    <input
                      type="text"
                      aria-label={`Lot รายการที่ ${i + 1}`}
                      className={`${inputCls} w-28`}
                      maxLength={50}
                      value={l.lotNo}
                      onChange={(e) => update(l.key, { lotNo: e.target.value })}
                    />
                  </td>
                  <td className={tdCls}>
                    <input
                      type="date"
                      aria-label={`วันหมดอายุรายการที่ ${i + 1}`}
                      className={`${inputCls} w-36`}
                      value={l.expiryDate}
                      onChange={(e) => update(l.key, { expiryDate: e.target.value })}
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
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button type="button" className={btnOutline} disabled={lines.length >= 200} onClick={() => setLines((ls) => [...ls, newReceiveLine()])}>
          <Plus aria-hidden="true" className={iconCls} />
          เพิ่มรายการ
        </button>
        <p className="text-sm font-semibold">มูลค่ารวม {fmtMoney(total)} บาท</p>
      </div>
      <InlineError message={error} />
      <button type="submit" className={btnPrimary} disabled={busy}>
        <BusyIcon busy={busy} icon={Save} />
        บันทึกรับเข้าคลัง
      </button>
    </form>
  );
}

// --- adjust / count -------------------------------------------------------------------------

function AdjustForm({ storeId, lookups }: { storeId: number; lookups: ErpLookups }) {
  const [mode, setMode] = useState<"count" | "adjust">("count");
  const [itemId, setItemId] = useState<number | null>(null);
  const [qty, setQty] = useState("");
  const [lotNo, setLotNo] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState(newIdempotencyKey);
  // System balance shown to the officer = expectedQty sent with the request.
  const balances = useErpGet<{ rows: StockBalanceRow[] }>(`/api/erp/stock?storeId=${storeId}&includeZero=1`);
  const balance = itemId === null ? null : (balances.data?.rows.find((r) => r.itemId === itemId) ?? null);
  const systemQty = itemId === null || !balances.data ? null : (balance?.qtyOnHand ?? 0);

  async function submit() {
    const q = parseNumberInput(qty);
    if (itemId === null) return setError("กรุณาเลือกพัสดุ");
    if (systemQty === null) return setError("กำลังโหลดยอดในระบบ กรุณารอสักครู่");
    if (q === null || (mode === "count" && q < 0) || (mode === "adjust" && q === 0)) {
      return setError(mode === "count" ? "จำนวนที่นับได้ไม่ถูกต้อง" : "จำนวนที่ปรับต้องไม่เป็น 0 (ติดลบ = ลดยอด)");
    }
    if (!note.trim()) return setError("กรุณาระบุเหตุผล");
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const res = await erpFetch<PostedDocResponse>("/api/erp/stock/adjustments", {
        method: "POST",
        body: {
          storeId,
          itemId,
          mode,
          qty: q,
          expectedQty: systemQty,
          lotNo: lotNo.trim(),
          expiryDate: expiryDate || null,
          note: note.trim(),
          idempotencyKey,
        },
      });
      setDone(`ส่งใบปรับยอดเลขที่ ${res.docNo} แล้ว รอการเงิน/ผู้บริหารอนุมัติก่อนจึงจะปรับยอดคลัง`);
      setQty("");
      setNote("");
      setIdempotencyKey(newIdempotencyKey());
    } catch (err) {
      setError(err instanceof ErpClientError ? err.message : "บันทึกไม่สำเร็จ");
      // Stock moved since the count: show the new balance; a new count is needed.
      if (err instanceof ErpClientError && err.code === "stale_count") {
        balances.reload();
        setIdempotencyKey(newIdempotencyKey());
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <form
        className={`${cardCls} space-y-4`}
        onSubmit={(e) => {
          e.preventDefault();
          if (!busy) void submit();
        }}
      >
        <SectionTitle icon={ClipboardPen}>ขอปรับปรุงยอด / บันทึกผลตรวจนับ</SectionTitle>
        <fieldset className="flex flex-wrap gap-4 text-xs">
          <legend className="sr-only">ประเภท</legend>
          <label className="inline-flex items-center gap-1.5">
            <input type="radio" name="adjust-mode" className="accent-brand-700" checked={mode === "count"} onChange={() => setMode("count")} />
            ตรวจนับ (กรอกจำนวนที่นับได้จริง ระบบคำนวณส่วนต่าง)
          </label>
          <label className="inline-flex items-center gap-1.5">
            <input type="radio" name="adjust-mode" className="accent-brand-700" checked={mode === "adjust"} onChange={() => setMode("adjust")} />
            ปรับยอด (+ เพิ่ม / - ลด เช่น ชำรุด หมดอายุ)
          </label>
        </fieldset>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className={labelCls}>
            <span className="font-medium">พัสดุ</span>
            <ItemPicker items={lookups.items} value={itemId} onChange={setItemId} label="พัสดุที่ปรับยอด" />
          </div>
          <div className="space-y-1 text-xs">
            <span className="font-medium">ยอดในระบบขณะนี้</span>
            <p className="flex items-center gap-2">
              <span className="text-sm font-semibold tabular-nums">
                {systemQty === null ? "-" : `${fmtQty(systemQty)} ${balance?.unit ?? ""}`}
              </span>
              <button type="button" className={btnOutline} onClick={balances.reload}>
                โหลดยอดใหม่
              </button>
            </p>
          </div>
          <label className={labelCls}>
            <span className="font-medium">{mode === "count" ? "จำนวนที่นับได้" : "จำนวนที่ปรับ (+/-)"}</span>
            <input type="text" inputMode="decimal" className={inputCls} value={qty} onChange={(e) => setQty(e.target.value)} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className={labelCls}>
              <span className="font-medium">Lot (ไม่บังคับ)</span>
              <input type="text" className={inputCls} maxLength={50} value={lotNo} onChange={(e) => setLotNo(e.target.value)} />
            </label>
            <label className={labelCls}>
              <span className="font-medium">วันหมดอายุของล็อต</span>
              <input type="date" className={inputCls} value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} />
            </label>
          </div>
          <label className={`${labelCls} sm:col-span-2`}>
            <span className="font-medium">เหตุผล (จำเป็น)</span>
            <textarea className={inputCls} rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
        </div>
        <ul className="list-disc space-y-0.5 pl-5 text-xs text-zinc-600 dark:text-zinc-400">
          <li>ใบปรับยอดต้องให้การเงินหรือผู้บริหาร (ไม่ใช่ผู้บันทึก) อนุมัติก่อน ยอดคลังจึงเปลี่ยน</li>
          <li>ตรวจนับ: ถ้ายอดในระบบเปลี่ยนระหว่างรออนุมัติ ระบบจะไม่ลงบัญชี ต้องตรวจนับใหม่</li>
          <li>เพิ่มยอดใช้ต้นทุนถัวเฉลี่ยปัจจุบัน (ถ้ายอดเป็น 0 ใช้ราคารับเข้าล่าสุด) กำหนดราคาเองไม่ได้</li>
          <li>ระบุ Lot = ปรับเฉพาะล็อตนั้น (ใช้ตัดยอดล็อตหมดอายุ) ไม่ระบุ = ตัดล็อตที่หมดอายุก่อน (FEFO)</li>
        </ul>
        <InlineError message={error} />
        {done && (
          <p role="status" className="text-xs text-emerald-800 dark:text-emerald-200">
            {done}
          </p>
        )}
        <button type="submit" className={btnPrimary} disabled={busy}>
          <BusyIcon busy={busy} icon={Save} />
          ส่งขออนุมัติ
        </button>
      </form>
      <AdjustmentList storeId={storeId} title="ใบปรับยอดรออนุมัติของคลังนี้" />
    </div>
  );
}
