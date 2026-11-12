import Link from "next/link";
import { Building2, ScrollText, UsersRound } from "lucide-react";

const tabs = [
  { href: "/admin/users", key: "users", label: "ผู้ใช้งาน", Icon: UsersRound },
  { href: "/admin/departments", key: "departments", label: "แผนก", Icon: Building2 },
  { href: "/admin/logs", key: "logs", label: "บันทึกการใช้งาน", Icon: ScrollText },
] as const;

export type AdminTabKey = (typeof tabs)[number]["key"];

export function AdminTabs({ active }: { active: AdminTabKey }) {
  return (
    <nav aria-label="เมนูจัดการระบบ" className="mb-4 flex flex-wrap gap-2">
      {tabs.map(({ href, key, label, Icon }) => (
        <Link
          key={key}
          href={href}
          aria-current={active === key ? "page" : undefined}
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 ${
            active === key
              ? "bg-brand-700 text-white"
              : "bg-surface text-brand-800 hover:bg-brand-50 dark:text-brand-100 dark:hover:bg-brand-900/30"
          }`}
        >
          <Icon aria-hidden="true" className="h-4 w-4" />
          {label}
        </Link>
      ))}
    </nav>
  );
}
