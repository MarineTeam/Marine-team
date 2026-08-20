import Link from "next/link";
import type { BreadcrumbItem } from "@/lib/json-ld";

/** Visible breadcrumb trail — the on-page counterpart to the invisible BreadcrumbList JSON-LD built from the same items. */
export function Breadcrumbs({ items }: { items: BreadcrumbItem[] }) {
  return (
    <nav aria-label="Breadcrumb" className="text-sm text-zinc-500">
      <ol className="flex flex-wrap items-center gap-1">
        {items.map((item, i) => (
          <li key={i} className="flex items-center gap-1">
            {i > 0 && (
              <span aria-hidden className="text-zinc-400">
                /
              </span>
            )}
            {item.href ? (
              <Link href={item.href} className="hover:underline">
                {item.label}
              </Link>
            ) : (
              <span className="text-zinc-700 dark:text-zinc-300">{item.label}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
