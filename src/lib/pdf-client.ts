"use client";

import type { PDFDocumentProxy } from "pdfjs-dist";
import type { TocEntry } from "@/components/reader-types";

type PdfOutlineItems = Awaited<ReturnType<PDFDocumentProxy["getOutline"]>>;

/**
 * pdf.js, loaded on demand with its worker wired up.
 *
 * The import is dynamic rather than at module scope: pdf.js is ~2MB and
 * reaches for browser globals on load, so a static import would both bloat
 * every bundle that touches this file and break server rendering. The
 * worker path is resolved through the bundler rather than hardcoded to a
 * public path, so it stays version-locked to the library and doesn't need
 * copying into /public on every upgrade.
 */
export async function getPdfjs() {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.mjs",
    import.meta.url,
  ).toString();
  return pdfjs;
}

/** The app's own URL for a file's bytes — never a direct CDN link; see the content route. */
export function fileContentUrl(fileId: string): string {
  return `/api/files/${fileId}/content`;
}

/**
 * Opens a book to read *about* it — a cover, a contents list — rather than
 * to read it.
 *
 * `disableAutoFetch` is the point. Left at its default, pdf.js keeps
 * streaming the rest of the document in the background once it has what was
 * asked for, which is right for a reader someone is paging through and
 * badly wrong for a grid of thumbnails: a dozen book cards would quietly
 * pull a dozen whole PDFs to show a dozen first pages. With it off, only
 * the byte ranges actually needed cross the wire, over the range requests
 * the content route already supports.
 */
export async function openPdfMetadataTask(fileUrl: string) {
  const pdfjs = await getPdfjs();
  return pdfjs.getDocument({ url: fileUrl, withCredentials: true, disableAutoFetch: true });
}

/**
 * Resolves a pdf.js outline (bookmarks) tree into a flat, depth-tagged list.
 * Shared by PdfReader's in-book Contents panel (which already has a loaded
 * document open) and loadPdfOutline below (which opens one just to read
 * this) — the destination-resolution logic is identical either way.
 */
export async function resolvePdfOutline(
  doc: PDFDocumentProxy,
  items: PdfOutlineItems,
  depth = 0,
): Promise<TocEntry[]> {
  const entries: TocEntry[] = [];
  for (const item of items ?? []) {
    let target: number | null = null;
    try {
      const dest = typeof item.dest === "string" ? await doc.getDestination(item.dest) : item.dest;
      const ref = Array.isArray(dest) ? dest[0] : null;
      if (ref && typeof ref === "object") target = (await doc.getPageIndex(ref)) + 1;
    } catch {
      target = null;
    }
    entries.push({ label: item.title, location: target === null ? null : String(target), depth });
    if (item.items?.length) entries.push(...(await resolvePdfOutline(doc, item.items, depth + 1)));
  }
  return entries;
}

/**
 * How many hymns a book's outline describes, counted straight off the raw
 * bookmark tree.
 *
 * Deliberately does not resolve destinations. A count needs only the shape
 * of the tree, and resolving is the expensive half: getPageIndex pulls
 * page-tree objects over the wire *per bookmark*, so a 94-hymn book would
 * fetch its way through the whole page tree to produce a number, then throw
 * every page number away. Counts leaves only, so section headings in a
 * nested outline aren't mistaken for hymns.
 */
export function countOutlineLeaves(items: PdfOutlineItems): number {
  let count = 0;
  for (const item of items ?? []) {
    count += item.items?.length ? countOutlineLeaves(item.items) : 1;
  }
  return count;
}

/**
 * Opens a PDF purely to read its embedded outline/bookmarks — its own
 * short-lived document instance, not shared with any open reader — for a
 * book's contents list shown before the full reader is opened.
 */
export async function loadPdfOutline(fileUrl: string): Promise<TocEntry[]> {
  // Teardown belongs to the loading task, not the document proxy — the
  // proxy only exposes cleanup() (frees page resources but leaves the
  // worker running). Destroying the task is what stops the worker and
  // aborts in-flight range requests — the same distinction PdfReader's own
  // load effect draws.
  const task = await openPdfMetadataTask(fileUrl);
  try {
    const doc = await task.promise;
    const outline = await doc.getOutline();
    // Awaited rather than returned as a pending promise: `finally` runs as
    // soon as the return is evaluated, so handing back an unsettled promise
    // would destroy the worker out from under resolvePdfOutline's own
    // getDestination/getPageIndex calls — which then never settle, hanging
    // the caller forever instead of failing.
    return outline ? await resolvePdfOutline(doc, outline) : [];
  } finally {
    void task.destroy();
  }
}
