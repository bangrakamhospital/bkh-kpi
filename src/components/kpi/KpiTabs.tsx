"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, MapPinned, Users } from "lucide-react";

const TABS = [
  { href: "/", label: "ผู้รับบริการ", Icon: Users },
  { href: "/hospital", label: "ตัวชี้วัดในโรงพยาบาล", Icon: Building2 },
  { href: "/district", label: "ตัวชี้วัดทั้งอำเภอ", Icon: MapPinned },
] as const;

export function KpiTabs() {
  const pathname = usePathname();

  return (
    <nav aria-label="หมวดตัวชี้วัด" className="overflow-x-auto">
      <ul className="flex min-w-max gap-1 border-b border-white/20">
        {TABS.map(({ href, label, Icon }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
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
