"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { PdfReader } from "@/components/pdf-reader";
import { EpubReader } from "@/components/epub-reader";
import { ReaderSpeech } from "@/components/reader-speech";
import { ReaderMarks, type ReadingMark } from "@/components/reader-marks";
import type { ReaderFormat } from "@/lib/reader";
import type { ReaderHandle, SearchHit, TocEntry } from "@/components/reader-types";

type Panel = "contents" | "search" | "marks";

/**
 * The chrome around whichever reader engine is in use: contents, in-book
 * search, and saving where the member got to. It talks only to ReaderHandle,
 * so it never needs to know a PDF page from an EPUB CFI.
 */
export function BookReader({
  fileId,
  fileTitle,
  format,
  backHref,
  backLabel,
  initialLocation,
  canSaveProgress,
}: {
  fileId: string;
  fileTitle: string;
  format: ReaderFormat;
  backHref: string;
  backLabel: string;
  initialLocation: string | null;
  /** False for a signed-out reader: the book still opens, nothing is stored. */
  canSaveProgress: boolean;
}) {
  const handleRef = useRef<ReaderHandle | null>(null);
  const [panel, setPanel] = useState<Panel | null>(null);
  const [toc, setToc] = useState<TocEntry[] | null>(null);
  const [tocLoading, setTocLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [marks, setMarks] = useState<ReadingMark[]>([]);
  const [marking, setMarking] = useState(false);

  const onReady = useCallback((handle: ReaderHandle) => {
    handleRef.current = handle;
  }, []);

  // Progress is saved on a trailing debounce rather than on every location
  // change: paging quickly through a book would otherwise fire a request per
  // page turn, and only the page they stop on matters.
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onLocationChange = useCallback(
    (location: string, percent: number) => {
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

  async function openContents() {
    setPanel((p) => (p === "contents" ? null : "contents"));
    if (toc !== null || tocLoading) return;
    setTocLoading(true);
    try {
      setToc((await handleRef.current?.loadToc()) ?? []);
    } finally {
      setTocLoading(false);
    }
  }

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

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      <header className="flex flex-wrap items-center gap-3 border-b border-zinc-200 px-4 py-2 dark:border-zinc-800">
        <Link href={backHref} className="text-sm text-zinc-500 hover:underline">
          ← {backLabel}
        </Link>
        <h1 className="flex-1 truncate text-sm font-medium">{fileTitle}</h1>
        <button
          onClick={openContents}
          aria-pressed={panel === "contents"}
          className="rounded-md border border-zinc-300 px-2 py-1 text-xs hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
        >
          Contents
        </button>
        <button
          onClick={() => setPanel((p) => (p === "search" ? null : "search"))}
          aria-pressed={panel === "search"}
          className="rounded-md border border-zinc-300 px-2 py-1 text-xs hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
        >
          Search
        </button>
        <button
          onClick={() => setPanel((p) => (p === "marks" ? null : "marks"))}
          aria-pressed={panel === "marks"}
          className="rounded-md border border-zinc-300 px-2 py-1 text-xs hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
        >
          Marks{marks.length > 0 ? ` (${marks.length})` : ""}
        </button>
        {canSaveProgress && (
          <button
            onClick={() => void addMark("HIGHLIGHT")}
            disabled={marking}
            title="Highlight the selected text, or save this spot"
            className="rounded-md border border-zinc-300 px-2 py-1 text-xs hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            🖍 Mark
          </button>
        )}
      </header>

      <div className="flex min-h-0 flex-1">
        {panel && (
          <aside className="w-72 shrink-0 overflow-auto border-r border-zinc-200 p-3 dark:border-zinc-800">
            {panel === "contents" && (
              <>
                <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">Contents</h2>
                {tocLoading && <p className="text-sm text-zinc-500">Loading…</p>}
                {toc?.length === 0 && !tocLoading && (
                  <p className="text-sm text-zinc-500">This book has no contents list.</p>
                )}
                <ul className="space-y-1 text-sm">
                  {toc?.map((entry, i) => (
                    <li key={`${entry.label}-${i}`} style={{ paddingLeft: entry.depth * 12 }}>
                      {entry.location ? (
                        <button
                          onClick={() => goTo(entry.location!)}
                          className="w-full text-left hover:underline"
                        >
                          {entry.label}
                        </button>
                      ) : (
                        <span className="text-zinc-400">{entry.label}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </>
            )}

            {panel === "search" && (
              <>
                <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">Search</h2>
                <form onSubmit={runSearch} className="mb-3 flex gap-2">
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Find in book"
                    aria-label="Find in book"
                    className="w-full rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                  />
                  <button
                    type="submit"
                    className="rounded-md border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700"
                  >
                    Go
                  </button>
                </form>
                {searching && <p className="text-sm text-zinc-500">Searching…</p>}
                {hits?.length === 0 && !searching && <p className="text-sm text-zinc-500">No matches.</p>}
                <ul className="space-y-2 text-sm">
                  {hits?.map((hit, i) => (
                    <li key={`${hit.location}-${i}`}>
                      <button onClick={() => goTo(hit.location)} className="w-full text-left hover:bg-zinc-50 dark:hover:bg-zinc-900">
                        <span className="block text-xs text-zinc-500">{hit.label}</span>
                        <span className="block text-zinc-700 dark:text-zinc-300">{hit.excerpt}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}

            {panel === "marks" && (
              <>
                <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">Marks</h2>
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

      <ReaderSpeech handleRef={handleRef} />
    </div>
  );
}
