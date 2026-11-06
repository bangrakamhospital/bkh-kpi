import type { ScreeningCode } from "@/lib/kpi/types";

/** แผนก (view filter เท่านั้น ไม่เกี่ยวกับสิทธิ์) ตาม contract ของ /api/departments */
export interface Department {
  id: string;
  name: string;
  color: string | null;
  codes: ScreeningCode[];
}

export interface DepartmentTone {
  key: string;
  label: string;
  /** สีจุดตัวอย่าง */
  dot: string;
  /** chip ที่ยังไม่เลือก */
  chip: string;
  /** chip ที่เลือกอยู่ */
  chipActive: string;
}

/** palette เล็กๆ (class ต้องเขียนเต็มเพื่อให้ Tailwind สแกนเจอ) */
export const DEPARTMENT_TONES: DepartmentTone[] = [
  { key: "emerald", label: "เขียว", dot: "bg-emerald-500", chip: "border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 dark:border-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-200", chipActive: "border-emerald-700 bg-emerald-700 text-white" },
  { key: "sky", label: "ฟ้า", dot: "bg-sky-500", chip: "border-sky-300 bg-sky-50 text-sky-800 hover:bg-sky-100 dark:border-sky-700 dark:bg-sky-900/20 dark:text-sky-200", chipActive: "border-sky-700 bg-sky-700 text-white" },
  { key: "violet", label: "ม่วง", dot: "bg-violet-500", chip: "border-violet-300 bg-violet-50 text-violet-800 hover:bg-violet-100 dark:border-violet-700 dark:bg-violet-900/20 dark:text-violet-200", chipActive: "border-violet-700 bg-violet-700 text-white" },
  { key: "rose", label: "ชมพู", dot: "bg-rose-500", chip: "border-rose-300 bg-rose-50 text-rose-800 hover:bg-rose-100 dark:border-rose-700 dark:bg-rose-900/20 dark:text-rose-200", chipActive: "border-rose-700 bg-rose-700 text-white" },
  { key: "amber", label: "เหลือง", dot: "bg-amber-500", chip: "border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-200", chipActive: "border-amber-700 bg-amber-700 text-white" },
  { key: "teal", label: "เขียวน้ำทะเล", dot: "bg-teal-500", chip: "border-teal-300 bg-teal-50 text-teal-800 hover:bg-teal-100 dark:border-teal-700 dark:bg-teal-900/20 dark:text-teal-200", chipActive: "border-teal-700 bg-teal-700 text-white" },
];

/** หา tone จาก department.color (ชื่อ palette) ถ้าไม่ตรงให้วนตาม index */
export function toneFor(color: string | null, index: number): DepartmentTone {
  return (
    DEPARTMENT_TONES.find((t) => t.key === color) ??
    DEPARTMENT_TONES[index % DEPARTMENT_TONES.length]
  );
}
