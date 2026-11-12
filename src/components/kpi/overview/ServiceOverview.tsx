import { connection } from "next/server";
import { parseOverviewRange, getServiceOverview } from "@/lib/kpi/overview";
import type { ServiceOverview as ServiceOverviewData } from "@/lib/kpi/overview-types";
import { RangePicker } from "./RangePicker";
import { StatCards } from "./StatCards";
import { HourlyChart } from "./HourlyChart";
import { WardDonut } from "./WardDonut";
import { DepartmentBars, PttypeBars } from "./CountBars";
import { AgePyramid } from "./AgePyramid";
import { DiseaseGroupTop } from "./DiseaseGroupTop";

type Param = string | string[] | undefined;

function first(value: Param): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export async function ServiceOverview({
  searchParams,
}: {
  searchParams: Promise<{ preset?: Param; from?: Param; to?: Param }>;
}) {
  const sp = await searchParams;
  await connection();

  const query = {
    preset: first(sp.preset),
    from: first(sp.from),
    to: first(sp.to),
  };

  let data: ServiceOverviewData | null = null;
  try {
    data = await getServiceOverview(parseOverviewRange(query));
  } catch {
    data = null;
  }

  if (!data) {
    return (
      <div
        role="alert"
        className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-200"
      >
        ไม่สามารถโหลดข้อมูลผู้รับบริการได้ในขณะนี้ กรุณาลองใหม่ภายหลัง
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <RangePicker range={data.range} />
      <StatCards cards={data.cards} range={data.range} />
      <HourlyChart hourly={data.hourly} />
      <WardDonut wards={data.wards} />
      <div className="grid gap-4 lg:grid-cols-2">
        <DepartmentBars items={data.departments} />
        <PttypeBars items={data.pttypes} />
      </div>
      <DiseaseGroupTop groups={data.diseaseGroups} />
      <AgePyramid bands={data.ageSex} />
    </div>
  );
}
