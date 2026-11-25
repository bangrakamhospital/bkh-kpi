"use client";

import { useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Check, Database, KeyRound, Pencil, Plus, Trash2, X } from "lucide-react";
import {
  MASTER_ENTITIES,
  MASTER_SPECS,
  type MasterEntity,
  type MasterField,
  type MasterListResponse,
  type MasterRow,
  type MasterRowResponse,
} from "@/lib/erp/master-schema";
import {
  ERP_ROLE_LABELS,
  ERP_ROLES,
  UNIT_SCOPED_ROLES,
  type ErpRole,
  type RolesResponse,
} from "@/lib/erp/types";
import { erpFetch, ErpClientError, fmtDateTime, parseNumberInput, useErpGet } from "./erp-client";
import {
  btnDanger,
  btnOutline,
  btnPrimary,
  btnSuccess,
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
} from "./ui";

type TabKey = MasterEntity | "roles";
const TAB_KEYS: readonly TabKey[] = [...MASTER_ENTITIES, "roles"];

/** /erp/admin?tab= : master data + ERP role grants (erp_admin / web admin; the API enforces it). */
export function ErpAdminClient() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const raw = params.get("tab");
  const tab: TabKey = TAB_KEYS.includes(raw as TabKey) ? (raw as TabKey) : "org-units";

  return (
    <div className="space-y-4">
      <nav aria-label="ข้อมูลหลัก" className="flex flex-wrap gap-2">
        {TAB_KEYS.map((k) => (
          <button
            key={k}
            type="button"
            aria-pressed={k === tab}
            onClick={() => router.replace(`${pathname}?tab=${k}`, { scroll: false })}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium ${
              k === tab
                ? "bg-brand-700 text-white"
                : "bg-surface text-brand-800 hover:bg-brand-50 dark:text-brand-100 dark:hover:bg-brand-900/30"
            }`}
          >
            {k === "roles" ? <KeyRound aria-hidden="true" className={iconCls} /> : <Database aria-hidden="true" className={iconCls} />}
            {k === "roles" ? "บทบาทผู้ใช้" : MASTER_SPECS[k].label}
          </button>
        ))}
      </nav>
      {tab === "roles" ? <RoleEditor /> : <MasterEditor key={tab} entity={tab} />}
    </div>
  );
}

// --- master data --------------------------------------------------------------------------

type FormValues = Record<string, string | boolean>;

function emptyValues(fields: readonly MasterField[]): FormValues {
  return Object.fromEntries(
    fields.map((f) => [f.name, f.kind === "bool" ? f.default : f.kind === "enum" ? f.default : ""]),
  );
}

function rowValues(fields: readonly MasterField[], row: MasterRow): FormValues {
  return Object.fromEntries(
    fields.map((f) => {
      const v = row[f.name];
      return [f.name, f.kind === "bool" ? v === true : v === null || v === undefined ? "" : String(v)];
    }),
  );
}

/** Form values -> API body (only the fields of the spec). */
function toBody(fields: readonly MasterField[], values: FormValues): Record<string, unknown> | string {
  const body: Record<string, unknown> = {};
  for (const f of fields) {
    const v = values[f.name];
    switch (f.kind) {
      case "bool":
        body[f.name] = v === true;
        break;
      case "ref":
        body[f.name] = v ? Number(v) : null;
        break;
      case "decimal": {
        if (v === "") {
          body[f.name] = 0;
          break;
        }
        const n = parseNumberInput(String(v));
        if (n === null || n < 0) return `${f.label}ไม่ถูกต้อง`;
        body[f.name] = n;
        break;
      }
      case "code":
        body[f.name] = String(v).trim() || null;
        break;
      default:
        body[f.name] = String(v);
    }
  }
  return body;
}

function useRefLists(entity: MasterEntity) {
  const refs = MASTER_SPECS[entity].fields.flatMap((f) => (f.kind === "ref" ? [f.ref] : []));
  const orgUnits = useErpGet<MasterListResponse>(
    refs.includes("org-units") && entity !== "org-units" ? "/api/erp/admin/org-units" : null,
  );
  const categories = useErpGet<MasterListResponse>(refs.includes("categories") ? "/api/erp/admin/categories" : null);
  return { "org-units": orgUnits.data?.rows, categories: categories.data?.rows } as Partial<Record<MasterEntity, MasterRow[]>>;
}

function MasterEditor({ entity }: { entity: MasterEntity }) {
  const spec = MASTER_SPECS[entity];
  const list = useErpGet<MasterListResponse>(`/api/erp/admin/${entity}`);
  const refLists = useRefLists(entity);
  const [form, setForm] = useState<{ id: number | null; values: FormValues } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  const rows = useMemo(() => list.data?.rows ?? [], [list.data]);
  const refRows = (ref: MasterEntity) => (ref === entity ? rows : (refLists[ref] ?? []));
  const refName = (ref: MasterEntity, id: unknown) => {
    const r = refRows(ref).find((x) => x.id === id);
    return r ? String(r[MASTER_SPECS[ref].titleField] ?? r.id) : id === null || id === undefined ? "-" : `#${id}`;
  };
  const shown = useMemo(() => {
    const f = filter.trim().toLowerCase();
    return f
      ? rows.filter((r) => spec.fields.some((fl) => String(r[fl.name] ?? "").toLowerCase().includes(f)))
      : rows;
  }, [rows, filter, spec.fields]);

  if (list.error) return <ErrorCard error={list.error} onRetry={list.reload} />;
  if (!list.data) return <LoadingCard />;

  async function save() {
    if (!form) return;
    const body = toBody(spec.fields, form.values);
    if (typeof body === "string") return setError(body);
    setBusy(true);
    setError(null);
    try {
      const res = await erpFetch<MasterRowResponse>(
        form.id === null ? `/api/erp/admin/${entity}` : `/api/erp/admin/${entity}/${form.id}`,
        { method: form.id === null ? "POST" : "PATCH", body },
      );
      list.setData({
        rows: form.id === null ? [...rows, res.row] : rows.map((r) => (r.id === res.row.id ? res.row : r)),
      });
      setForm(null);
    } catch (err) {
      setError(err instanceof ErpClientError ? err.message : "บันทึกไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  const listFields = spec.fields.filter((f) => !(f.kind === "text" && f.multiline));

  return (
    <section className={`${cardCls} space-y-3`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SectionTitle icon={Database}>
          {spec.label} ({rows.length.toLocaleString("th-TH")})
        </SectionTitle>
        <div className="flex flex-wrap gap-2">
          <input
            type="search"
            aria-label={`ค้นหา${spec.label}`}
            placeholder="ค้นหา"
            className={`${inputCls} w-48`}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          {!form && (
            <button
              type="button"
              className={btnPrimary}
              onClick={() => {
                setError(null);
                setForm({ id: null, values: emptyValues(spec.fields) });
              }}
            >
              <Plus aria-hidden="true" className={iconCls} />
              เพิ่ม{spec.label}
            </button>
          )}
        </div>
      </div>

      {form && (
        <form
          className="space-y-3 rounded-lg border border-brand-200 bg-brand-50/50 p-3 dark:border-brand-800 dark:bg-brand-900/20"
          onSubmit={(e) => {
            e.preventDefault();
            if (!busy) void save();
          }}
        >
          <p className="text-sm font-semibold">{form.id === null ? `เพิ่ม${spec.label}` : `แก้ไข${spec.label}`}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {spec.fields.map((f) => (
              <FieldInput
                key={f.name}
                field={f}
                value={form.values[f.name]}
                refOptions={
                  f.kind === "ref"
                    ? refRows(f.ref)
                        .filter((r) => !(f.ref === entity && r.id === form.id))
                        .map((r) => ({ id: r.id, label: `${r.code ? `${r.code} · ` : ""}${r[MASTER_SPECS[f.ref].titleField]}` }))
                    : []
                }
                onChange={(v) => setForm({ ...form, values: { ...form.values, [f.name]: v } })}
              />
            ))}
          </div>
          <InlineError message={error} />
          <div className="flex gap-2">
            <button type="submit" className={btnSuccess} disabled={busy}>
              <BusyIcon busy={busy} icon={Check} />
              บันทึก
            </button>
            <button type="button" className={btnOutline} disabled={busy} onClick={() => setForm(null)}>
              <X aria-hidden="true" className={iconCls} />
              ยกเลิก
            </button>
          </div>
        </form>
      )}

      <div className={tableWrapCls}>
        <table className={tableCls}>
          <thead className={theadCls}>
            <tr>
              {listFields.map((f) => (
                <th key={f.name} scope="col" className={thCls}>
                  {f.label}
                </th>
              ))}
              <th scope="col" className={thCls}>แก้ไขล่าสุด</th>
              <th scope="col" className={thCls}>
                <span className="sr-only">แก้ไข</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {shown.length === 0 ? (
              <EmptyRow colSpan={listFields.length + 2}>ยังไม่มีข้อมูล</EmptyRow>
            ) : (
              shown.map((r) => (
                <tr key={r.id} className={r.active === false ? "text-zinc-400 dark:text-zinc-500" : undefined}>
                  {listFields.map((f) => (
                    <td key={f.name} className={tdCls}>
                      {f.kind === "bool"
                        ? r[f.name]
                          ? "ใช่"
                          : "ไม่"
                        : f.kind === "ref"
                          ? refName(f.ref, r[f.name])
                          : f.kind === "enum"
                            ? (f.options.find((o) => o.value === r[f.name])?.label ?? String(r[f.name] ?? ""))
                            : String(r[f.name] ?? "")}
                    </td>
                  ))}
                  <td className={`${tdCls} whitespace-nowrap`}>{fmtDateTime(r.updatedAt)}</td>
                  <td className={tdCls}>
                    <button
                      type="button"
                      className={btnOutline}
                      onClick={() => {
                        setError(null);
                        setForm({ id: r.id, values: rowValues(spec.fields, r) });
                      }}
                    >
                      <Pencil aria-hidden="true" className={iconCls} />
                      แก้ไข
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        ไม่มีการลบข้อมูลหลัก ให้ยกเลิกเครื่องหมาย &quot;ใช้งาน&quot; แทน เพื่อให้เอกสารเดิมยังอ้างอิงได้
      </p>
    </section>
  );
}

function FieldInput({
  field: f,
  value,
  refOptions,
  onChange,
}: {
  field: MasterField;
  value: string | boolean | undefined;
  refOptions: { id: number; label: string }[];
  onChange: (v: string | boolean) => void;
}) {
  if (f.kind === "bool") {
    return (
      <label className="inline-flex items-center gap-1.5 self-end text-xs">
        <input type="checkbox" className="h-4 w-4 accent-brand-700" checked={value === true} onChange={(e) => onChange(e.target.checked)} />
        {f.label}
      </label>
    );
  }
  const str = typeof value === "string" ? value : "";
  const required = (f.kind === "code" || f.kind === "text") && f.required;
  return (
    <label className={`${labelCls} ${f.kind === "text" && f.multiline ? "sm:col-span-2" : ""}`}>
      <span className="font-medium">
        {f.label}
        {required && <span className="text-red-700"> *</span>}
      </span>
      {f.kind === "ref" ? (
        <select className={inputCls} value={str} onChange={(e) => onChange(e.target.value)}>
          <option value="">-- ไม่ระบุ --</option>
          {refOptions.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      ) : f.kind === "enum" ? (
        <select className={inputCls} value={str} onChange={(e) => onChange(e.target.value)}>
          {f.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ) : f.kind === "text" && f.multiline ? (
        <textarea className={inputCls} rows={2} maxLength={f.max} value={str} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input
          type="text"
          inputMode={f.kind === "decimal" ? "decimal" : undefined}
          className={inputCls}
          maxLength={f.kind === "decimal" ? 20 : f.max}
          required={required}
          value={str}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </label>
  );
}

// --- roles ------------------------------------------------------------------------------------

function RoleEditor() {
  const data = useErpGet<RolesResponse>("/api/erp/admin/roles");
  const units = useErpGet<MasterListResponse>("/api/erp/admin/org-units");
  const stores = useErpGet<MasterListResponse>("/api/erp/admin/stores");
  const [sub, setSub] = useState("");
  const [role, setRole] = useState<ErpRole>("recorder");
  const [orgUnitId, setOrgUnitId] = useState("");
  const [storeId, setStoreId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [filter, setFilter] = useState("");

  if (data.error) return <ErrorCard error={data.error} onRetry={data.reload} />;
  if (!data.data) return <LoadingCard />;
  const unitScoped = UNIT_SCOPED_ROLES.includes(role);
  const activeUnits = (units.data?.rows ?? []).filter((u) => u.active);
  const activeStores = (stores.data?.rows ?? []).filter((s) => s.active);
  const f = filter.trim().toLowerCase();
  const grants = f
    ? data.data.grants.filter((g) =>
        `${g.displayName} ${ERP_ROLE_LABELS[g.role]} ${g.orgUnitName ?? ""} ${g.storeName ?? ""}`.toLowerCase().includes(f),
      )
    : data.data.grants;

  async function add() {
    if (!sub) return setError("กรุณาเลือกผู้ใช้");
    if (unitScoped && !orgUnitId) return setError("บทบาทนี้ต้องเลือกหน่วยงาน");
    setBusy(true);
    setError(null);
    try {
      await erpFetch("/api/erp/admin/roles", {
        method: "POST",
        body: {
          sub,
          role,
          orgUnitId: unitScoped ? Number(orgUnitId) : null,
          storeId: role === "store_officer" && storeId ? Number(storeId) : null,
        },
      });
      data.reload();
    } catch (err) {
      setError(err instanceof ErpClientError ? err.message : "บันทึกไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: number) {
    setBusy(true);
    setError(null);
    try {
      await erpFetch(`/api/erp/admin/roles/${id}`, { method: "DELETE" });
      setConfirmId(null);
      data.reload();
    } catch (err) {
      setError(err instanceof ErpClientError ? err.message : "ลบไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={`${cardCls} space-y-4`}>
      <SectionTitle icon={KeyRound}>บทบาทผู้ใช้ในระบบ ERP</SectionTitle>
      <p className="text-xs text-zinc-600 dark:text-zinc-400">
        เลือกได้เฉพาะบัญชีที่ได้รับอนุมัติแล้วที่หน้า &quot;จัดการผู้ใช้งาน&quot; ผู้ดูแลระบบเว็บมีสิทธิ์ผู้ดูแล ERP โดยอัตโนมัติ
        คนเดียวมีได้หลายบทบาท
      </p>
      <form
        className="grid gap-3 rounded-lg border border-brand-200 bg-brand-50/50 p-3 sm:grid-cols-4 dark:border-brand-800 dark:bg-brand-900/20"
        onSubmit={(e) => {
          e.preventDefault();
          if (!busy) void add();
        }}
      >
        <label className={labelCls}>
          <span className="font-medium">ผู้ใช้</span>
          <select className={inputCls} value={sub} onChange={(e) => setSub(e.target.value)}>
            <option value="">-- เลือกผู้ใช้ --</option>
            {data.data.users.map((u) => (
              <option key={u.sub} value={u.sub}>
                {u.name}
                {u.jobPosition ? ` (${u.jobPosition})` : ""}
              </option>
            ))}
          </select>
        </label>
        <label className={labelCls}>
          <span className="font-medium">บทบาท</span>
          <select className={inputCls} value={role} onChange={(e) => setRole(e.target.value as ErpRole)}>
            {ERP_ROLES.map((r) => (
              <option key={r} value={r}>
                {ERP_ROLE_LABELS[r]}
              </option>
            ))}
          </select>
        </label>
        {unitScoped ? (
          <label className={labelCls}>
            <span className="font-medium">หน่วยงาน</span>
            <select className={inputCls} value={orgUnitId} onChange={(e) => setOrgUnitId(e.target.value)}>
              <option value="">-- เลือกหน่วยงาน --</option>
              {activeUnits.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.code} · {u.name}
                </option>
              ))}
            </select>
          </label>
        ) : role === "store_officer" ? (
          <label className={labelCls}>
            <span className="font-medium">คลัง</span>
            <select className={inputCls} value={storeId} onChange={(e) => setStoreId(e.target.value)}>
              <option value="">ทุกคลัง</option>
              {activeStores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.code} · {s.name}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <p className="self-end text-xs text-zinc-500">ทั้งโรงพยาบาล</p>
        )}
        <div className="self-end">
          <button type="submit" className={btnPrimary} disabled={busy}>
            <BusyIcon busy={busy} icon={Plus} />
            เพิ่มบทบาท
          </button>
        </div>
      </form>
      <InlineError message={error} />
      <input
        type="search"
        aria-label="ค้นหาบทบาท"
        placeholder="ค้นหาชื่อ / บทบาท / หน่วยงาน"
        className={`${inputCls} w-64`}
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
      />
      <div className={tableWrapCls}>
        <table className={tableCls}>
          <thead className={theadCls}>
            <tr>
              <th scope="col" className={thCls}>ผู้ใช้</th>
              <th scope="col" className={thCls}>บทบาท</th>
              <th scope="col" className={thCls}>ขอบเขต</th>
              <th scope="col" className={thCls}>กำหนดเมื่อ</th>
              <th scope="col" className={thCls}>
                <span className="sr-only">ลบ</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {grants.length === 0 ? (
              <EmptyRow colSpan={5}>ยังไม่มีการกำหนดบทบาท</EmptyRow>
            ) : (
              grants.map((g) => (
                <tr key={g.id}>
                  <td className={tdCls}>{g.displayName || g.sub}</td>
                  <td className={tdCls}>{ERP_ROLE_LABELS[g.role]}</td>
                  <td className={tdCls}>
                    {g.orgUnitName ?? (g.role === "store_officer" ? (g.storeName ?? "ทุกคลัง") : "ทั้งโรงพยาบาล")}
                  </td>
                  <td className={`${tdCls} whitespace-nowrap`}>{fmtDateTime(g.grantedAt)}</td>
                  <td className={tdCls}>
                    {confirmId === g.id ? (
                      <span className="inline-flex gap-2">
                        <button type="button" className={btnDanger} disabled={busy} onClick={() => void remove(g.id)}>
                          <BusyIcon busy={busy} icon={Trash2} />
                          ยืนยันลบ
                        </button>
                        <button type="button" className={btnOutline} disabled={busy} onClick={() => setConfirmId(null)}>
                          ไม่ใช่
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        className={`${btnOutline} text-red-700 dark:text-red-300`}
                        onClick={() => setConfirmId(g.id)}
                      >
                        <Trash2 aria-hidden="true" className={iconCls} />
                        ลบ
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
