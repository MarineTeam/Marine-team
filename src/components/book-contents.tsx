"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { fileContentUrl, loadPdfOutline } from "@/lib/pdf-client";
import { loadCachedToc } from "@/lib/reader-cache";
import { printedPage } from "@/lib/page-offset";
import { countNumberedEntries, findHymnIndex, hymnNumberOf } from "@/lib/toc-nav";
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

/** One shared empty set, so a book with no typed hymns doesn't re-render on identity. */
const EMPTY_NUMBERS: Set<number> = new Set();

function EntryRow({
  entry,
  fileId,
  readerOn,
  pageOffset,
  presentable,
}: {
  entry: TocEntry;
  fileId: string;
  readerOn: boolean;
  pageOffset: number;
  /** Hymn numbers in this book whose words somebody has typed out. */
  presentable: Set<number>;
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
  const className = "flex items-center gap-2 rounded-md px-3 py-2.5 hover:bg-hover";
  const number = hymnNumberOf(entry.label);
  const row =
    !entry.location || !readerOn ? (
      <div className={`${className} ${entry.location ? "" : "text-ter"}`}>{content}</div>
    ) : (
      <Link href={`/read/${fileId}?page=${entry.location}`} className={className}>
        {content}
      </Link>
    );

  // A scanned page can't be projected, but words typed against this number
  // can — so the hymns somebody has typed out offer the screen from here,
  // where a hymn gets chosen, and the rest of the book reads as before.
  if (number === null || !presentable.has(number)) return row;
  return (
    <div className="flex items-center">
      <div className="min-w-0 flex-1">{row}</div>
      <Link
        href={`/present/${fileId}?hymn=${number}`}
        className="mr-2 shrink-0 rounded border border-sep px-2 py-1 text-xs text-sec hover:bg-hover"
      >
        Present
      </Link>
    </div>
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
  openHymn = null,
  presentableNumbers = EMPTY_NUMBERS,
}: {
  fileId: string;
  readerOn: boolean;
  pageOffset: number;
  cacheTag: string;
  /**
   * Hymn numbers in this book that have words stored — the ones that can go
   * on a projector. Resolved on the server, because the PDF this component
   * reads says nothing about them.
   */
  presentableNumbers?: Set<number>;
  /**
   * A hymn number to go straight to, from a link that knew the number but not
   * the page — a service plan's row, say. Resolved here because this is where
   * the book's own contents are, and they are the only thing that knows.
   */
  openHymn?: number | null;
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
  const [hymnQuery, setHymnQuery] = useState("");
  const [hymnMissing, setHymnMissing] = useState<number | null>(null);
  const router = useRouter();

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

  // A number handed in by a link, the moment there are contents to resolve it
  // against. Replaces rather than pushes: coming back from the reader should
  // land on the contents, not bounce straight back into it.
  useEffect(() => {
    if (openHymn === null || !entries || entries.length === 0) return;
    const at = findHymnIndex(entries, openHymn);
    const entry = at === null ? null : entries[at];
    if (entry?.location && readerOn) router.replace(`/read/${fileId}?page=${entry.location}`);
    // The book doesn't list that number — said here rather than leaving
    // someone looking at a contents list wondering why they were sent to it.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    else setHymnMissing(openHymn);
  }, [openHymn, entries, readerOn, fileId, router]);

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

  /**
   * Straight to the hymn printed under a number, which is what someone
   * standing up to sing actually has: the number on the board, not the page
   * it happens to be on.
   */
  function goToHymn(event: React.FormEvent) {
    event.preventDefault();
    const wanted = Number(hymnQuery.trim());
    // `entries` is non-null by the time this renders — the loading and empty
    // states return above — but the closure doesn't carry that narrowing.
    if (!entries || !Number.isInteger(wanted) || wanted < 1) return;
    const at = findHymnIndex(entries, wanted);
    const entry = at === null ? null : entries[at];
    if (!entry?.location) {
      setHymnMissing(wanted);
      return;
    }
    router.push(`/read/${fileId}?page=${entry.location}`);
  }

  // Only where the book numbers its own contents, and only when there is a
  // reader to open at that hymn.
  const canJumpToHymn = readerOn && countNumberedEntries(entries ?? []) > 1;

  return (
    <div className="space-y-3">
      {canJumpToHymn && (
        <form onSubmit={goToHymn} className="flex flex-wrap items-center gap-2 text-sm">
          <label htmlFor="contents-hymn-number" className="text-sec">
            Go to hymn
          </label>
          <input
            id="contents-hymn-number"
            value={hymnQuery}
            onChange={(e) => {
              setHymnQuery(e.target.value);
              setHymnMissing(null);
            }}
            inputMode="numeric"
            pattern="[0-9]*"
            aria-label="Hymn number"
            aria-invalid={hymnMissing !== null}
            className="w-20 rounded-md border border-sep px-2 py-1.5 text-center tabular-nums"
          />
          <button type="submit" className="rounded-md border border-sep px-3 py-1.5 hover:bg-hover">
            Open
          </button>
          {hymnMissing !== null && (
            <span className="text-sec">No hymn {hymnMissing} in this book.</span>
          )}
        </form>
      )}

      {/* A number that came in on a link, in a book whose contents don't carry
          numbers at all — there is no box to put the message in, so it stands
          on its own rather than leaving somebody staring at a list they
          didn't ask for. */}
      {hymnMissing !== null && !canJumpToHymn && (
        <p className="text-sm text-sec">
          This book&apos;s contents don&apos;t list a hymn {hymnMissing}. It&apos;s below if it&apos;s here
          under another name.
        </p>
      )}

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
                  presentable={presentableNumbers}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
