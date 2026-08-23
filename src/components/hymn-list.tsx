"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { hymnReadingOrder } from "@/lib/hymnal";

type HymnListItem = {
  id: string;
  title: string;
  pageNumber: number | null;
  groupLabel: string | null;
  memberOnly: boolean;
};

type SortMode = "page" | "az" | "category";

function HymnRow({ hymn, isLoggedIn }: { hymn: HymnListItem; isLoggedIn: boolean }) {
  // Inlined rather than imported from @/lib/content: that module pulls in
  // the prisma client, which can't be bundled into a "use client" component.
  const locked = hymn.memberOnly && !isLoggedIn;
  const content = (
    <>
      <span className="w-8 shrink-0 text-right text-sm tabular-nums text-ter">
        {hymn.pageNumber ?? ""}
      </span>
      <span className="min-w-0 flex-1 truncate text-sm">{hymn.title}</span>
      {locked ? (
        <span className="shrink-0 text-xs text-ter">Members only</span>
      ) : (
        <span aria-hidden className="shrink-0 text-ter">
          →
        </span>
      )}
    </>
  );
  const className =
    "flex items-center gap-2 rounded-md px-3 py-2.5 hover:bg-hover";
  return locked ? (
    <div className={className}>{content}</div>
  ) : (
    <Link href={`/hymns/${hymn.id}`} className={className}>
      {content}
    </Link>
  );
}

/** Page/A-Z/Category sortable hymn list for a hymnalStyle book — see Category.hymnalStyle. */
export function HymnList({ hymns, isLoggedIn }: { hymns: HymnListItem[]; isLoggedIn: boolean }) {
  const [sort, setSort] = useState<SortMode>("page");

  const grouped = useMemo(() => {
    if (sort === "az") {
      return [{ label: null, hymns: [...hymns].sort((a, b) => a.title.localeCompare(b.title)) }];
    }
    if (sort === "category") {
      const byLabel = new Map<string, HymnListItem[]>();
      for (const hymn of hymns) {
        const label = hymn.groupLabel?.trim() || "Other";
        const list = byLabel.get(label) ?? [];
        list.push(hymn);
        byLabel.set(label, list);
      }
      return Array.from(byLabel.entries())
        .sort(([a], [b]) => (a === "Other" ? 1 : b === "Other" ? -1 : a.localeCompare(b)))
        .map(([label, list]) => ({ label, hymns: list }));
    }
    // "page": server order is already position asc; hymnReadingOrder sorts by
    // the printed page number where there is one and keeps the rest in that
    // original order at the end. Shared with the next/previous arrows on a
    // hymn's own page, which have to step in the same sequence this shows.
    return [{ label: null, hymns: hymnReadingOrder(hymns) }];
  }, [hymns, sort]);

  return (
    <div className="space-y-3">
      <div className="inline-flex rounded-lg border border-sep p-0.5 text-sm">
        {(
          [
            ["page", "Page"],
            ["az", "A–Z"],
            ["category", "Category"],
          ] as const
        ).map(([mode, label]) => (
          <button
            key={mode}
            onClick={() => setSort(mode)}
            className={`rounded-md px-3 py-1.5 transition ${
              sort === mode
                ? "btn-primary text-white"
                : "text-sec hover:text-ink"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="rounded-lg border border-sep">
        {grouped.map((group, i) => (
          <div key={group.label ?? i}>
            {group.label && (
              <h3 className="border-b border-sep bg-chip px-3 py-1.5 text-xs font-medium uppercase tracking-wide text-sec">
                {group.label}
              </h3>
            )}
            <div className="divide-y divide-sep">
              {group.hymns.map((hymn) => (
                <HymnRow key={hymn.id} hymn={hymn} isLoggedIn={isLoggedIn} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
