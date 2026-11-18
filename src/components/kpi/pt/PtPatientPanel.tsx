import type { PtBandRow, PtDxRow } from "@/lib/kpi/pt-clinic-types";
import { formatNumber, formatPercent } from "../format";
import { GroupCard } from "../clinic/GroupCard";
import { mutedClass } from "../overview/table-styles";

const TONE: Record<PtDxRow["code"], string> = {
  STROKE: "bg-rose-100 text-rose-900 dark:bg-rose-950 dark:text-rose-300",
  NEURO: "bg-violet-100 text-violet-900 dark:bg-violet-950 dark:text-violet-300",
  MSK: "bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-300",
  INJURY: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300",
  OTHER: "bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-300",
};

export function PtPatientPanel({
  diagnoses,
  bands,
  persons,
  newPersons,
  elderlyPersons,
}: {
  diagnoses: PtDxRow[];
  bands: PtBandRow[];
  persons: number;
  newPersons: number;
  elderlyPersons: number;
}) {
  const of = (n: number) => (persons > 0 ? `${formatPercent((n / persons) * 100)}% ของผู้รับบริการ` : "–");
  return (
    <section
      aria-label="ผู้รับบริการและกลุ่มโรค"
      className="min-w-0 rounded-xl border border-zinc-200 bg-surface p-4 shadow-sm dark:border-zinc-800"
    >
      <h2 className="text-base font-semibold">ผู้รับบริการและกลุ่มโรค</h2>
      <p className={`mt-1 text-xs ${mutedClass}`}>
        กลุ่มโรคนับจากรหัส ICD-10 ทุกตำแหน่งของ visit กายภาพ คนหนึ่งอยู่ได้หลายกลุ่ม &quot;อื่นๆ&quot; ส่วนใหญ่คือ visit คลินิก NCD ที่นักกายภาพตรวจเท้า/สอนผู้ป่วย (รหัสโรคเป็น DM/HT)
      </p>

      <h3 className="mt-3 text-sm font-semibold">ประเภทผู้รับบริการ</h3>
      <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <GroupCard
          title="รายใหม่"
          persons={newPersons}
          sub={`ไม่มี visit กายภาพใน 365 วันก่อน 1 ต.ค. · ${of(newPersons)}`}
        />
        <GroupCard
          title="รายเก่า / ต่อเนื่อง"
          persons={persons - newPersons}
          sub={`มี visit กายภาพในปีก่อน · ${of(persons - newPersons)}`}
        />
        <GroupCard
          title="ผู้สูงอายุ (60 ปีขึ้นไป)"
          persons={elderlyPersons}
          sub={`อายุ ณ วันรับบริการ (vn_stat.age_y) · ${of(elderlyPersons)}`}
        />
      </div>

      <h3 className="mt-4 text-sm font-semibold">กลุ่มโรค</h3>
      <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {diagnoses.map((d) => (
          <GroupCard
            key={d.code}
            title={d.name}
            chip={d.icd10 || undefined}
            persons={d.persons}
            sub={`${formatNumber(d.visits)} visit`}
            tone={TONE[d.code]}
          />
        ))}
      </div>

      <h3 className="mt-4 text-sm font-semibold">จำนวนครั้งที่มารับกายภาพต่อคนในปีงบฯ</h3>
      <div className="mt-2 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {bands.map((b) => (
          <GroupCard key={b.label} title={b.label} persons={b.persons} sub={of(b.persons)} />
        ))}
      </div>
    </section>
  );
}
