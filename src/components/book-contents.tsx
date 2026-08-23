"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { fileContentUrl, loadPdfOutline } from "@/lib/pdf-client";
import { loadCachedToc } from "@/lib/reader-cache";
import { printedPage } from "@/lib/page-offset";
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

function EntryRow({
  entry,
  fileId,
  readerOn,
  pageOffset,
}: {
  entry: TocEntry;
  fileId: string;
  readerOn: boolean;
  pageOffset: number;
}) {
  // Two different numbers, deliberately: the column shows the page printed
  // in the book, while the link carries the PDF page the bookmark actually
  // resolved to. Front matter has no printed number and shows none — the
  // row still opens the reader at the right place.
  const printed = entry.location === null ? null : printedPage(Number(entry.location), pageOffset);
  const content = (
    <>
      <span className="w-8 shrink-0 text-right text-sm tabular-nums text-ter">
        {printed ?? ""}
      </span>
      <span className="min-w-0 flex-1 truncate text-sm">{entry.label}</span>
      {entry.location && readerOn && (
        <span aria-hidden className="shrink-0 text-ter">
          →
        </span>
      )}
    </>
  );
  const className =
    "flex items-center gap-2 rounded-md px-3 py-2.5 hover:bg-hover";
  if (!entry.location || !readerOn) {
    return <div className={`${className} ${entry.location ? "" : "text-ter"}`}>{content}</div>;
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
 *
 * `pageOffset` is the book's front matter (FileAsset.pageOffset), so the
 * numbers listed here are the ones printed in the book rather than the PDF
 * pages the bookmarks resolve to.
 *
 * Reading those bookmarks means opening the PDF and resolving every one of
 * them to a page, which on a hymnal is the slowest thing this page does — so
 * the result is cached on the device, tagged with `cacheTag` so a replaced
 * book is read afresh. See lib/reader-cache.ts.
 */
export function BookContents({
  fileId,
  readerOn,
  pageOffset,
  cacheTag,
}: {
  fileId: string;
  readerOn: boolean;
  pageOffset: number;
  cacheTag: string;
}) {
  // Tagged with the book it was read from, so switching books shows the
  // loading state on the very first render rather than the outline of the
  // book just navigated away from.
  const [outline, setOutline] = useState<{
    fileId: string;
    entries: TocEntry[] | null;
    error: string | null;
  }>({ fileId, entries: null, error: null });
  const [sort, setSort] = useState<SortMode>("page");

  const { entries, error } =
    outline.fileId === fileId ? outline : { entries: null, error: null };

  useEffect(() => {
    let cancelled = false;
    loadCachedToc(fileId, cacheTag, () => loadPdfOutline(fileContentUrl(fileId)))
      .then((result) => {
        if (!cancelled) setOutline({ fileId, entries: result, error: null });
      })
      .catch(() => {
        if (!cancelled)
          setOutline({ fileId, entries: null, error: "Couldn't read this PDF's contents." });
      });
    return () => {
      cancelled = true;
    };
  }, [fileId, cacheTag]);

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
      <div className="rounded-lg border border-dashed border-sep p-6 text-center text-sm">
        <p className="text-sec">{error}</p>
        <a
          href={readerOn ? `/read/${fileId}` : `/api/files/${fileId}/content?download=1`}
          className="mt-3 inline-block rounded-md border border-sep px-4 py-2 text-sm hover:bg-hover"
        >
          {readerOn ? "Open PDF" : "Download PDF"}
        </a>
      </div>
    );
  }

  if (entries === null) {
    // The direct link is offered while still loading, not just on failure: a
    // large book fetched over range requests can take a while, and there's
    // no reason to make someone wait on the contents to start reading.
    return (
      <div className="space-y-3">
        <p className="text-sm text-sec">Reading contents…</p>
        <a
          href={readerOn ? `/read/${fileId}` : `/api/files/${fileId}/content?download=1`}
          className="inline-block rounded-md border border-sep px-4 py-2 text-sm hover:bg-hover"
        >
          {readerOn ? "Open PDF" : "Download PDF"}
        </a>
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-sep p-6 text-center text-sm">
        <p className="text-sec">This PDF has no bookmarks to list — open it directly instead.</p>
        <a
          href={readerOn ? `/read/${fileId}` : `/api/files/${fileId}/content?download=1`}
          className="mt-3 inline-block rounded-md border border-sep px-4 py-2 text-sm hover:bg-hover"
        >
          {readerOn ? "Open PDF" : "Download PDF"}
        </a>
      </div>
    );
  }

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
        {groups.map((group, i) => (
          <div key={i}>
            {group.label && (
              <h3 className="border-b border-sep bg-chip px-3 py-1.5 text-xs font-medium uppercase tracking-wide text-sec">
                {group.label}
              </h3>
            )}
            <div className="divide-y divide-sep">
              {group.entries.map((entry, j) => (
                <EntryRow
                  key={`${entry.label}-${j}`}
                  entry={entry}
                  fileId={fileId}
                  readerOn={readerOn}
                  pageOffset={pageOffset}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
