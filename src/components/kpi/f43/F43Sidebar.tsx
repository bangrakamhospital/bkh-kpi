import Link from "next/link";
import { LayoutDashboard } from "lucide-react";
import type { F43FileResult, F43Group } from "@/lib/kpi/f43-types";
import { formatNumber } from "../format";
import { F43_TONE, FILE_STATUS } from "./f43-ui";

const GROUPS: { group: F43Group; title: string }[] = [
  { group: "hdc", title: "HDC 52 แฟ้ม" },
  { group: "fdh", title: "FDH OP" },
];

const itemBase =
  "flex min-w-0 items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-xs focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-600";
const itemIdle = "hover:bg-brand-50 dark:hover:bg-brand-900/30";
const itemActive = "bg-brand-700 text-white";

function Badge({ f }: { f: F43FileResult }) {
  const st = FILE_STATUS[f.status];
  const text =
    f.status === "error"
      ? formatNumber(f.errorFailed)
      : f.status === "warn"
        ? formatNumber(f.warnFailed)
        : f.status === "pass"
          ? "ผ่าน"
          : f.status === "unsupported"
            ? "–"
            : "0";
  return (
    <span
      title={st.label}
      className={`inline-flex min-w-8 shrink-0 justify-center rounded-full px-1.5 py-0.5 text-xs font-semibold tabular-nums ${F43_TONE[st.tone]}`}
    >
      {text}
    </span>
  );
}

/**
 * File list of /f43: "ภาพรวม" then the HDC and FDH groups. A vertical
 * sidebar from lg; a horizontal scrolling strip on phones.
 */
export function F43Sidebar({
  files,
  selected,
  hrefFor,
}: {
  files: readonly F43FileResult[];
  selected: string | null;
  hrefFor: (file: string | null) => string;
}) {
  return (
    <nav
      aria-label="รายชื่อแฟ้ม"
      className="min-w-0 rounded-xl border border-zinc-200 bg-surface p-2 shadow-sm lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto dark:border-zinc-800"
    >
      <ul className="flex gap-1 overflow-x-auto pb-1 lg:flex-col lg:overflow-x-visible lg:pb-0">
        <li className="shrink-0">
          <Link
            href={hrefFor(null)}
            aria-current={selected === null ? "page" : undefined}
            className={`${itemBase} font-semibold ${selected === null ? itemActive : itemIdle}`}
          >
            <span className="inline-flex items-center gap-1.5">
              <LayoutDashboard aria-hidden="true" className="h-4 w-4" />
              ภาพรวม
            </span>
          </Link>
        </li>
        {GROUPS.map(({ group, title }) => (
          <li key={group} className="flex shrink-0 gap-1 lg:block">
            <p className="hidden px-2.5 pb-1 pt-3 text-xs font-semibold text-zinc-600 lg:block dark:text-zinc-400">
              {title}
            </p>
            <span className="self-center whitespace-nowrap px-1 text-xs font-semibold text-zinc-600 lg:hidden dark:text-zinc-400">
              {title}:
            </span>
            <ul className="flex gap-1 lg:flex-col">
              {files
                .filter((f) => f.group === group)
                .map((f) => {
                  const active = f.code === selected;
                  return (
                    <li key={f.code} className="shrink-0">
                      <Link
                        href={hrefFor(f.code)}
                        aria-current={active ? "page" : undefined}
                        title={f.name}
                        className={`${itemBase} ${active ? itemActive : itemIdle} ${f.status === "unsupported" && !active ? "text-zinc-500" : ""}`}
                      >
                        <span className="truncate font-mono">{f.label}</span>
                        <Badge f={f} />
                      </Link>
                    </li>
                  );
                })}
            </ul>
          </li>
        ))}
      </ul>
    </nav>
  );
}
