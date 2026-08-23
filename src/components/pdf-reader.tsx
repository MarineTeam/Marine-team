"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { excerptAround, findMatches, shouldFetchWholeBook } from "@/lib/reader";
import { getPdfjs, resolvePdfOutline } from "@/lib/pdf-client";
import { pdfPageOf, printedPage } from "@/lib/page-offset";
import { readDeviceSettings, writeDeviceSettings } from "@/lib/device-settings";
import type { ReaderHandle, SearchHit, TocEntry } from "@/components/reader-types";

/**
 * PDF half of the reader, using pdf.js — loaded on demand through
 * getPdfjs(), which also wires up the worker (see lib/pdf-client.ts for why
 * that import can't happen at module scope).
 */
type PdfDocument = PDFDocumentProxy;

/** How far a finger has to travel across the page before it counts as a page turn. */
const SWIPE_DISTANCE = 60;
/**
 * How far it has to travel before the gesture commits to an axis at all.
 * Below this a touch is still ambiguous, and claiming it would make the page
 * jump about while someone is only trying to scroll.
 */
const SWIPE_AXIS_LOCK = 12;
/**
 * The page follows the finger at a fraction of its travel, and no further
 * than this. There is no neighbouring page rendered behind it to reveal, so
 * this is feedback that the gesture was seen, not a page actually moving.
 */
const SWIPE_DRAG_RATIO = 0.35;
const SWIPE_DRAG_MAX = 90;

export function PdfReader({
  fileUrl,
  initialLocation,
  pageOffset,
  sizeBytes,
  onReady,
  onLocationChange,
}: {
  fileUrl: string;
  initialLocation: string | null;
  /**
   * How many PDF pages of front matter precede this book's printed page 1
   * (see lib/page-offset.ts). Affects only what a person reads and types:
   * `initialLocation`, `onLocationChange` and every ReaderHandle location
   * stay in PDF pages, so a stored place still resolves if an admin later
   * corrects the offset.
   */
  pageOffset: number;
  /**
   * The file's size, which decides how it is fetched: a book small enough to
   * hold is fetched whole, in one request a browser can cache and revalidate,
   * rather than in the byte ranges pdf.js would otherwise ask for and no
   * cache holds usefully. See shouldFetchWholeBook.
   */
  sizeBytes: number | null;
  onReady: (handle: ReaderHandle) => void;
  onLocationChange: (location: string, percent: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const docRef = useRef<PdfDocument | null>(null);
  // pdf.js throws RenderingCancelledException if a second render starts on the
  // same canvas before the first finishes, which page-flipping does routinely.
  const renderTaskRef = useRef<{ cancel: () => void } | null>(null);

  const [pageCount, setPageCount] = useState(0);
  const [page, setPage] = useState(() => {
    const parsed = Number(initialLocation);
    return Number.isFinite(parsed) && parsed >= 1 ? Math.floor(parsed) : 1;
  });
  const [scale, setScale] = useState(1.2);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // Read in an effect rather than during render: it comes from localStorage,
  // which the server doesn't have.
  const [swipeOn, setSwipeOn] = useState(true);
  // Whether the page is drawn wider than the space it sits in — i.e. whether
  // dragging sideways is panning rather than a spare gesture to turn pages.
  const [zoomedWide, setZoomedWide] = useState(false);
  const [drag, setDrag] = useState(0);

  const swipeTurnsPages = swipeOn && !zoomedWide;

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSwipeOn(readDeviceSettings().swipeToTurnPages);
  }, []);

  // --- Load the document ---------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    // Teardown belongs to the loading task, not the document proxy — the
    // proxy only exposes cleanup() (which frees page resources but leaves the
    // worker running). Destroying the task is what stops the worker and
    // aborts in-flight range requests.
    let loadingTask: { destroy: () => Promise<void> } | null = null;
    // Aborts a whole-book fetch that's still running when someone navigates
    // away, rather than letting tens of megabytes finish arriving for a
    // reader that has already gone.
    const fetching = new AbortController();

    (async () => {
      try {
        const pdfjs = await getPdfjs();

        // A book worth caching is fetched in one request and handed to pdf.js
        // as bytes. That one request is an ordinary GET the browser stores
        // and revalidates, so the second time someone opens the hymnal it
        // arrives from disk after a 304 instead of over the wire; the ranged
        // path below caches nothing of the sort. A failure here isn't fatal
        // — it falls through to letting pdf.js fetch the document itself.
        let data: Uint8Array | null = null;
        if (shouldFetchWholeBook(sizeBytes)) {
          try {
            const response = await fetch(fileUrl, {
              credentials: "same-origin",
              signal: fetching.signal,
            });
            if (response.ok) data = new Uint8Array(await response.arrayBuffer());
          } catch {
            // Offline, or the fetch was aborted; ask pdf.js to try its way.
          }
        }
        if (cancelled) return;

        const task = data
          ? pdfjs.getDocument({ data })
          : pdfjs.getDocument({ url: fileUrl, withCredentials: true });
        loadingTask = task;
        const doc = await task.promise;
        if (cancelled) {
          void task.destroy();
          return;
        }
        docRef.current = doc;
        setPageCount(doc.numPages);
        setLoading(false);
      } catch (err) {
        if (cancelled) return;
        setLoading(false);
        setError(err instanceof Error ? err.message : "This PDF could not be opened.");
      }
    })();

    return () => {
      cancelled = true;
      fetching.abort();
      renderTaskRef.current?.cancel();
      void loadingTask?.destroy();
      docRef.current = null;
    };
  }, [fileUrl, sizeBytes]);

  // --- Render the current page --------------------------------------------
  useEffect(() => {
    const doc = docRef.current;
    const canvas = canvasRef.current;
    if (!doc || !canvas || pageCount === 0) return;

    let cancelled = false;
    (async () => {
      try {
        const pdfPage = await doc.getPage(Math.min(page, doc.numPages));
        if (cancelled) return;

        // Rendering at devicePixelRatio and scaling back down with CSS keeps
        // text crisp on high-DPI screens instead of upscaling a 1x bitmap.
        const ratio = window.devicePixelRatio || 1;
        const viewport = pdfPage.getViewport({ scale: scale * ratio });
        const context = canvas.getContext("2d");
        if (!context) return;

        canvas.width = viewport.width;
        canvas.height = viewport.height;
        canvas.style.width = `${viewport.width / ratio}px`;
        canvas.style.height = `${viewport.height / ratio}px`;

        renderTaskRef.current?.cancel();
        const task = pdfPage.render({ canvas, canvasContext: context, viewport });
        renderTaskRef.current = task;
        await task.promise;
        if (cancelled) return;

        // Warms the pages either side. getPage parses the page and pulls
        // whatever of it isn't local yet, which is the slow half of a page
        // turn; pdf.js keeps what it has parsed, so the next swipe draws from
        // memory. Nothing is rendered here — a canvas is not touched — and a
        // failure is simply a page turn that costs what it used to.
        for (const neighbour of [page + 1, page - 1]) {
          if (neighbour >= 1 && neighbour <= doc.numPages) {
            void doc.getPage(neighbour).catch(() => {});
          }
        }
      } catch (err) {
        // A cancelled render is the expected outcome of flipping pages
        // quickly, not a failure worth showing anyone.
        if (!cancelled && !(err instanceof Error && err.name === "RenderingCancelledException")) {
          setError(err instanceof Error ? err.message : "This page could not be drawn.");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [page, scale, pageCount]);

  // --- Report position ------------------------------------------------------
  // onLocationChange and onReady below are useCallback-stabilized by the
  // parent, so listing them as dependencies doesn't re-fire these on every
  // render — which is why neither needs a ref to dodge the deps array.
  useEffect(() => {
    if (pageCount === 0) return;
    onLocationChange(String(page), (page / pageCount) * 100);
  }, [page, pageCount, onLocationChange]);

  const goToPage = useCallback((next: number) => {
    setPage((current) => {
      const doc = docRef.current;
      const max = doc?.numPages ?? current;
      return Math.min(Math.max(1, Math.floor(next)), max);
    });
  }, []);

  const nextPage = useCallback(() => {
    setPage((p) => Math.min(p + 1, docRef.current?.numPages ?? p));
  }, []);
  const previousPage = useCallback(() => setPage((p) => Math.max(1, p - 1)), []);

  // --- Turning the page: swipe and arrow keys ------------------------------
  // The gesture lives in a ref, not state: it is read inside touch handlers
  // that would otherwise close over a stale copy, and only its visual offset
  // needs to cause a render.
  const gestureRef = useRef<{ x: number; y: number; dx: number; turning: boolean } | null>(null);

  function onTouchStart(event: React.TouchEvent) {
    gestureRef.current = null;
    setDrag(0);
    if (!swipeTurnsPages || event.touches.length !== 1) return;
    const touch = event.touches[0];
    gestureRef.current = { x: touch.clientX, y: touch.clientY, dx: 0, turning: false };
  }

  function onTouchMove(event: React.TouchEvent) {
    const gesture = gestureRef.current;
    if (!gesture) return;
    // A second finger means a pinch-zoom, which is not a page turn.
    if (event.touches.length !== 1) {
      gestureRef.current = null;
      setDrag(0);
      return;
    }

    const dx = event.touches[0].clientX - gesture.x;
    const dy = event.touches[0].clientY - gesture.y;
    if (!gesture.turning) {
      if (Math.abs(dx) < SWIPE_AXIS_LOCK && Math.abs(dy) < SWIPE_AXIS_LOCK) return;
      // Committed to the other axis: this is a scroll, and it is left alone
      // for the rest of the touch.
      if (Math.abs(dy) >= Math.abs(dx)) {
        gestureRef.current = null;
        return;
      }
      gesture.turning = true;
    }

    gesture.dx = dx;
    const offset = Math.max(-SWIPE_DRAG_MAX, Math.min(SWIPE_DRAG_MAX, dx * SWIPE_DRAG_RATIO));
    setDrag(offset);
  }

  function onTouchEnd() {
    const gesture = gestureRef.current;
    gestureRef.current = null;
    setDrag(0);
    if (!gesture?.turning || Math.abs(gesture.dx) < SWIPE_DISTANCE) return;
    // Swiping left drags the current page away to the left, so the next one
    // arrives — the direction a paper book turns.
    if (gesture.dx < 0) nextPage();
    else previousPage();
  }

  useEffect(() => {
    if (!swipeOn) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
      // Never while someone is typing — the reader's own search box and page
      // box both live on this page.
      const target = event.target as HTMLElement | null;
      if (target?.isContentEditable) return;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;

      if (event.key === "ArrowRight" || event.key === "PageDown") {
        nextPage();
        event.preventDefault();
      } else if (event.key === "ArrowLeft" || event.key === "PageUp") {
        previousPage();
        event.preventDefault();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [swipeOn, nextPage, previousPage]);

  // Whether sideways dragging is needed to see the whole page. Measured after
  // each render of the page and on resize, because `touch-action` has to be
  // in the DOM before the finger lands — it can't be decided mid-gesture.
  useEffect(() => {
    function measure() {
      const container = scrollRef.current;
      const canvas = canvasRef.current;
      if (!container || !canvas) return;
      setZoomedWide(canvas.getBoundingClientRect().width > container.clientWidth);
    }
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [page, scale, pageCount]);

  // --- Expose TOC / search / text to the surrounding chrome ----------------
  useEffect(() => {
    if (pageCount === 0) return;

    async function loadToc(): Promise<TocEntry[]> {
      const doc = docRef.current;
      if (!doc) return [];
      const outline = await doc.getOutline();
      // An outline item's destination is a reference that has to be resolved
      // to a page index; a named destination needs one more hop first. Either
      // can fail on a malformed PDF, so each entry resolves independently and
      // a bad one is dropped rather than emptying the whole contents list —
      // see resolvePdfOutline, shared with the standalone book-contents view.
      return outline ? resolvePdfOutline(doc, outline) : [];
    }

    async function search(query: string): Promise<SearchHit[]> {
      const doc = docRef.current;
      if (!doc) return [];
      const hits: SearchHit[] = [];

      for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
        const content = await doc.getPage(pageNumber).then((p) => p.getTextContent());
        const text = content.items
          .map((item) => ("str" in item ? item.str : ""))
          .join(" ")
          .replace(/\s+/g, " ");

        for (const at of findMatches(text, query)) {
          const printed = printedPage(pageNumber, pageOffset);
          hits.push({
            // Labelled by the page printed in the book, falling back to the
            // PDF page (and saying so) for a hit in the front matter, which
            // has no printed number to quote.
            label: printed === null ? `PDF page ${pageNumber}` : `Page ${printed}`,
            excerpt: excerptAround(text, at, query.length),
            location: String(pageNumber),
          });
          // One hit per page is enough to navigate by, and it keeps a common
          // word from returning thousands of rows on a long book.
          break;
        }
      }
      return hits;
    }

    async function textAt(location: string): Promise<string> {
      const doc = docRef.current;
      if (!doc) return "";
      const pageNumber = Math.min(Math.max(1, Number(location) || 1), doc.numPages);
      const content = await doc.getPage(pageNumber).then((p) => p.getTextContent());
      return content.items.map((item) => ("str" in item ? item.str : "")).join(" ");
    }

    onReady({
      loadToc,
      search,
      textAt,
      goTo: (location) => goToPage(Number(location)),
      next: nextPage,
      previous: previousPage,
      currentLocation: () => String(page),
      advance: () => {
        const doc = docRef.current;
        if (!doc) return false;
        let moved = false;
        setPage((p) => {
          if (p >= doc.numPages) return p;
          moved = true;
          return p + 1;
        });
        return moved;
      },
      // A PDF location is already a number line: the page it names. An empty
      // or non-numeric location is one this reader never wrote.
      order: (locations) =>
        locations.map((location) => {
          if (location === null || location.trim() === "") return null;
          const parsed = Number(location);
          return Number.isFinite(parsed) ? parsed : null;
        }),
    });
  }, [pageCount, page, pageOffset, goToPage, nextPage, previousPage, onReady]);

  if (error) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-center text-sm text-red-600">
        {error}
      </div>
    );
  }

  // The page box counts in printed pages — the numbers on the paper, and the
  // ones the contents list and the search results quote. With no offset set
  // these are the PDF's own page numbers and the box is exactly what it has
  // always been; with one set, the PDF numbering is shown beside it so a
  // book can still be navigated by it, and a page of front matter (which has
  // no printed number) leaves the box empty rather than showing a zero.
  const shownPage = printedPage(page, pageOffset);
  const shownCount = printedPage(pageCount, pageOffset);

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center justify-center gap-2 border-b border-sep p-2 text-sm">
        <button
          onClick={previousPage}
          disabled={page <= 1}
          className="rounded-md border border-sep px-2 py-1 disabled:opacity-40"
        >
          ‹ Prev
        </button>
        <span className="tabular-nums text-sec">
          <input
            type="number"
            value={shownPage ?? ""}
            min={1}
            max={shownCount ?? 1}
            onChange={(e) => goToPage(pdfPageOf(Number(e.target.value), pageOffset))}
            aria-label="Page number"
            className="w-16 rounded border border-sep px-1 py-0.5 text-center"
          />{" "}
          / {shownCount ?? "—"}
        </span>
        {pageOffset !== 0 && (
          <span className="tabular-nums text-xs text-ter">
            PDF page {page} of {pageCount || "—"}
          </span>
        )}
        <button
          onClick={nextPage}
          disabled={pageCount === 0 || page >= pageCount}
          className="rounded-md border border-sep px-2 py-1 disabled:opacity-40"
        >
          Next ›
        </button>
        <span className="mx-2 text-ter">|</span>
        <button
          onClick={() => setScale((s) => Math.max(0.5, Number((s - 0.2).toFixed(1))))}
          className="rounded-md border border-sep px-2 py-1"
          aria-label="Zoom out"
        >
          −
        </button>
        <span className="w-12 text-center tabular-nums text-sec">{Math.round(scale * 100)}%</span>
        <button
          onClick={() => setScale((s) => Math.min(3, Number((s + 0.2).toFixed(1))))}
          className="rounded-md border border-sep px-2 py-1"
          aria-label="Zoom in"
        >
          +
        </button>
        <span className="mx-2 text-ter">|</span>
        <button
          onClick={() => {
            const next = !swipeOn;
            setSwipeOn(next);
            // Stored per device, alongside the other reading and playback
            // preferences, so a phone can turn pages by swipe while a shared
            // desktop doesn't.
            writeDeviceSettings({ swipeToTurnPages: next });
          }}
          aria-pressed={swipeOn}
          title="Turn pages by swiping left and right, or with the arrow keys"
          className={`rounded-md border border-sep px-2 py-1 ${swipeOn ? "bg-chip" : ""}`}
        >
          {swipeOn ? "Swipe on" : "Swipe off"}
        </button>
      </div>

      <div
        ref={scrollRef}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
        // pan-y keeps the browser's vertical scrolling while reserving
        // horizontal movement for the page turn, which is what stops a swipe
        // from also dragging the page sideways. Zoomed in past the width of
        // the screen, sideways movement is needed for panning and is handed
        // straight back — as it is when swiping is turned off.
        style={{ touchAction: swipeTurnsPages ? "pan-y" : "auto" }}
        className="flex-1 overflow-auto bg-chip p-4"
      >
        {loading && <p className="py-12 text-center text-sm text-sec">Opening…</p>}
        <div
          style={{
            transform: drag === 0 ? undefined : `translateX(${drag}px)`,
            transition: drag === 0 ? "transform 160ms ease-out" : undefined,
          }}
        >
          <canvas ref={canvasRef} className="mx-auto block shadow-lg" />
        </div>
      </div>
    </div>
  );
}
