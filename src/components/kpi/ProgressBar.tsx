interface Props {
  percent: number;
  targetPercent: number;
  barClass: string;
  label: string;
}

/** แถบความคืบหน้าเล็ก พร้อมเส้นเกณฑ์ */
export function ProgressBar({ percent, targetPercent, barClass, label }: Props) {
  const fill = Math.min(100, Math.max(0, percent));
  const target = Math.min(100, Math.max(0, targetPercent));
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuenow={fill}
      aria-valuemin={0}
      aria-valuemax={100}
      className="relative h-1.5 w-full min-w-24 rounded-full bg-zinc-200 dark:bg-zinc-700"
    >
      <div
        className={`h-full rounded-full ${barClass}`}
        style={{ width: `${fill}%` }}
      />
      <div
        aria-hidden="true"
        className="absolute -top-1 h-4 w-0.5 bg-zinc-900 dark:bg-zinc-100"
        style={{ left: `${target}%` }}
      />
    </div>
  );
}
