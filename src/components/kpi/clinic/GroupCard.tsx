import { formatNumber } from "../format";

/** People of one group (disease, diagnosis, …) with an optional code chip. */
export function GroupCard({
  title,
  chip,
  persons,
  sub,
  tone,
}: {
  title: string;
  chip?: string;
  persons: number;
  sub: string;
  /** Chip colours. */
  tone?: string;
}) {
  return (
    <div className="min-w-0 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
      <div className="flex flex-wrap items-center gap-1.5">
        <p className="text-sm font-semibold">{title}</p>
        {chip && (
          <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${tone ?? ""}`}>
            {chip}
          </span>
        )}
      </div>
      <p className="mt-1 text-base font-bold tabular-nums">
        {formatNumber(persons)} <span className="text-xs font-normal">คน</span>
      </p>
      <p className="text-xs text-zinc-600 dark:text-zinc-400">{sub}</p>
    </div>
  );
}
