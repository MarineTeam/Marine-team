"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { excerptAround, findMatches } from "@/lib/reader";
import { getPdfjs, resolvePdfOutline } from "@/lib/pdf-client";
import { pdfPageOf, printedPage } from "@/lib/page-offset";
import type { ReaderHandle, SearchHit, TocEntry } from "@/components/reader-types";

/**
 * PDF half of the reader, using pdf.js — loaded on demand through
 * getPdfjs(), which also wires up the worker (see lib/pdf-client.ts for why
 * that import can't happen at module scope).
 */
type PdfDocument = PDFDocumentProxy;

export function PdfReader({
  fileUrl,
  initialLocation,
  pageOffset,
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
  onReady: (handle: ReaderHandle) => void;
  onLocationChange: (location: string, percent: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
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

  // --- Load the document ---------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    // Teardown belongs to the loading task, not the document proxy — the
    // proxy only exposes cleanup() (which frees page resources but leaves the
    // worker running). Destroying the task is what stops the worker and
    // aborts in-flight range requests.
    let loadingTask: { destroy: () => Promise<void> } | null = null;

    (async () => {
      try {
        const pdfjs = await getPdfjs();
        const task = pdfjs.getDocument({ url: fileUrl, withCredentials: true });
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
      renderTaskRef.current?.cancel();
      void loadingTask?.destroy();
      docRef.current = null;
    };
  }, [fileUrl]);

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
      next: () => setPage((p) => Math.min(p + 1, docRef.current?.numPages ?? p)),
      previous: () => setPage((p) => Math.max(1, p - 1)),
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
    });
  }, [pageCount, page, pageOffset, goToPage, onReady]);

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
          onClick={() => setPage((p) => Math.max(1, p - 1))}
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
          onClick={() => setPage((p) => Math.min(p + 1, pageCount))}
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
      </div>

      <div className="flex-1 overflow-auto bg-chip p-4">
        {loading && <p className="py-12 text-center text-sm text-sec">Opening…</p>}
        <canvas ref={canvasRef} className="mx-auto block shadow-lg" />
      </div>
    </div>
  );
}
