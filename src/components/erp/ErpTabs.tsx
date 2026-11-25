"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ClipboardList, Database, Home, Warehouse } from "lucide-react";

const TABS = [
  { href: "/erp", label: "งานของฉัน", Icon: Home },
  { href: "/erp/requisitions", label: "ใบเบิกพัสดุ", Icon: ClipboardList },
  { href: "/erp/stock", label: "คลังพัสดุ", Icon: Warehouse },
  { href: "/erp/admin", label: "ข้อมูลหลัก", Icon: Database },
] as const;

/** Menu of the /erp pages (in the page header, same style as KpiTabs). */
export function ErpTabs() {
  const pathname = usePathname();
  return (
    <nav aria-label="เมนูระบบ ERP">
      <ul className="flex flex-wrap gap-x-1 border-b border-white/20">
        {TABS.map(({ href, label, Icon }) => {
          const active = href === "/erp" ? pathname === "/erp" : pathname.startsWith(href);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`-mb-px inline-flex items-center gap-1.5 whitespace-nowrap border-b-2 px-4 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${
                  active
                    ? "border-white text-white"
                    : "border-transparent text-brand-100 hover:border-white/50 hover:text-white"
                }`}
              >
                <Icon aria-hidden="true" className="h-4 w-4 shrink-0" />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
