"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { PdfReader } from "@/components/pdf-reader";
import { EpubReader } from "@/components/epub-reader";
import { ReaderSpeech } from "@/components/reader-speech";
import { ReaderMarks, type ReadingMark } from "@/components/reader-marks";
import type { ReaderFormat } from "@/lib/reader";
import { bookCacheTag, loadCachedToc } from "@/lib/reader-cache";
import {
  countNumberedEntries,
  currentTocIndex,
  findHymnIndex,
  nextTocIndex,
  previousTocIndex,
  type TocPosition,
} from "@/lib/toc-nav";
import type { ReaderHandle, SearchHit, TocEntry } from "@/components/reader-types";

type Panel = "contents" | "search" | "marks";

/**
 * The chrome around whichever reader engine is in use: contents, in-book
 * search, hymn-to-hymn navigation, and saving where the member got to. It
 * talks only to ReaderHandle, so it never needs to know a PDF page from an
 * EPUB CFI.
 */
export function BookReader({
  fileId,
  fileTitle,
  format,
  backHref,
  backLabel,
  initialLocation,
  pageOffset,
  sizeBytes,
  canSaveProgress,
}: {
  fileId: string;
  fileTitle: string;
  format: ReaderFormat;
  backHref: string;
  backLabel: string;
  initialLocation: string | null;
  /**
   * The book's front matter, for showing printed page numbers rather than
   * PDF ones — see lib/page-offset.ts. PDF-only: an EPUB reflows and has no
   * fixed pages to be offset from, so EpubReader is handed nothing.
   */
  pageOffset: number;
  /**
   * The file's size. Decides how a PDF is fetched (see PdfReader), and tags
   * this book's cached contents so a replaced file isn't read from the
   * previous one's list.
   */
  sizeBytes: number | null;
  /** False for a signed-out reader: the book still opens, nothing is stored. */
  canSaveProgress: boolean;
}) {
  const handleRef = useRef<ReaderHandle | null>(null);
  const [ready, setReady] = useState(false);
  const [panel, setPanel] = useState<Panel | null>(null);
  const [toc, setToc] = useState<TocEntry[] | null>(null);
  const [tocLoading, setTocLoading] = useState(false);
  /**
   * The contents entries and the current spot, on the one number line the
   * reader put them on — see ReaderHandle.order. Kept as positions rather
   * than recomputed from locations on each render, because for an EPUB
   * placing an entry means asking the spine about it.
   */
  const [positions, setPositions] = useState<TocPosition[]>([]);
  const [here, setHere] = useState<TocPosition>(null);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [marks, setMarks] = useState<ReadingMark[]>([]);
  const [marking, setMarking] = useState(false);
  const [hymnQuery, setHymnQuery] = useState("");
  const [hymnMissing, setHymnMissing] = useState<number | null>(null);

  const cacheTag = bookCacheTag({ sizeBytes });

  // Called again on every page turn (the engines rebuild their handle as
  // their own state moves), so this settles to true and stays there.
  const onReady = useCallback((handle: ReaderHandle) => {
    handleRef.current = handle;
    setReady(true);
  }, []);

  // Progress is saved on a trailing debounce rather than on every location
  // change: paging quickly through a book would otherwise fire a request per
  // page turn, and only the page they stop on matters.
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onLocationChange = useCallback(
    (location: string, percent: number) => {
      // Not debounced, unlike the save below: this is what the contents bar
      // reads to say which hymn is on screen, and it has to keep up.
      setHere(handleRef.current?.order([location])[0] ?? null);

      if (!canSaveProgress) return;
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        void fetch("/api/reading/progress", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fileId, location, percent }),
          keepalive: true,
        }).catch(() => {
          // Losing a bookmark to a flaky connection isn't worth interrupting
          // someone's reading over; the next page turn will try again.
        });
      }, 1500);
    },
    [canSaveProgress, fileId],
  );

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  /**
   * Loads the contents once, as soon as the reader can answer for them —
   * rather than waiting for someone to open the Contents panel — because the
   * bar along the bottom navigates by them and has to know where the hymns
   * are before it can offer the next one.
   *
   * That is affordable only because the answer is cached per device: on a
   * second visit this resolves from localStorage without the PDF being
   * opened at all (see lib/reader-cache.ts).
   */
  const requestedRef = useRef(false);
  const loadContents = useCallback(async () => {
    const handle = handleRef.current;
    if (!handle || requestedRef.current) return;
    requestedRef.current = true;
    setTocLoading(true);
    try {
      const entries = await loadCachedToc(fileId, cacheTag, () => handle.loadToc());
      setToc(entries);
      setPositions(handle.order(entries.map((entry) => entry.location)));
      // Where the reader already is. The first onLocationChange can arrive
      // before the engine has handed its handle over — there is nothing to
      // ask at that point — so without this the bar would sit blank until the
      // first page turn.
      setHere(handle.order([handle.currentLocation()])[0] ?? null);
    } catch {
      // A contents list that won't read shouldn't take the reader with it:
      // the book still opens, with no bar and an empty Contents panel.
      setToc([]);
      requestedRef.current = false;
    } finally {
      setTocLoading(false);
    }
  }, [fileId, cacheTag]);

  useEffect(() => {
    if (ready) void loadContents();
  }, [ready, loadContents]);

  async function runSearch(event: React.FormEvent) {
    event.preventDefault();
    if (!query.trim()) return;
    setSearching(true);
    try {
      setHits((await handleRef.current?.search(query)) ?? []);
    } finally {
      setSearching(false);
    }
  }

  function goTo(location: string) {
    handleRef.current?.goTo(location);
  }

  /**
   * Creates a mark at wherever the reader currently is.
   *
   * Selected text is read from the top-level selection, which covers PDF
   * (the text layer sits in this document) but not EPUB, whose content is
   * inside a same-origin iframe epub.js owns. Rather than reach into that
   * iframe, an EPUB highlight falls back to a bookmark at the current CFI —
   * still useful, and honest about what it captured.
   */
  async function addMark(kind: "HIGHLIGHT" | "BOOKMARK") {
    const handle = handleRef.current;
    if (!handle || !canSaveProgress) return;

    const selected = typeof window !== "undefined" ? window.getSelection()?.toString().trim() : "";
    const excerpt = selected ? selected.slice(0, 2000) : null;

    setMarking(true);
    try {
      const res = await fetch("/api/reading/marks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileId,
          kind: excerpt ? kind : "BOOKMARK",
          location: handle.currentLocation(),
          excerpt,
          color: "yellow",
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setMarks((current) => [...current, data.mark]);
        setPanel("marks");
      }
    } finally {
      setMarking(false);
    }
  }

  /**
   * Jumps to the hymn printed under a number — the number that goes up on the
   * board, which in most books is not the page it is on.
   */
  function goToHymn(event: React.FormEvent) {
    event.preventDefault();
    const wanted = Number(hymnQuery.trim());
    if (!toc || !Number.isInteger(wanted) || wanted < 1) return;
    const at = findHymnIndex(toc, wanted);
    const entry = at === null ? null : toc[at];
    if (!entry?.location) {
      setHymnMissing(wanted);
      return;
    }
    setHymnMissing(null);
    setHymnQuery("");
    goTo(entry.location);
  }

  // --- Hymn to hymn, by the book's own contents ----------------------------
  const currentEntry = toc?.[currentTocIndex(positions, here) ?? -1] ?? null;
  const previousEntry = toc?.[previousTocIndex(positions, here) ?? -1] ?? null;
  const nextEntry = toc?.[nextTocIndex(positions, here) ?? -1] ?? null;
  // One entry can't be stepped between, and a book whose bookmarks all failed
  // to resolve would offer buttons that do nothing.
  const canStepEntries = positions.filter((position) => position !== null).length > 1;
  // Offered only where the book numbers its own entries: a contents list of
  // chapter titles has nothing to type into it.
  const canJumpToHymn = (toc?.length ?? 0) > 0 && countNumberedEntries(toc ?? []) > 1;

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      <header className="flex flex-wrap items-center gap-3 border-b border-sep px-4 py-2">
        <Link href={backHref} className="text-sm text-sec hover:underline">
          ← {backLabel}
        </Link>
        <h1 className="flex-1 truncate text-sm font-medium">{fileTitle}</h1>
        <button
          onClick={() => {
            setPanel((p) => (p === "contents" ? null : "contents"));
            // Normally already loaded — the bar below needs it — but a read
            // that failed left nothing, and opening the panel is a fair place
            // to try again.
            void loadContents();
          }}
          aria-pressed={panel === "contents"}
          className="rounded-md border border-sep px-2 py-1 text-xs hover:bg-hover"
        >
          Contents
        </button>
        <button
          onClick={() => setPanel((p) => (p === "search" ? null : "search"))}
          aria-pressed={panel === "search"}
          className="rounded-md border border-sep px-2 py-1 text-xs hover:bg-hover"
        >
          Search
        </button>
        <button
          onClick={() => setPanel((p) => (p === "marks" ? null : "marks"))}
          aria-pressed={panel === "marks"}
          className="rounded-md border border-sep px-2 py-1 text-xs hover:bg-hover"
        >
          Marks{marks.length > 0 ? ` (${marks.length})` : ""}
        </button>
        {canSaveProgress && (
          <button
            onClick={() => void addMark("HIGHLIGHT")}
            disabled={marking}
            title="Highlight the selected text, or save this spot"
            className="rounded-md border border-sep px-2 py-1 text-xs hover:bg-hover disabled:opacity-50"
          >
            🖍 Mark
          </button>
        )}
      </header>

      <div className="flex min-h-0 flex-1">
        {panel && (
          <aside className="w-72 shrink-0 overflow-auto border-r border-sep p-3">
            {panel === "contents" && (
              <>
                <h2 className="mb-2 text-[11px] font-bold tracking-[0.08em] text-ter uppercase">Contents</h2>
                {tocLoading && <p className="text-sm text-sec">Loading…</p>}
                {toc?.length === 0 && !tocLoading && (
                  <p className="text-sm text-sec">This book has no contents list.</p>
                )}
                <ul className="space-y-1 text-sm">
                  {toc?.map((entry, i) => (
                    <li key={`${entry.label}-${i}`} style={{ paddingLeft: entry.depth * 12 }}>
                      {entry.location ? (
                        <button
                          onClick={() => goTo(entry.location!)}
                          aria-current={entry === currentEntry ? "true" : undefined}
                          className={`w-full text-left hover:underline ${
                            entry === currentEntry ? "font-medium text-ink" : ""
                          }`}
                        >
                          {entry.label}
                        </button>
                      ) : (
                        <span className="text-ter">{entry.label}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </>
            )}

            {panel === "search" && (
              <>
                <h2 className="mb-2 text-[11px] font-bold tracking-[0.08em] text-ter uppercase">Search</h2>
                <form onSubmit={runSearch} className="mb-3 flex gap-2">
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Find in book"
                    aria-label="Find in book"
                    className="w-full rounded border border-sep px-2 py-1 text-sm"
                  />
                  <button
                    type="submit"
                    className="rounded-md border border-sep px-2 py-1 text-sm"
                  >
                    Go
                  </button>
                </form>
                {searching && <p className="text-sm text-sec">Searching…</p>}
                {hits?.length === 0 && !searching && <p className="text-sm text-sec">No matches.</p>}
                <ul className="space-y-2 text-sm">
                  {hits?.map((hit, i) => (
                    <li key={`${hit.location}-${i}`}>
                      <button onClick={() => goTo(hit.location)} className="w-full text-left hover:bg-hover">
                        <span className="block text-xs text-sec">{hit.label}</span>
                        <span className="block text-sec">{hit.excerpt}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}

            {panel === "marks" && (
              <>
                <h2 className="mb-2 text-[11px] font-bold tracking-[0.08em] text-ter uppercase">Marks</h2>
                <ReaderMarks
                  fileId={fileId}
                  marks={marks}
                  onChanged={setMarks}
                  onGoTo={goTo}
                  canMark={canSaveProgress}
                />
              </>
            )}
          </aside>
        )}

        <main className="min-w-0 flex-1">
          {format === "pdf" ? (
            <PdfReader
              fileUrl={`/api/files/${fileId}/content`}
              initialLocation={initialLocation}
              pageOffset={pageOffset}
              sizeBytes={sizeBytes}
              onReady={onReady}
              onLocationChange={onLocationChange}
            />
          ) : (
            <EpubReader
              fileUrl={`/api/files/${fileId}/content`}
              initialLocation={initialLocation}
              onReady={onReady}
              onLocationChange={onLocationChange}
            />
          )}
        </main>
      </div>

      {/*
        Whole entries at a time, rather than pages: in a hymnal that is the
        next hymn and the one before it. "Back" goes to the start of the hymn
        being read before it goes to the one before — the same thing a track
        skip does, and the more useful of the two when someone has paged past
        the first verse.
      */}
      {canStepEntries && (
        <nav
          aria-label="Contents navigation"
          className="flex flex-wrap items-center gap-2 border-t border-sep px-3 py-2 text-sm sm:gap-3"
        >
          {canJumpToHymn && (
            <form onSubmit={goToHymn} className="flex items-center gap-1">
              <label htmlFor="hymn-number" className="text-xs text-sec">
                Hymn
              </label>
              <input
                id="hymn-number"
                value={hymnQuery}
                onChange={(e) => {
                  setHymnQuery(e.target.value);
                  setHymnMissing(null);
                }}
                // A phone should offer digits for this, and Enter should be
                // the whole interaction — in a service there is no time for
                // a second tap on a Go button.
                inputMode="numeric"
                pattern="[0-9]*"
                aria-label="Go to hymn number"
                aria-invalid={hymnMissing !== null}
                className="w-14 rounded border border-sep px-1.5 py-1 text-center tabular-nums"
              />
            </form>
          )}
          <button
            onClick={() => previousEntry?.location && goTo(previousEntry.location)}
            disabled={!previousEntry}
            aria-label={previousEntry ? `Back to ${previousEntry.label}` : "Back"}
            title={previousEntry?.label ?? undefined}
            className="rounded-md border border-sep px-3 py-1.5 hover:bg-hover disabled:opacity-40"
          >
            ‹ Back
          </button>
          <p className="min-w-0 flex-1 truncate text-center text-sec" aria-live="polite">
            {hymnMissing !== null ? `No hymn ${hymnMissing} in this book` : (currentEntry?.label ?? "")}
          </p>
          <button
            onClick={() => nextEntry?.location && goTo(nextEntry.location)}
            disabled={!nextEntry}
            aria-label={nextEntry ? `Next: ${nextEntry.label}` : "Next"}
            title={nextEntry?.label ?? undefined}
            className="rounded-md border border-sep px-3 py-1.5 hover:bg-hover disabled:opacity-40"
          >
            Next ›
          </button>
        </nav>
      )}

      <ReaderSpeech handleRef={handleRef} />
    </div>
  );
}
