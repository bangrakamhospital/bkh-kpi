import {
  categoryAnchorId,
  type KpiCategory,
} from "@/lib/kpi/categories";

/**
 * Horizontal scrollable chip bar that jumps to a category section
 * (anchor links, no JS). Scrolls inside its own box so the page never
 * scrolls sideways on phones.
 */
export function CategoryChipBar({
  categories,
}: {
  categories: readonly KpiCategory[];
}) {
  return (
    <nav aria-label="ไปยังหมวดตัวชี้วัด" className="min-w-0 max-w-full">
      <ul className="flex gap-2 overflow-x-auto pb-1">
        {categories.map((c) => (
          <li key={c.id} className="shrink-0">
            <a
              href={`#${categoryAnchorId(c.id)}`}
              className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-xs font-medium text-brand-800 hover:bg-brand-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 dark:border-brand-800 dark:bg-brand-900/30 dark:text-brand-100"
            >
              <span className="tabular-nums">{c.number}</span>
              {c.name}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
