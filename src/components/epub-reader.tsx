"use client";

import { useEffect, useRef, useState } from "react";
import type { Book, Rendition, NavItem } from "epubjs";
import type { ReaderHandle, SearchHit, TocEntry } from "@/components/reader-types";

/**
 * EPUB half of the reader, using epub.js.
 *
 * Imported dynamically inside an effect for the same reasons as the PDF
 * side: it reaches for browser globals at load and has no business in a
 * server render or in bundles that never open a book.
 *
 * epub.js is effectively unmaintained (0.3.93) and its bundled TypeScript
 * definitions are wrong in places — `Section.find()` is declared
 * `Array<Element>` but actually returns `{ cfi, excerpt }` objects, which is
 * why SectionMatch below is declared by hand rather than imported.
 */
type SectionMatch = { cfi: string; excerpt: string };

/** The spine's own type isn't exported usefully; this is the shape actually used here. */
type SpineItem = {
  href: string;
  load: (request: unknown) => Promise<unknown>;
  unload: () => void;
  find: (query: string) => SectionMatch[];
};

export function EpubReader({
  fileUrl,
  initialLocation,
  onReady,
  onLocationChange,
}: {
  fileUrl: string;
  initialLocation: string | null;
  onReady: (handle: ReaderHandle) => void;
  onLocationChange: (location: string, percent: number) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const bookRef = useRef<Book | null>(null);
  const renditionRef = useRef<Rendition | null>(null);
  const locationRef = useRef<string | null>(initialLocation);

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let cancelled = false;
    let book: Book | null = null;
    let rendition: Rendition | null = null;

    (async () => {
      try {
        const ePub = (await import("epubjs")).default;

        // openAs is essential, not decorative: epub.js otherwise guesses the
        // format from the URL's file extension, and the content route
        // (/api/files/<id>/content) deliberately has none. Without this it
        // falls through to treating the URL as an *unzipped* EPUB directory
        // and fails on a file that's perfectly fine.
        book = ePub(fileUrl, { openAs: "epub" });
        if (cancelled) return;
        bookRef.current = book;

        rendition = book.renderTo(container, {
          width: "100%",
          height: "100%",
          // Scrolled rather than paginated: it behaves far better on a phone,
          // and it means read-aloud isn't fighting a column layout to keep
          // the spoken text on screen.
          flow: "scrolled-doc",
          spread: "none",
        });
        renditionRef.current = rendition;

        await rendition.display(initialLocation ?? undefined);
        if (cancelled) return;
        setLoading(false);

        rendition.on("relocated", (location: { start?: { cfi?: string } }) => {
          const cfi = location?.start?.cfi;
          if (!cfi) return;
          locationRef.current = cfi;
          let percent = 0;
          try {
            // Only meaningful once generate() below has finished; it returns
            // 0 rather than throwing before that, which is a fine default.
            percent = book!.locations.percentageFromCfi(cfi) * 100;
          } catch {
            percent = 0;
          }
          onLocationChange(cfi, percent);
        });

        // Generated after first paint, never awaited before it: on a
        // full-length book this walks the whole spine and would otherwise
        // hold up the first page for seconds.
        void book.ready
          .then(() => book!.locations.generate(1000))
          .catch(() => {
            // Only costs an accurate percentage; reading still works.
          });
      } catch (err) {
        if (cancelled) return;
        setLoading(false);
        setError(err instanceof Error ? err.message : "This EPUB could not be opened.");
      }
    })();

    return () => {
      cancelled = true;
      // Both are needed, and in this order: destroying the rendition detaches
      // the iframe from the container, destroying the book releases the
      // unzipped archive. Skipping either leaves a second copy rendered when
      // React's strict mode mounts this twice in development.
      try {
        rendition?.destroy();
        book?.destroy();
      } catch {
        // Already torn down.
      }
      renditionRef.current = null;
      bookRef.current = null;
    };
  }, [fileUrl, initialLocation, onLocationChange]);

  // --- Expose TOC / search / text to the surrounding chrome ----------------
  useEffect(() => {
    if (loading || error) return;

    async function loadToc(): Promise<TocEntry[]> {
      const book = bookRef.current;
      if (!book) return [];
      await book.ready;

      function flatten(items: NavItem[], depth: number): TocEntry[] {
        return items.flatMap((item) => [
          { label: item.label.trim(), location: item.href, depth },
          ...(item.subitems?.length ? flatten(item.subitems, depth + 1) : []),
        ]);
      }
      return flatten(book.navigation.toc, 0);
    }

    async function search(query: string): Promise<SearchHit[]> {
      const book = bookRef.current;
      if (!book) return [];
      await book.ready;

      const spine = book.spine as unknown as { spineItems: SpineItem[] };
      const labelFor = (href: string) =>
        book.navigation.toc.find((item) => item.href.includes(href.split("/").pop() ?? ""))?.label.trim();

      const hits: SearchHit[] = [];
      for (const item of spine.spineItems) {
        try {
          // A section has to be loaded before it can be searched, and
          // unloaded afterwards — leaving every section of a long book
          // loaded is how this turns into hundreds of megabytes.
          await item.load(book.load.bind(book));
          for (const match of item.find(query).slice(0, 5)) {
            hits.push({
              label: labelFor(item.href) ?? "Result",
              excerpt: match.excerpt,
              location: match.cfi,
            });
          }
        } catch {
          // A section that won't load isn't worth failing the whole search over.
        } finally {
          try {
            item.unload();
          } catch {
            // Already unloaded.
          }
        }
      }
      return hits;
    }

    async function textAt(): Promise<string> {
      // Text comes from what's actually rendered rather than from the spine,
      // so read-aloud speaks the section the reader is looking at.
      const rendition = renditionRef.current;
      const contents = rendition?.getContents() as unknown as { document: Document }[] | undefined;
      if (!contents?.length) return "";
      return contents.map((c) => c.document?.body?.textContent ?? "").join(" ");
    }

    onReady({
      loadToc,
      search,
      textAt,
      goTo: (location) => void renditionRef.current?.display(location),
      next: () => void renditionRef.current?.next(),
      previous: () => void renditionRef.current?.prev(),
      currentLocation: () => locationRef.current ?? "",
      advance: () => {
        const rendition = renditionRef.current;
        if (!rendition) return false;
        void rendition.next();
        // epub.js resolves next() even at the end of the book, so unlike the
        // PDF side this can't truthfully report whether it moved. Read-aloud
        // stops when a section yields no text instead.
        return true;
      },
    });
  }, [loading, error, onReady]);

  if (error) {
    return <div className="flex h-full items-center justify-center p-8 text-center text-sm text-red-600">{error}</div>;
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-center gap-2 border-b border-zinc-200 p-2 text-sm dark:border-zinc-800">
        <button
          onClick={() => void renditionRef.current?.prev()}
          className="rounded-md border border-zinc-300 px-2 py-1 dark:border-zinc-700"
        >
          ‹ Prev
        </button>
        <button
          onClick={() => void renditionRef.current?.next()}
          className="rounded-md border border-zinc-300 px-2 py-1 dark:border-zinc-700"
        >
          Next ›
        </button>
      </div>
      <div className="relative min-h-0 flex-1 bg-white dark:bg-zinc-900">
        {loading && (
          <p className="absolute inset-x-0 top-8 text-center text-sm text-zinc-500">Opening…</p>
        )}
        <div ref={containerRef} className="h-full w-full" />
      </div>
    </div>
  );
}
