/** Small figure tile inside a /clinic/* panel (workload, lab panel, …). */
export function StatTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
      <p className="text-xs text-zinc-600 dark:text-zinc-400">{label}</p>
      <p className="mt-0.5 break-words text-base font-bold tabular-nums">{value}</p>
      {sub && <p className="text-xs text-zinc-600 dark:text-zinc-400">{sub}</p>}
    </div>
  );
}
