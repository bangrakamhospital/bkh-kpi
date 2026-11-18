"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CLINICS, clinicHref } from "@/lib/kpi/clinic-registry";

/** Sub-navigation shared by the /clinic/* pages (clinics: @/lib/kpi/clinic-registry). */
export function ClinicSubNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="คลินิก">
      <ul className="flex flex-wrap gap-2">
        {CLINICS.map(({ slug, label }) => {
          const href = clinicHref(slug);
          const active = pathname === href || pathname.startsWith(`${href}/`);
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
