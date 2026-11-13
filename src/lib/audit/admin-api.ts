import "server-only";

import ExcelJS from "exceljs";

import { adminError } from "@/lib/auth/admin-gate";
import { listAccessCodes } from "@/lib/access-codes/store";
import { ACCESS_CODE_USERNAME_PREFIX } from "@/lib/access-codes/types";
import { listUsers } from "@/lib/users/store";
import {
  AUDIT_ACTION_LABELS,
  describeAudit,
  type AuditRecord,
} from "./types";

/** Shared helpers of /api/admin/logs/** (Thai error messages). */

export const AUDIT_UNAVAILABLE_MESSAGE =
  "ไม่สามารถอ่านบันทึกการใช้งานได้ในขณะนี้ กรุณาลองใหม่";

export function auditReadFailure(route: string, err: unknown): Response {
  const code =
    err && typeof err === "object" && "code" in err
      ? String((err as { code: unknown }).code)
      : err instanceof Error
        ? err.name
        : "error";
  console.error(`[${route}] cannot read audit log (${code})`);
  return adminError(503, AUDIT_UNAVAILABLE_MESSAGE);
}

/**
 * sub -> display name of known staff, plus `access-code:<id>` -> external
 * auditor (each part empty when its file is unreadable).
 */
export async function staffNames(): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  try {
    for (const u of await listUsers()) names.set(u.sub, u.name);
  } catch {
    // users.json unreadable: names stay unresolved
  }
  try {
    for (const c of await listAccessCodes()) {
      names.set(
        `${ACCESS_CODE_USERNAME_PREFIX}${c.id}`,
        `${c.name} (${c.org}) [ผู้ตรวจภายนอก]`,
      );
    }
  } catch {
    // access-codes.json unreadable
  }
  return names;
}

const dateTimeFmt = new Intl.DateTimeFormat("th-TH-u-ca-buddhist", {
  timeZone: "Asia/Bangkok",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

export function thaiDateTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : dateTimeFmt.format(d);
}

/**
 * Excel of audit records (newest first). Staff identity + parameters only
 * (records never contain patient data). Values are plain strings / numbers,
 * never formulas.
 */
export async function buildAuditWorkbook(
  records: readonly AuditRecord[],
  meta: { from: string; to: string; truncated: boolean; total: number },
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "bkh-kpi";
  wb.created = new Date();
  const ws = wb.addWorksheet("บันทึกการใช้งาน");
  ws.columns = [
    { header: "วันเวลา (เวลาไทย)", key: "time", width: 22 },
    { header: "ผู้ใช้", key: "name", width: 28 },
    { header: "รหัสผู้ใช้ (loginname / sub)", key: "actor", width: 38 },
    { header: "การกระทำ", key: "action", width: 30 },
    { header: "รายละเอียด", key: "detail", width: 60 },
    { header: "IP", key: "ip", width: 18 },
    { header: "User agent", key: "ua", width: 60 },
    { header: "เวลา (ISO, UTC)", key: "ts", width: 26 },
  ];
  for (const r of records) {
    ws.addRow({
      time: thaiDateTime(r.ts),
      name: r.actorName ?? "",
      actor: r.actor ?? "",
      action: AUDIT_ACTION_LABELS[r.action] ?? r.action,
      detail: describeAudit(r),
      ip: r.ip ?? "",
      ua: r.ua ?? "",
      ts: r.ts,
    });
  }
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: "frozen", ySplit: 1, xSplit: 0 }];
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 8 } };

  const info = wb.addWorksheet("เงื่อนไข");
  info.columns = [
    { header: "รายการ", key: "k", width: 24 },
    { header: "ค่า", key: "v", width: 50 },
  ];
  info.addRow({ k: "ช่วงวันที่", v: `${meta.from} ถึง ${meta.to}` });
  info.addRow({ k: "จำนวนที่ตรงเงื่อนไข", v: meta.total });
  info.addRow({ k: "จำนวนในไฟล์", v: records.length });
  if (meta.truncated) {
    info.addRow({
      k: "หมายเหตุ",
      v: "ข้อมูลเกินจำนวนสูงสุดต่อไฟล์ ไฟล์นี้มีเฉพาะรายการล่าสุด กรุณาเลือกช่วงวันที่ให้แคบลง",
    });
  }
  info.addRow({ k: "สร้างเมื่อ", v: thaiDateTime(new Date().toISOString()) });
  info.getRow(1).font = { bold: true };

  const out = await wb.xlsx.writeBuffer();
  return Buffer.from(out);
}
