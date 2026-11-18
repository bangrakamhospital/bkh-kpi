import type { ReactNode } from "react";
import { ExcelDownloadButton, type ExcelExport } from "../overview/ExcelDownloadButton";
import { mutedClass } from "../overview/table-styles";

/** Card section of a /clinic/* page: title, optional Excel button and note. */
export function ClinicPanel({
  ariaLabel,
  title,
  excel,
  note,
  children,
}: {
  ariaLabel?: string;
  title: string;
  excel?: ExcelExport;
  note?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      aria-label={ariaLabel ?? title}
      className="min-w-0 rounded-xl border border-zinc-200 bg-surface p-4 shadow-sm dark:border-zinc-800"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 className="text-base font-semibold">{title}</h2>
        {excel && <ExcelDownloadButton data={excel} />}
      </div>
      {note && <p className={`mt-1 text-xs ${mutedClass}`}>{note}</p>}
      {children}
    </section>
  );
}
