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
 * How many hymns a book's outline describes: its *leaf* entries that point
 * at a page. Counting every entry would inflate the total for a book whose
 * bookmarks nest hymns under topical sections, since those section headings
 * are entries too.
 */
export function countHymns(entries: TocEntry[]): number {
  return entries.filter((entry, i) => {
    if (!entry.location) return false;
    const next = entries[i + 1];
    return !next || next.depth <= entry.depth;
  }).length;
}

/**
 * Opens a PDF purely to read its embedded outline/bookmarks — its own
 * short-lived document instance, not shared with any open reader — for a
 * book's contents list shown before the full reader is opened.
 */
export async function loadPdfOutline(fileUrl: string): Promise<TocEntry[]> {
  const pdfjs = await getPdfjs();
  // Teardown belongs to the loading task, not the document proxy — the
  // proxy only exposes cleanup() (frees page resources but leaves the
  // worker running). Destroying the task is what stops the worker and
  // aborts in-flight range requests — the same distinction PdfReader's own
  // load effect draws.
  const task = pdfjs.getDocument({ url: fileUrl, withCredentials: true });
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
