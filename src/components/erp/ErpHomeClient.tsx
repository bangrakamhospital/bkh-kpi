"use client";

import Link from "next/link";
import { BellRing, ClipboardCheck, ClipboardList, FilePlus2, PackageCheck, ShieldCheck } from "lucide-react";
import {
  ERP_ROLE_LABELS,
  type ErpLookups,
  type ErpMe,
  type ErpSummary,
  type StockBalanceRow,
} from "@/lib/erp/types";
import { fmtDate, fmtQty, todayBangkok, useErpGet } from "./erp-client";
import { AdjustmentList } from "./AdjustmentList";
import { RequisitionTable } from "./RequisitionTable";
import { btnPrimary, cardCls, ErrorCard, iconCls, LoadingCard, SectionTitle } from "./ui";

function RoleChips({ me, lookups }: { me: ErpMe; lookups: ErpLookups | undefined }) {
  const unitName = (id: number | null) => lookups?.orgUnits.find((u) => u.id === id)?.name ?? `#${id}`;
  const storeName = (id: number | null) =>
    id === null ? "ทุกคลัง" : (lookups?.stores.find((s) => s.id === id)?.name ?? `#${id}`);
  const chips = me.roles.map((r) => {
    const scope =
      r.orgUnitId !== null ? ` · ${unitName(r.orgUnitId)}` : r.role === "store_officer" ? ` · ${storeName(r.storeId)}` : "";
    return `${ERP_ROLE_LABELS[r.role]}${scope}`;
  });
  if (me.appAdmin) chips.unshift("ผู้ดูแลระบบเว็บ (สิทธิ์ผู้ดูแล ERP)");
  if (chips.length === 0) {
    return (
      <p className="text-xs text-amber-800 dark:text-amber-200">
        คุณยังไม่มีบทบาทในระบบ ERP กรุณาติดต่อผู้ดูแลระบบ ERP เพื่อกำหนดหน่วยงานและบทบาท
      </p>
    );
  }
  return (
    <ul className="flex flex-wrap gap-1.5">
      {chips.map((c) => (
        <li
          key={c}
          className="rounded-full bg-brand-50 px-2.5 py-1 text-xs text-brand-900 dark:bg-brand-900/30 dark:text-brand-100"
        >
          {c}
        </li>
      ))}
    </ul>
  );
}

function CountCard({ label, value, icon: Icon }: { label: string; value: number; icon: typeof ClipboardList }) {
  return (
    <div className={`${cardCls} flex items-center gap-3`}>
      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-200">
        <Icon aria-hidden="true" className={iconCls} />
      </span>
      <div>
        <p className="text-xs text-zinc-600 dark:text-zinc-400">{label}</p>
        <p className="text-base font-bold tabular-nums">{value.toLocaleString("th-TH")}</p>
      </div>
    </div>
  );
}

const EXPIRY_DAYS = 90;

function StoreAlerts({ storeId, storeName }: { storeId: number; storeName: string }) {
  const data = useErpGet<{ rows: StockBalanceRow[] }>(`/api/erp/stock?storeId=${storeId}`);
  if (data.error) return <ErrorCard error={data.error} onRetry={data.reload} />;
  if (!data.data) return <LoadingCard />;
  const limit = new Date(`${todayBangkok()}T00:00:00Z`).getTime() + EXPIRY_DAYS * 86_400_000;
  const low = data.data.rows.filter((r) => r.reorderPoint > 0 && r.qtyOnHand <= r.reorderPoint);
  const expiring = data.data.rows
    .filter((r) => r.qtyOnHand > 0 && r.nearestExpiry !== null && new Date(`${r.nearestExpiry}T00:00:00Z`).getTime() <= limit)
    .sort((a, b) => (a.nearestExpiry ?? "").localeCompare(b.nearestExpiry ?? ""));
  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold">{storeName}</p>
      {low.length === 0 && expiring.length === 0 && (
        <p className="text-xs text-zinc-600 dark:text-zinc-400">ไม่มีรายการที่ต้องแจ้งเตือน</p>
      )}
      {low.length > 0 && (
        <div>
          <p className="text-xs font-medium text-red-700 dark:text-red-300">
            พัสดุคงเหลือต่ำกว่าจุดสั่งซื้อ ({low.length.toLocaleString("th-TH")} รายการ)
          </p>
          <ul className="list-disc space-y-0.5 pl-5 text-xs">
            {low.slice(0, 10).map((r) => (
              <li key={r.itemId}>
                {r.itemCode} {r.itemName} — คงเหลือ {fmtQty(r.qtyOnHand)} {r.unit} (จุดสั่งซื้อ {fmtQty(r.reorderPoint)})
              </li>
            ))}
          </ul>
        </div>
      )}
      {expiring.length > 0 && (
        <div>
          <p className="text-xs font-medium text-amber-800 dark:text-amber-200">
            ล็อตใกล้หมดอายุภายใน {EXPIRY_DAYS} วัน ({expiring.length.toLocaleString("th-TH")} รายการ)
          </p>
          <ul className="list-disc space-y-0.5 pl-5 text-xs">
            {expiring.slice(0, 10).map((r) => (
              <li key={r.itemId}>
                {r.itemCode} {r.itemName} — หมดอายุ {fmtDate(r.nearestExpiry)}
              </li>
            ))}
          </ul>
        </div>
      )}
      {(low.length > 10 || expiring.length > 10) && (
        <Link href={`/erp/stock?store=${storeId}&tab=balances`} className="text-xs text-brand-700 underline dark:text-brand-300">
          ดูคงคลังทั้งหมด
        </Link>
      )}
    </div>
  );
}

function StockAlerts({ me, lookups }: { me: ErpMe; lookups: ErpLookups | undefined }) {
  const grants = me.roles.filter((r) => r.role === "store_officer");
  const all = grants.some((r) => r.storeId === null);
  const stores = (lookups?.stores ?? []).filter((s) => all || grants.some((g) => g.storeId === s.id));
  return (
    <section className={`${cardCls} space-y-3`}>
      <SectionTitle icon={BellRing}>แจ้งเตือนคลังพัสดุ</SectionTitle>
      {!lookups ? (
        <LoadingCard />
      ) : stores.length === 0 ? (
        <p className="text-xs text-zinc-600 dark:text-zinc-400">ไม่พบคลังที่รับผิดชอบ</p>
      ) : (
        stores.map((s) => <StoreAlerts key={s.id} storeId={s.id} storeName={s.name} />)
      )}
    </section>
  );
}

/** /erp: work waiting for me + my unit's requisitions. */
export function ErpHomeClient() {
  const summary = useErpGet<ErpSummary>("/api/erp/summary");
  const lookups = useErpGet<ErpLookups>("/api/erp/lookups");

  if (summary.loading) return <LoadingCard />;
  if (summary.error || !summary.data) {
    return summary.error ? <ErrorCard error={summary.error} onRetry={summary.reload} /> : <LoadingCard />;
  }
  const { me, counts, toApprove, toIssue, mine } = summary.data;
  const isHead = me.roles.some((r) => r.role === "unit_head");
  const isOfficer = me.roles.some((r) => r.role === "store_officer");
  const isAdjustApprover = me.roles.some((r) => r.role === "finance" || r.role === "director");
  const canCreate = me.roles.some((r) => r.role === "recorder" || r.role === "unit_head");

  return (
    <div className="space-y-4">
      <div className={`${cardCls} space-y-3`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <SectionTitle icon={ShieldCheck}>บทบาทของฉัน</SectionTitle>
          {canCreate && (
            <Link href="/erp/requisitions/new" className={btnPrimary}>
              <FilePlus2 aria-hidden="true" className={iconCls} />
              สร้างใบเบิกพัสดุ
            </Link>
          )}
        </div>
        <RoleChips me={me} lookups={lookups.data} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {isHead && <CountCard label="ใบเบิกรออนุมัติ" value={counts.toApprove} icon={ClipboardCheck} />}
        {isOfficer && <CountCard label="ใบเบิกรอจ่าย" value={counts.toIssue} icon={PackageCheck} />}
        {isAdjustApprover && (
          <CountCard label="ใบปรับยอดคลังรออนุมัติ" value={counts.adjustmentsToApprove} icon={ClipboardCheck} />
        )}
        <CountCard label="ร่างใบเบิกของหน่วยงาน" value={counts.drafts} icon={ClipboardList} />
      </div>

      {isHead && (
        <section className={`${cardCls} space-y-3`}>
          <SectionTitle icon={ClipboardCheck}>รออนุมัติ</SectionTitle>
          <RequisitionTable items={toApprove} empty="ไม่มีใบเบิกรออนุมัติ" />
          {counts.toApprove > toApprove.length && (
            <Link href="/erp/requisitions?scope=approve" className="text-xs text-brand-700 underline dark:text-brand-300">
              ดูทั้งหมด ({counts.toApprove.toLocaleString("th-TH")})
            </Link>
          )}
        </section>
      )}

      {isAdjustApprover && (
        <AdjustmentList title="ใบปรับยอด/ตรวจนับคลังรออนุมัติ (ต้องเป็นคนละคนกับผู้บันทึก)" onlyActionable onChanged={summary.reload} />
      )}

      {isOfficer && <StockAlerts me={me} lookups={lookups.data} />}

      {isOfficer && (
        <section className={`${cardCls} space-y-3`}>
          <SectionTitle icon={PackageCheck}>รอจ่ายพัสดุ</SectionTitle>
          <RequisitionTable items={toIssue} empty="ไม่มีใบเบิกรอจ่าย" />
          {counts.toIssue > toIssue.length && (
            <Link href="/erp/requisitions?scope=issue" className="text-xs text-brand-700 underline dark:text-brand-300">
              ดูทั้งหมด ({counts.toIssue.toLocaleString("th-TH")})
            </Link>
          )}
        </section>
      )}

      <section className={`${cardCls} space-y-3`}>
        <SectionTitle icon={ClipboardList}>ใบเบิกของหน่วยงานฉัน (ล่าสุด)</SectionTitle>
        <RequisitionTable items={mine} empty="ยังไม่มีใบเบิก" />
        <Link href="/erp/requisitions" className="text-xs text-brand-700 underline dark:text-brand-300">
          ดูใบเบิกทั้งหมด
        </Link>
      </section>
    </div>
  );
}
