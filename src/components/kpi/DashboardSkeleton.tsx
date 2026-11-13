export function DashboardSkeleton({ fiscalYear }: { fiscalYear?: string }) {
  const message = fiscalYear
    ? `กำลังโหลดข้อมูลปีงบ ${fiscalYear}…`
    : "กำลังโหลดข้อมูล...";
  return (
    <div role="status" aria-live="polite" className="space-y-4">
      <p className="text-xs font-medium text-brand-800 dark:text-brand-100">
        {message}
      </p>
      <div className="animate-pulse space-y-4">
        <div className="grid gap-4 sm:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-16 rounded-xl bg-brand-100 dark:bg-brand-900/60"
            />
          ))}
        </div>
        <div className="space-y-2 rounded-xl bg-surface p-4 shadow-sm">
          {[0, 1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-12 rounded-lg bg-brand-50 dark:bg-brand-900/40"
            />
          ))}
        </div>
      </div>
    </div>
  );
}
