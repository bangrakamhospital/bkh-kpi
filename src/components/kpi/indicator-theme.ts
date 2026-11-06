import {
  Beaker,
  ClipboardCheck,
  Droplet,
  FlaskConical,
  HeartPulse,
  Ribbon,
  ShieldCheck,
  Stethoscope,
  TestTube,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type AccentKey =
  | "dm"
  | "ht"
  | "cervix"
  | "breast"
  | "confirmDm"
  | "confirmHt"
  | "hba1c"
  | "ldl"
  | "creatinine";

interface AccentTheme {
  Icon: LucideIcon;
  /** วงกลมไอคอน */
  iconBg: string;
  /** แถบ progress */
  bar: string;
  /** แถบหัว modal (ข้อความสีขาวบนพื้นเข้ม) */
  band: string;
  /** พื้นอ่อนของแถบเครื่องมือ */
  soft: string;
  /** หัวตารางสีอ่อน */
  thead: string;
  /** แถวรวมท้ายตาราง */
  footer: string;
  /** hover ของแถว */
  rowHover: string;
  /** ป้ายวงกลมเลขหมู่ */
  badge: string;
  /** ปุ่ม pill */
  pill: string;
  /** focus ring ของ input */
  focus: string;
  /** ข้อความเน้นสี accent */
  text: string;
}

/** สี accent ประจำตัวชี้วัด — class เป็นสตริงเต็มเพื่อให้ Tailwind สแกนเจอ */
export const ACCENTS: Record<AccentKey, AccentTheme> = {
  dm: {
    Icon: Droplet,
    iconBg: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
    bar: "bg-sky-600 dark:bg-sky-400",
    band: "from-sky-700 to-sky-900",
    soft: "bg-sky-50 dark:bg-sky-950/40",
    thead: "bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200",
    footer: "bg-sky-200 text-sky-950 dark:bg-sky-900 dark:text-sky-50",
    rowHover: "hover:bg-sky-50 dark:hover:bg-sky-950/50",
    badge: "bg-sky-700 text-white dark:bg-sky-400 dark:text-sky-950",
    pill: "bg-sky-700 text-white hover:bg-sky-800 focus-visible:outline-sky-600 dark:bg-sky-400 dark:text-sky-950 dark:hover:bg-sky-300",
    focus: "focus:border-sky-600 focus:outline-2 focus:outline-sky-600",
    text: "text-sky-800 dark:text-sky-300",
  },
  ht: {
    Icon: HeartPulse,
    iconBg: "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300",
    bar: "bg-rose-600 dark:bg-rose-400",
    band: "from-rose-700 to-rose-900",
    soft: "bg-rose-50 dark:bg-rose-950/40",
    thead: "bg-rose-100 text-rose-900 dark:bg-rose-950 dark:text-rose-200",
    footer: "bg-rose-200 text-rose-950 dark:bg-rose-900 dark:text-rose-50",
    rowHover: "hover:bg-rose-50 dark:hover:bg-rose-950/50",
    badge: "bg-rose-700 text-white dark:bg-rose-400 dark:text-rose-950",
    pill: "bg-rose-700 text-white hover:bg-rose-800 focus-visible:outline-rose-600 dark:bg-rose-400 dark:text-rose-950 dark:hover:bg-rose-300",
    focus: "focus:border-rose-600 focus:outline-2 focus:outline-rose-600",
    text: "text-rose-800 dark:text-rose-300",
  },
  cervix: {
    Icon: ShieldCheck,
    iconBg:
      "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300",
    bar: "bg-violet-600 dark:bg-violet-400",
    band: "from-violet-700 to-violet-900",
    soft: "bg-violet-50 dark:bg-violet-950/40",
    thead:
      "bg-violet-100 text-violet-900 dark:bg-violet-950 dark:text-violet-200",
    footer:
      "bg-violet-200 text-violet-950 dark:bg-violet-900 dark:text-violet-50",
    rowHover: "hover:bg-violet-50 dark:hover:bg-violet-950/50",
    badge: "bg-violet-700 text-white dark:bg-violet-400 dark:text-violet-950",
    pill: "bg-violet-700 text-white hover:bg-violet-800 focus-visible:outline-violet-600 dark:bg-violet-400 dark:text-violet-950 dark:hover:bg-violet-300",
    focus: "focus:border-violet-600 focus:outline-2 focus:outline-violet-600",
    text: "text-violet-800 dark:text-violet-300",
  },
  breast: {
    Icon: Ribbon,
    iconBg: "bg-pink-100 text-pink-800 dark:bg-pink-950 dark:text-pink-300",
    bar: "bg-pink-600 dark:bg-pink-400",
    band: "from-pink-700 to-pink-900",
    soft: "bg-pink-50 dark:bg-pink-950/40",
    thead: "bg-pink-100 text-pink-900 dark:bg-pink-950 dark:text-pink-200",
    footer: "bg-pink-200 text-pink-950 dark:bg-pink-900 dark:text-pink-50",
    rowHover: "hover:bg-pink-50 dark:hover:bg-pink-950/50",
    badge: "bg-pink-700 text-white dark:bg-pink-400 dark:text-pink-950",
    pill: "bg-pink-700 text-white hover:bg-pink-800 focus-visible:outline-pink-600 dark:bg-pink-400 dark:text-pink-950 dark:hover:bg-pink-300",
    focus: "focus:border-pink-600 focus:outline-2 focus:outline-pink-600",
    text: "text-pink-800 dark:text-pink-300",
  },
  confirmDm: {
    Icon: ClipboardCheck,
    iconBg: "bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300",
    bar: "bg-indigo-600 dark:bg-indigo-400",
    band: "from-indigo-700 to-indigo-900",
    soft: "bg-indigo-50 dark:bg-indigo-950/40",
    thead: "bg-indigo-100 text-indigo-900 dark:bg-indigo-950 dark:text-indigo-200",
    footer: "bg-indigo-200 text-indigo-950 dark:bg-indigo-900 dark:text-indigo-50",
    rowHover: "hover:bg-indigo-50 dark:hover:bg-indigo-950/50",
    badge: "bg-indigo-700 text-white dark:bg-indigo-400 dark:text-indigo-950",
    pill: "bg-indigo-700 text-white hover:bg-indigo-800 focus-visible:outline-indigo-600 dark:bg-indigo-400 dark:text-indigo-950 dark:hover:bg-indigo-300",
    focus: "focus:border-indigo-600 focus:outline-2 focus:outline-indigo-600",
    text: "text-indigo-800 dark:text-indigo-300",
  },
  confirmHt: {
    Icon: Stethoscope,
    iconBg: "bg-fuchsia-100 text-fuchsia-800 dark:bg-fuchsia-950 dark:text-fuchsia-300",
    bar: "bg-fuchsia-600 dark:bg-fuchsia-400",
    band: "from-fuchsia-700 to-fuchsia-900",
    soft: "bg-fuchsia-50 dark:bg-fuchsia-950/40",
    thead: "bg-fuchsia-100 text-fuchsia-900 dark:bg-fuchsia-950 dark:text-fuchsia-200",
    footer: "bg-fuchsia-200 text-fuchsia-950 dark:bg-fuchsia-900 dark:text-fuchsia-50",
    rowHover: "hover:bg-fuchsia-50 dark:hover:bg-fuchsia-950/50",
    badge: "bg-fuchsia-700 text-white dark:bg-fuchsia-400 dark:text-fuchsia-950",
    pill: "bg-fuchsia-700 text-white hover:bg-fuchsia-800 focus-visible:outline-fuchsia-600 dark:bg-fuchsia-400 dark:text-fuchsia-950 dark:hover:bg-fuchsia-300",
    focus: "focus:border-fuchsia-600 focus:outline-2 focus:outline-fuchsia-600",
    text: "text-fuchsia-800 dark:text-fuchsia-300",
  },
  hba1c: {
    Icon: TestTube,
    iconBg: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
    bar: "bg-amber-600 dark:bg-amber-400",
    band: "from-amber-700 to-amber-900",
    soft: "bg-amber-50 dark:bg-amber-950/40",
    thead: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
    footer: "bg-amber-200 text-amber-950 dark:bg-amber-900 dark:text-amber-50",
    rowHover: "hover:bg-amber-50 dark:hover:bg-amber-950/50",
    badge: "bg-amber-700 text-white dark:bg-amber-400 dark:text-amber-950",
    pill: "bg-amber-700 text-white hover:bg-amber-800 focus-visible:outline-amber-600 dark:bg-amber-400 dark:text-amber-950 dark:hover:bg-amber-300",
    focus: "focus:border-amber-600 focus:outline-2 focus:outline-amber-600",
    text: "text-amber-800 dark:text-amber-300",
  },
  ldl: {
    Icon: FlaskConical,
    iconBg: "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300",
    bar: "bg-orange-600 dark:bg-orange-400",
    band: "from-orange-700 to-orange-900",
    soft: "bg-orange-50 dark:bg-orange-950/40",
    thead: "bg-orange-100 text-orange-900 dark:bg-orange-950 dark:text-orange-200",
    footer: "bg-orange-200 text-orange-950 dark:bg-orange-900 dark:text-orange-50",
    rowHover: "hover:bg-orange-50 dark:hover:bg-orange-950/50",
    badge: "bg-orange-700 text-white dark:bg-orange-400 dark:text-orange-950",
    pill: "bg-orange-700 text-white hover:bg-orange-800 focus-visible:outline-orange-600 dark:bg-orange-400 dark:text-orange-950 dark:hover:bg-orange-300",
    focus: "focus:border-orange-600 focus:outline-2 focus:outline-orange-600",
    text: "text-orange-800 dark:text-orange-300",
  },
  creatinine: {
    Icon: Beaker,
    iconBg: "bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300",
    bar: "bg-teal-600 dark:bg-teal-400",
    band: "from-teal-700 to-teal-900",
    soft: "bg-teal-50 dark:bg-teal-950/40",
    thead: "bg-teal-100 text-teal-900 dark:bg-teal-950 dark:text-teal-200",
    footer: "bg-teal-200 text-teal-950 dark:bg-teal-900 dark:text-teal-50",
    rowHover: "hover:bg-teal-50 dark:hover:bg-teal-950/50",
    badge: "bg-teal-700 text-white dark:bg-teal-400 dark:text-teal-950",
    pill: "bg-teal-700 text-white hover:bg-teal-800 focus-visible:outline-teal-600 dark:bg-teal-400 dark:text-teal-950 dark:hover:bg-teal-300",
    focus: "focus:border-teal-600 focus:outline-2 focus:outline-teal-600",
    text: "text-teal-800 dark:text-teal-300",
  },
};
