import "server-only";

import type {
  Cell,
  HaItem,
  HaSection,
  Kpi,
  StrategyDashboardData,
} from "@/lib/kpi/strategy-types";
import raw from "./strategy-static.json";

/**
 * Static source for the strategy & HA dashboard: the verified dataset
 * from the former standalone HTML dashboard (KPI tracking sheets 2568–2569
 * and HA indicator sheets 2565–2569). Strings are compressed with `~x`
 * tokens (`tok`); loadStaticStrategy() hydrates them into the typed
 * contract exactly like the original page script did.
 */

type RawKpi69 = [string, string, number, string, Cell, Cell, Cell, Cell, number, number];
type RawKpi68 = [string, string, number, number, string, Cell, Cell, Cell, Cell, number, number];

interface RawData {
  tok: [string, string][];
  own: string[];
  s69: string[];
  g68: string[];
  o68: string[];
  k69: RawKpi69[];
  k68: RawKpi68[];
  haSec: [number, string][];
  ha: [number, string, string, Cell, Cell, Cell, Cell, Cell][];
}

const PART_NAMES = [
  "Part I: การนำและกลยุทธ์",
  "Part II: ระบบงานสำคัญ",
  "Part III: กระบวนการดูแลผู้ป่วย",
  "Part IV: ผลลัพธ์การดำเนินงาน",
];

export function loadStaticStrategy(): StrategyDashboardData {
  const data = raw as unknown as RawData;

  const untok = (str: string): string => {
    if (!str) return str;
    let out = str;
    for (const [full, code] of data.tok) {
      if (out.includes(code)) out = out.split(code).join(full);
    }
    return out;
  };
  const ownerOf = (i: number) => data.own[i] || "ไม่ระบุ";
  const statusOf = (v: number): 0 | 1 => (v === 1 ? 1 : 0);

  const strat69 = data.s69.map(untok);
  const goals68 = data.g68.map(untok);
  const objectives68 = data.o68.map(untok);

  const kpi2569: Kpi[] = data.k69.map((r, idx) => ({
    idx,
    code: r[0],
    name: untok(r[1]),
    groupIdx: r[2],
    groupName: strat69[r[2]] || "ไม่ระบุ",
    groupShort: (strat69[r[2]] || "").split(" ").slice(0, 2).join(" "),
    target: untok(r[3]),
    q: [r[4], r[5], r[6], r[7]],
    status: statusOf(r[8]),
    owner: ownerOf(r[9]),
  }));

  const kpi2568: Kpi[] = data.k68.map((r, idx) => {
    const goal = goals68[r[2]] || "ไม่ระบุ";
    return {
      idx,
      code: r[0],
      name: untok(r[1]),
      groupIdx: r[2],
      groupName: goal,
      groupShort: goal.split(".")[0] || goal.slice(0, 14),
      objective: objectives68[r[3]] || "",
      target: untok(r[4]),
      q: [r[5], r[6], r[7], r[8]],
      status: statusOf(r[9]),
      owner: ownerOf(r[10]),
    };
  });

  const haSections: HaSection[] = data.haSec.map((s, idx) => ({
    id: idx,
    partIdx: s[0],
    partName: PART_NAMES[s[0]] || "",
    secName: untok(s[1]),
  }));

  const haItems: HaItem[] = data.ha.map((r, idx) => {
    const sec = haSections[r[0]] ?? { partIdx: 0, partName: "", secName: "" };
    return {
      idx,
      secId: r[0],
      partIdx: sec.partIdx,
      partName: sec.partName,
      secName: sec.secName,
      name: untok(r[1]),
      target: untok(r[2]),
      years: [r[3], r[4], r[5], r[6], r[7]],
    };
  });

  return {
    kpi2569,
    kpi2568,
    strat69,
    goals68,
    partNames: PART_NAMES,
    haSections,
    haItems,
  };
}
