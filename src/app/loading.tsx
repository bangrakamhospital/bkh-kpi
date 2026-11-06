import { DashboardSkeleton } from "@/components/kpi/DashboardSkeleton";

export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
      <DashboardSkeleton />
    </div>
  );
}
