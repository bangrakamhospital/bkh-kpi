import type { NcdDiseaseRow } from "@/lib/kpi/ncd-clinic-types";
import { formatNumber } from "../format";

const TONE: Record<NcdDiseaseRow["code"], string> = {
  DM: "bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-300",
  HT: "bg-rose-100 text-rose-900 dark:bg-rose-950 dark:text-rose-300",
  DLP: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300",
  ASTHMA: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-300",
  OTHER: "bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-300",
};

function Card({
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
  tone: string;
}) {
  return (
    <div className="min-w-0 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
      <div className="flex flex-wrap items-center gap-1.5">
        <p className="text-sm font-semibold">{title}</p>
        {chip && (
          <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${tone}`}>
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

export function NcdDiseaseCards({
  diseases,
  dmHtPersons,
}: {
  diseases: NcdDiseaseRow[];
  dmHtPersons: number;
}) {
  return (
    <section
      aria-label="กลุ่มโรค"
      className="min-w-0 rounded-xl border border-zinc-200 bg-surface p-4 shadow-sm dark:border-zinc-800"
    >
      <h2 className="text-base font-semibold">กลุ่มโรค</h2>
      <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
        นับจากรหัส ICD-10 ในทุก visit ของคลินิกในปีงบฯ คนหนึ่งอยู่ได้หลายกลุ่ม จึงรวมกันได้มากกว่าจำนวนคนทั้งหมด &quot;อื่นๆ&quot; = ไม่มีรหัส 4 กลุ่มแรกเลย (เช่น CKD, ไทรอยด์)
      </p>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {diseases.map((d) => (
          <Card
            key={d.code}
            title={d.name}
            chip={d.icd10 || undefined}
            persons={d.persons}
            sub={`${formatNumber(d.visits)} visit`}
            tone={TONE[d.code]}
          />
        ))}
        <Card
          title="เบาหวาน + ความดันโลหิตสูง"
          chip="DM+HT"
          persons={dmHtPersons}
          sub="มีทั้ง 2 โรค"
          tone="bg-violet-100 text-violet-900 dark:bg-violet-950 dark:text-violet-300"
        />
      </div>
    </section>
  );
}
