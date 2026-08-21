"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { fileContentUrl, loadPdfOutline } from "@/lib/pdf-client";
import type { TocEntry } from "@/components/reader-types";

type SortMode = "page" | "az" | "category";

type Group = { label: string | null; entries: TocEntry[] };

/**
 * Groups a flat, depth-tagged outline into sections for the "Category" tab:
 * each depth-0 entry starts a new section (its own label), and every entry
 * at depth 1+ that follows falls under it — reconstructing the tree the
 * outline came from without needing to keep it around as one.
 */
function groupByOutlineSection(entries: TocEntry[]): Group[] {
  const groups: Group[] = [];
  for (const entry of entries) {
    if (entry.depth === 0 || groups.length === 0) {
      groups.push({ label: entry.depth === 0 ? entry.label : null, entries: [] });
    }
    groups[groups.length - 1].entries.push(entry);
  }
  return groups;
}

function EntryRow({ entry, fileId, readerOn }: { entry: TocEntry; fileId: string; readerOn: boolean }) {
  const content = (
    <>
      <span className="w-8 shrink-0 text-right text-sm tabular-nums text-zinc-400">
        {entry.location ?? ""}
      </span>
      <span className="min-w-0 flex-1 truncate text-sm">{entry.label}</span>
      {entry.location && readerOn && (
        <span aria-hidden className="shrink-0 text-zinc-300 dark:text-zinc-600">
          →
        </span>
      )}
    </>
  );
  const className =
    "flex items-center gap-2 rounded-md px-3 py-2.5 hover:bg-zinc-50 dark:hover:bg-zinc-900";
  if (!entry.location || !readerOn) {
    return <div className={`${className} ${entry.location ? "" : "text-zinc-400"}`}>{content}</div>;
  }
  return (
    <Link href={`/read/${fileId}?page=${entry.location}`} className={className}>
      {content}
    </Link>
  );
}

/**
 * A hymnal book's contents, read straight from its PDF's own embedded
 * outline/bookmarks rather than typed in by an admin — see
 * lib/pdf-client.ts. Tapping an entry opens the book reader
 * scrolled straight to that page.
 */
export function BookContents({ fileId, readerOn }: { fileId: string; readerOn: boolean }) {
  const [entries, setEntries] = useState<TocEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sort, setSort] = useState<SortMode>("page");

  useEffect(() => {
    let cancelled = false;
    setEntries(null);
    setError(null);
    loadPdfOutline(fileContentUrl(fileId))
      .then((result) => {
        if (!cancelled) setEntries(result);
      })
      .catch(() => {
        if (!cancelled) setError("Couldn't read this PDF's contents.");
      });
    return () => {
      cancelled = true;
    };
  }, [fileId]);

  const groups = useMemo<Group[]>(() => {
    if (!entries) return [];
    if (sort === "az") {
      return [{ label: null, entries: [...entries].sort((a, b) => a.label.localeCompare(b.label)) }];
    }
    if (sort === "category") return groupByOutlineSection(entries);
    return [{ label: null, entries }];
  }, [entries, sort]);

  if (error) {
    return (
      <div className="rounded-lg border border-dashed border-zinc-300 p-6 text-center text-sm dark:border-zinc-700">
        <p className="text-zinc-500">{error}</p>
        <a
          href={readerOn ? `/read/${fileId}` : `/api/files/${fileId}/content?download=1`}
          className="mt-3 inline-block rounded-md border border-zinc-300 px-4 py-2 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
        >
          {readerOn ? "Open PDF" : "Download PDF"}
        </a>
      </div>
    );
  }

  if (entries === null) {
    return <p className="text-sm text-zinc-500">Reading contents…</p>;
  }

  if (entries.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-zinc-300 p-6 text-center text-sm dark:border-zinc-700">
        <p className="text-zinc-500">This PDF has no bookmarks to list — open it directly instead.</p>
        <a
          href={readerOn ? `/read/${fileId}` : `/api/files/${fileId}/content?download=1`}
          className="mt-3 inline-block rounded-md border border-zinc-300 px-4 py-2 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
        >
          {readerOn ? "Open PDF" : "Download PDF"}
        </a>
      </div>
    );
  }

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
        {groups.map((group, i) => (
          <div key={i}>
            {group.label && (
              <h3 className="border-b border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs font-medium uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
                {group.label}
              </h3>
            )}
            <div className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
              {group.entries.map((entry, j) => (
                <EntryRow key={`${entry.label}-${j}`} entry={entry} fileId={fileId} readerOn={readerOn} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
