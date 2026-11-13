"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/district", label: "ตัวชี้วัดทั้งอำเภอ" },
  { href: "/district/pp", label: "PP รายได้" },
] as const;

/** Sub-navigation shared by /district and /district/pp. */
export function DistrictSubNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="หมวดย่อยระดับอำเภอ" className="overflow-x-auto">
      <ul className="flex min-w-max gap-2">
        {LINKS.map(({ href, label }) => {
          const active =
            href === "/district/pp"
              ? pathname === href || pathname.startsWith(`${href}/`)
              : pathname === href;
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`inline-flex items-center whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${
                  active
                    ? "bg-white text-brand-800"
                    : "bg-white/10 text-brand-100 hover:bg-white/20 hover:text-white"
                }`}
              >
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
