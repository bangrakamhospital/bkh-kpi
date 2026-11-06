export function DashboardSkeleton() {
  return (
    <div role="status" aria-live="polite" className="animate-pulse space-y-4">
      <span className="sr-only">กำลังโหลดข้อมูล...</span>
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
  );
}
