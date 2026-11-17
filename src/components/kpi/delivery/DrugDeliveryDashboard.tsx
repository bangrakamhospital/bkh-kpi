import { connection } from "next/server";
import { CalendarDays } from "lucide-react";
import { getDrugDeliverySummary } from "@/lib/kpi/drug-delivery";
import type { DrugDeliverySummary } from "@/lib/kpi/drug-delivery-types";
import { fiscalYearOf, todayIsoDate } from "@/lib/kpi/fiscal-year";
import { FiscalYearSelect } from "../FiscalYearSelect";
import { formatBaht, formatNumber } from "../format";
import { DrugDeliveryMonthTable } from "./DrugDeliveryMonthTable";
import { DrugDeliverySchemeTable } from "./DrugDeliverySchemeTable";
import { DrugDeliveryStatCards } from "./DrugDeliveryStatCards";

/**
 * First fiscal year with a full year of pharmacy delivery records: fees
 * are charged since March 2023 (FY2566), but prscrpt_delivery tracking
 * numbers only start in March 2025 (mid FY2568). Earlier years would show
 * "shipped 0 / uncharged 0", which reads as "all charged" — not offered.
 */
const MIN_FISCAL_YEAR = 2569;
const BASE_PATH = "/delivery";

type FyParam = string | string[] | undefined;

function parseFiscalYear(
  raw: FyParam,
  maxYear: number,
): { year?: number; error?: string } {
  if (raw === undefined) return {};
  if (typeof raw !== "string" || !/^\d{4}$/.test(raw)) {
    return { error: "รูปแบบปีงบประมาณไม่ถูกต้อง (ตัวอย่าง: ?fy=2569)" };
  }
  const year = Number(raw);
  if (year < MIN_FISCAL_YEAR || year > maxYear) {
    return {
      error: `ปีงบประมาณต้องอยู่ในช่วง ${MIN_FISCAL_YEAR} ถึง ${maxYear}`,
    };
  }
  return { year };
}

const alertClass =
  "rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-200";

const buildHref = (fy: number) => `${BASE_PATH}?fy=${fy}`;

export async function DrugDeliveryDashboard({
  searchParams,
}: {
  searchParams: Promise<{ fy?: FyParam }>;
}) {
  const { fy } = await searchParams;
  await connection();
  const today = todayIsoDate();
  const maxYear = fiscalYearOf(today);
  const { year, error } = parseFiscalYear(fy, maxYear);

  if (error) {
    return (
      <div className="space-y-4">
        <div role="alert" className={alertClass}>
          {error}
        </div>
        <FiscalYearSelect
          fiscalYear={maxYear}
          minYear={MIN_FISCAL_YEAR}
          maxYear={maxYear}
          buildHref={buildHref}
        />
      </div>
    );
  }

  let data: DrugDeliverySummary | null = null;
  try {
    data = await getDrugDeliverySummary(year ?? maxYear);
  } catch {
    data = null;
  }

  if (!data) {
    return (
      <div role="alert" className={alertClass}>
        ไม่สามารถโหลดข้อมูลค่าส่งยาที่บ้านได้ในขณะนี้ กรุณาลองใหม่ภายหลัง
      </div>
    );
  }

  const uc = data.schemes.find((s) => s.code === "UC");
  const csh = data.schemes.find((s) => s.code === "CSH");
  const sss = data.schemes.find((s) => s.code === "SSS");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-surface p-3 shadow-sm dark:border-zinc-800">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
          <span className="inline-flex items-center gap-1.5 font-semibold">
            <CalendarDays
              aria-hidden="true"
              className="h-4 w-4 text-brand-700 dark:text-brand-300"
            />
            ปีงบประมาณ {data.fiscalYear}
          </span>
          <span className="text-zinc-700 dark:text-zinc-300">
            ค่าส่ง {formatBaht(data.feeBaht)} บาท/ครั้ง ทุกสิทธิ
          </span>
        </div>
        <div className="max-w-full overflow-x-auto">
          <FiscalYearSelect
            fiscalYear={data.fiscalYear}
            minYear={MIN_FISCAL_YEAR}
            maxYear={maxYear}
            buildHref={buildHref}
          />
        </div>
      </div>

      <DrugDeliveryStatCards total={data.total} feeBaht={data.feeBaht} />

      <p className="text-xs text-zinc-600 dark:text-zinc-400">
        ยอดคิดเงินมาจากรายการที่คิดใน HOSxP (ราคาจริงของรายการ) ไม่ใช่ยอดที่ได้รับชำระหรือยอดโอนจาก สปสช. ยอด &quot;ยังไม่คิด&quot; เป็นค่าประมาณ visit × {formatBaht(data.feeBaht)} บาท
        {" "}{data.closed ? "ปีงบประมาณนี้ปิดแล้ว" : "ปีงบประมาณนี้ยังไม่สิ้นสุด"}
      </p>

      <DrugDeliverySchemeTable
        schemes={data.schemes}
        total={data.total}
        fiscalYear={data.fiscalYear}
        feeBaht={data.feeBaht}
      />

      <DrugDeliveryMonthTable
        months={data.months}
        total={data.total}
        fiscalYear={data.fiscalYear}
        today={today}
      />

      <section
        aria-label="หมายเหตุ"
        className="min-w-0 rounded-xl border border-zinc-200 bg-surface p-4 shadow-sm dark:border-zinc-800"
      >
        <h2 className="text-base font-semibold">หมายเหตุ</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-zinc-700 dark:text-zinc-300">
          <li>
            <span className="font-semibold">ส่งไปรษณีย์</span> = visit ในปีงบฯ ที่ห้องยาบันทึกการจัดส่ง (prscrpt_delivery) และมีเลขพัสดุ บันทึกที่ไม่มีเลขพัสดุ (อาจยกเลิกการส่ง) ไม่นับ
          </li>
          <li>
            <span className="font-semibold">คิดค่าส่งแล้ว</span> = visit ที่ส่งไปรษณีย์และถูกคิดรายการค่าส่งยา (ไปรษณีย์ 3002455 หรือ Health Rider 3002725) นับ 1 ครั้งต่อ visit ·{" "}
            <span className="font-semibold">คิดค่าส่งไปรษณีย์</span> = visit ทั้งหมดที่ถูกคิด 3002455 รวม visit ที่ไม่มีบันทึกการจัดส่งหรือไม่มีเลขพัสดุ จึงอาจมากกว่าจำนวนที่ส่ง
          </li>
          <li>
            <span className="font-semibold">Health Rider</span> = visit ที่ถูกคิด 3002725 (คิดเงินที่ PCU) HOSxP ไม่มีที่บันทึกการส่งโดยไรเดอร์ จึงไม่เห็นเคสที่ส่งแล้วไม่ได้คิดเงิน
          </li>
          <li>
            อัตรา {formatBaht(data.feeBaht)} บาทต่อครั้งเท่ากันทุกสิทธิและใช้รายการเดียวกัน สิทธิ UC เบิก สปสช. ผ่าน ADP DRUGP (ดูหน้า รายได้ สปสช. อื่นๆ ซึ่งนับเฉพาะ UC) สิทธิอื่นเก็บจากผู้ป่วยหรือกองทุนของสิทธิตามสถานะการชำระของรายการ
          </li>
          <li>
            กลุ่มสิทธิ = สิทธิของรายการค่าส่ง (สิทธิที่รายการถูกเรียกเก็บ) หรือสิทธิของ visit เมื่อยังไม่คิดค่าส่ง · &quot;อื่นๆ&quot; = ต่างด้าว, พ.ร.บ., สิทธิเบิกหน่วยงานอื่น และไม่ระบุ
          </li>
          {csh && csh.shipped === 0 && csh.postVisits === 0 && csh.riderVisits === 0 && (
            <li>
              ปีงบฯ นี้ไม่พบการส่งยาหรือการคิดค่าส่งของ visit สิทธิจ่ายเอง (ชำระเงิน) ใน HOSxP ผู้ป่วยสิทธิอื่นที่ชำระค่าส่งเองแสดงในคอลัมน์ &quot;ผู้ป่วยชำระเอง&quot; ของสิทธินั้น
            </li>
          )}
          {uc && uc.shippedUncharged > 0 && (
            <li>
              สิทธิ UC ส่งแล้วยังไม่คิดค่าส่ง {formatNumber(uc.shippedUncharged)} visit ≈ {formatBaht(uc.shippedUnchargedBaht)} บาท ที่เบิก สปสช. ได้ ควรตรวจกับห้องยา/การเงิน
            </li>
          )}
          {sss && sss.shipped > 0 && sss.shippedCharged * 2 < sss.shipped && (
            <li>
              สิทธิประกันสังคมส่งไปรษณีย์ {formatNumber(sss.shipped)} visit แต่คิดค่าส่งเพียง {formatNumber(sss.shippedCharged)} visit ควรยืนยันนโยบายเก็บค่าส่งของสิทธินี้
            </li>
          )}
        </ul>
      </section>
    </div>
  );
}
