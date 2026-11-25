"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, ClipboardList, FilePlus2 } from "lucide-react";
import {
  DOC_STATUS_LABELS,
  isDocStatus,
  REQUISITION_SCOPES,
  type ErpLookups,
  type ErpMe,
  type RequisitionScope,
  type RequisitionSummary,
} from "@/lib/erp/types";
import { useErpGet } from "./erp-client";
import { RequisitionTable } from "./RequisitionTable";
import { btnOutline, btnPrimary, cardCls, ErrorCard, iconCls, inputCls, LoadingCard, SectionTitle } from "./ui";

const SCOPE_LABELS: Record<RequisitionScope, string> = {
  mine: "หน่วยงานของฉัน",
  approve: "รออนุมัติ",
  issue: "รอจ่าย",
  all: "ทั้งหมด",
};

const REQUISITION_STATUSES = ["draft", "submitted", "approved", "rejected", "issued", "cancelled"] as const;

function scopesFor(me: ErpMe): RequisitionScope[] {
  const viewAll = me.appAdmin || me.roles.some((r) => ["erp_admin", "finance", "director"].includes(r.role));
  const officer = me.roles.some((r) => r.role === "store_officer");
  return REQUISITION_SCOPES.filter((s) => {
    if (s === "approve") return me.roles.some((r) => r.role === "unit_head");
    if (s === "issue") return officer;
    if (s === "all") return viewAll || officer;
    return true;
  });
}

interface ListResponse {
  items: RequisitionSummary[];
  total: number;
  page: number;
  pageSize: number;
}

/** /erp/requisitions?scope=&status=&page= */
export function RequisitionListClient() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const lookups = useErpGet<ErpLookups & { me: ErpMe }>("/api/erp/lookups");

  const scopeRaw = params.get("scope") ?? "mine";
  const scope = (REQUISITION_SCOPES as readonly string[]).includes(scopeRaw) ? (scopeRaw as RequisitionScope) : "mine";
  const statusRaw = params.get("status");
  const status = isDocStatus(statusRaw) ? statusRaw : "";
  const page = Math.max(1, Number(params.get("page")) || 1);

  const qs = new URLSearchParams({ scope, page: String(page) });
  if (status) qs.set("status", status);
  const list = useErpGet<ListResponse>(`/api/erp/requisitions?${qs.toString()}`);

  const go = (next: { scope?: RequisitionScope; status?: string; page?: number }) => {
    const q = new URLSearchParams();
    q.set("scope", next.scope ?? scope);
    const st = next.status ?? status;
    if (st) q.set("status", st);
    const pg = next.page ?? 1;
    if (pg > 1) q.set("page", String(pg));
    router.replace(`${pathname}?${q.toString()}`, { scroll: false });
  };

  if (lookups.error) return <ErrorCard error={lookups.error} onRetry={lookups.reload} />;
  if (!lookups.data) return <LoadingCard />;
  const me = lookups.data.me;
  const scopes = scopesFor(me);
  const canCreate = me.roles.some((r) => r.role === "recorder" || r.role === "unit_head");
  const pages = list.data ? Math.max(1, Math.ceil(list.data.total / list.data.pageSize)) : 1;

  return (
    <div className={`${cardCls} space-y-4`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SectionTitle icon={ClipboardList}>ใบเบิกพัสดุ</SectionTitle>
        {canCreate && (
          <Link href="/erp/requisitions/new" className={btnPrimary}>
            <FilePlus2 aria-hidden="true" className={iconCls} />
            สร้างใบเบิก
          </Link>
        )}
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <nav aria-label="ขอบเขตใบเบิก" className="flex flex-wrap gap-2">
          {scopes.map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={s === scope}
              onClick={() => go({ scope: s })}
              className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                s === scope
                  ? "bg-brand-700 text-white"
                  : "bg-brand-50 text-brand-800 hover:bg-brand-100 dark:bg-brand-900/30 dark:text-brand-100"
              }`}
            >
              {SCOPE_LABELS[s]}
            </button>
          ))}
        </nav>
        <label className="space-y-1 text-xs">
          <span className="font-medium">สถานะ</span>
          <select className={`${inputCls} w-40`} value={status} onChange={(e) => go({ status: e.target.value })}>
            <option value="">ทุกสถานะ</option>
            {REQUISITION_STATUSES.map((s) => (
              <option key={s} value={s}>
                {DOC_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </label>
      </div>

      {list.error ? (
        <ErrorCard error={list.error} onRetry={list.reload} />
      ) : !list.data ? (
        <LoadingCard />
      ) : (
        <>
          <RequisitionTable items={list.data.items} />
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="text-zinc-600 dark:text-zinc-400">
              ทั้งหมด {list.data.total.toLocaleString("th-TH")} ใบ · หน้า {page}/{pages}
            </span>
            <div className="flex gap-2">
              <button type="button" className={btnOutline} disabled={page <= 1} onClick={() => go({ page: page - 1 })}>
                <ChevronLeft aria-hidden="true" className={iconCls} />
                ก่อนหน้า
              </button>
              <button type="button" className={btnOutline} disabled={page >= pages} onClick={() => go({ page: page + 1 })}>
                ถัดไป
                <ChevronRight aria-hidden="true" className={iconCls} />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
