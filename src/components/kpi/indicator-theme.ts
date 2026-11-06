import { Droplet, HeartPulse, Ribbon, ShieldCheck } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type AccentKey = "dm" | "ht" | "cervix" | "breast";

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
};
