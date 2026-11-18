import type { PtIpd, PtWait, PtWorkload } from "@/lib/kpi/pt-clinic-types";
import { formatBaht, formatDecimal, formatNumber, formatPercent } from "../format";
import { StatTile } from "../clinic/StatTile";
import { mutedClass } from "../overview/table-styles";

const minutes = (v: number | null) => (v === null ? "–" : `${formatDecimal(v)} นาที`);

export function PtWorkloadCard({
  workload: w,
  wait,
  ipd,
}: {
  workload: PtWorkload;
  wait: PtWait;
  ipd: PtIpd;
}) {
  const within = (n: number) =>
    wait.measured > 0 ? `${formatPercent((n / wait.measured) * 100)}%` : "–";
  return (
    <section
      aria-label="ภาระงาน เวลารอคอย และผู้ป่วยใน"
      className="min-w-0 rounded-xl border border-zinc-200 bg-surface p-4 shadow-sm dark:border-zinc-800"
    >
      <h2 className="text-base font-semibold">ภาระงาน</h2>
      <p className={`mt-1 text-xs ${mutedClass}`}>
        วันให้บริการ = วันที่มี visit กายภาพอย่างน้อย 1 ราย · นักกายภาพ = ผู้บันทึกรายการกายภาพ (physic_list.doctor) · นัด = oapp ของแผนกกายภาพ (027)
      </p>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="วันให้บริการ" value={formatNumber(w.serviceDays)} sub="วัน" />
        <StatTile
          label="visit ต่อวัน (เฉลี่ย / สูงสุด)"
          value={`${formatDecimal(w.avgVisitsPerDay)} / ${formatNumber(w.maxVisitsPerDay)}`}
        />
        <StatTile
          label="นักกายภาพต่อวัน (เฉลี่ย)"
          value={formatDecimal(w.avgTherapistsPerDay)}
          sub={`ทั้งปี ${formatNumber(w.therapists)} คน`}
        />
        <StatTile
          label="visit ต่อนักกายภาพ-วัน"
          value={formatDecimal(w.visitsPerTherapistDay)}
          sub="คู่ (visit, นักกายภาพ) ÷ นักกายภาพ-วัน"
        />
        <StatTile label="นัดทั้งหมด" value={formatNumber(w.appointments)} sub="ราย" />
        <StatTile
          label="มาตามนัด"
          value={w.appointmentsKeptPercent === null ? "–" : `${formatPercent(w.appointmentsKeptPercent)}%`}
          sub={`${formatNumber(w.appointmentsKept)} จาก ${formatNumber(w.appointments)} ราย`}
        />
      </div>

      <h3 className="mt-4 text-sm font-semibold">เวลารอคอย (ลงทะเบียน → เริ่มทำกายภาพ)</h3>
      <p className={`mt-1 text-xs ${mutedClass}`}>
        เฉพาะ visit ที่ลงทะเบียนห้องกายภาพ (027) จาก ovst.vsttime ถึงรายการกายภาพแรก (physic_list.begin_datetime) ช่วง 0–480 นาที ไม่รวมวันนี้ · visit แผนกอื่นไม่นับ (ทำกายภาพหลังตรวจคลินิกอื่น) · ไม่วัดเวลาทำกายภาพ เพราะเวลาเริ่มและสิ้นสุดบันทึกพร้อมกัน
      </p>
      <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="มัธยฐาน / เฉลี่ย"
          value={`${minutes(wait.medianMinutes)} / ${minutes(wait.meanMinutes)}`}
          sub={`วัดได้ ${formatNumber(wait.measured)} จาก ${formatNumber(wait.visits)} visit`}
        />
        <StatTile label="เปอร์เซ็นไทล์ที่ 90" value={minutes(wait.p90Minutes)} />
        <StatTile label="ภายใน 30 นาที" value={within(wait.within30)} sub={`${formatNumber(wait.within30)} visit`} />
        <StatTile label="ภายใน 60 นาที" value={within(wait.within60)} sub={`${formatNumber(wait.within60)} visit`} />
      </div>

      <h3 className="mt-4 text-sm font-semibold">กายภาพผู้ป่วยใน (ข้อมูลประกอบ)</h3>
      <p className={`mt-1 text-xs ${mutedClass}`}>
        บันทึกกายภาพผู้ป่วยใน (physic_plan_detail ที่มี an) วันที่ให้บริการในปีงบฯ ไม่รวมในยอด OPD ด้านบน ผู้ป่วยในจ่ายตาม DRG ไม่ใช่รายรายการ
      </p>
      <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="admission" value={formatNumber(ipd.admissions)} sub={`${formatNumber(ipd.persons)} คน`} />
        <StatTile label="ครั้งที่ทำ (admission-วัน)" value={formatNumber(ipd.sessions)} />
        <StatTile label="รายการ" value={formatNumber(ipd.items)} />
        <StatTile label="ค่าบริการที่คิด (บาท)" value={formatBaht(ipd.baht)} />
      </div>
    </section>
  );
}
