"use client";

import Link from "next/link";
import { ClipboardCheck, ClipboardList, FilePlus2, PackageCheck, ShieldCheck } from "lucide-react";
import {
  ERP_ROLE_LABELS,
  type ErpLookups,
  type ErpMe,
  type ErpSummary,
} from "@/lib/erp/types";
import { useErpGet } from "./erp-client";
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

      <div className="grid gap-3 sm:grid-cols-3">
        {isHead && <CountCard label="ใบเบิกรออนุมัติ" value={counts.toApprove} icon={ClipboardCheck} />}
        {isOfficer && <CountCard label="ใบเบิกรอจ่าย" value={counts.toIssue} icon={PackageCheck} />}
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
