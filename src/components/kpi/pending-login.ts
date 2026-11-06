"use client";

import type { ScreeningCode, VillageBreakdown } from "@/lib/kpi/types";

/**
 * Action the user wanted before the SSO full-page redirect (open a village's
 * person list or download Excel), kept in sessionStorage so it can resume
 * after the browser comes back logged in. Aggregates only (village id / moo /
 * name / counts) — never patient data. Expires after 10 minutes; any storage
 * error simply means "nothing to resume".
 */

const KEY = "bkh-kpi:pending-login";
const MAX_AGE_MS = 10 * 60 * 1000;

export type PendingAction =
  | { kind: "persons"; village: VillageBreakdown }
  | { kind: "export"; villageId: number | null };

interface Stored {
  v: 1;
  at: number;
  code: ScreeningCode;
  fiscalYear: number;
  action: PendingAction;
}

export function savePendingLogin(
  code: ScreeningCode,
  fiscalYear: number,
  action: PendingAction,
) {
  const entry: Stored = { v: 1, at: Date.now(), code, fiscalYear, action };
  try {
    sessionStorage.setItem(KEY, JSON.stringify(entry));
  } catch {
    // Storage unavailable (private mode / quota): no resume, not an error.
  }
}

export function clearPendingLogin() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}

const isNum = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v);

function validVillage(v: unknown): v is VillageBreakdown {
  const o = v as Partial<VillageBreakdown> | null;
  return (
    !!o &&
    isNum(o.villageId) &&
    o.villageId > 0 &&
    typeof o.moo === "string" &&
    typeof o.villageName === "string" &&
    isNum(o.eligible) &&
    isNum(o.denominator) &&
    isNum(o.numerator) &&
    isNum(o.percent)
  );
}

/** Pending action for this indicator + fiscal year, or null (does not remove it). */
export function peekPendingLogin(
  code: ScreeningCode,
  fiscalYear: number,
): PendingAction | null {
  let raw: string | null;
  try {
    raw = sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const e = JSON.parse(raw) as Partial<Stored>;
    const age = Date.now() - (isNum(e.at) ? e.at : 0);
    if (e.v !== 1 || age < 0 || age > MAX_AGE_MS) {
      clearPendingLogin();
      return null;
    }
    if (e.code !== code || e.fiscalYear !== fiscalYear) return null;
    const a = e.action as Partial<PendingAction> | undefined;
    if (a?.kind === "persons" && validVillage((a as { village?: unknown }).village)) {
      return { kind: "persons", village: (a as { village: VillageBreakdown }).village };
    }
    if (a?.kind === "export") {
      const id = (a as { villageId?: unknown }).villageId;
      if (id === null || (isNum(id) && id >= 0)) return { kind: "export", villageId: id };
    }
    clearPendingLogin();
    return null;
  } catch {
    clearPendingLogin();
    return null;
  }
}
