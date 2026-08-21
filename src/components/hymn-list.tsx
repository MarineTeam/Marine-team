"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

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
      <span className="w-8 shrink-0 text-right text-sm tabular-nums text-zinc-400">
        {hymn.pageNumber ?? ""}
      </span>
      <span className="min-w-0 flex-1 truncate text-sm">{hymn.title}</span>
      {locked ? (
        <span className="shrink-0 text-xs text-zinc-400">Members only</span>
      ) : (
        <span aria-hidden className="shrink-0 text-zinc-300 dark:text-zinc-600">
          →
        </span>
      )}
    </>
  );
  const className =
    "flex items-center gap-2 rounded-md px-3 py-2.5 hover:bg-zinc-50 dark:hover:bg-zinc-900";
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
    // "page": server order is already position asc; sort by pageNumber when
    // present, keeping page-less hymns in that original order at the end.
    const withPage = hymns.filter((h) => h.pageNumber != null).sort((a, b) => a.pageNumber! - b.pageNumber!);
    const withoutPage = hymns.filter((h) => h.pageNumber == null);
    return [{ label: null, hymns: [...withPage, ...withoutPage] }];
  }, [hymns, sort]);

  return (
    <div className="space-y-3">
      <div className="inline-flex rounded-lg border border-zinc-200 p-0.5 text-sm dark:border-zinc-800">
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
                ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"
                : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="rounded-lg border border-zinc-200 dark:border-zinc-800">
        {grouped.map((group, i) => (
          <div key={group.label ?? i}>
            {group.label && (
              <h3 className="border-b border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs font-medium uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
                {group.label}
              </h3>
            )}
            <div className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
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
