"use client";

import type { PDFDocumentProxy } from "pdfjs-dist";
import type { TocEntry } from "@/components/reader-types";

type PdfOutlineItems = Awaited<ReturnType<PDFDocumentProxy["getOutline"]>>;

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
 * Opens a PDF purely to read its embedded outline/bookmarks — its own
 * short-lived document instance, not shared with any open reader — for a
 * book's contents list shown before the full reader is opened (e.g. a
 * hymnal book's table of contents). Client-only: pdf.js is dynamically
 * imported because it reaches for browser globals on load and would break
 * server rendering / bloat every bundle that touches this file otherwise
 * (see PdfReader's own note on the same import).
 */
export async function loadPdfOutline(fileUrl: string): Promise<TocEntry[]> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.mjs",
    import.meta.url,
  ).toString();

  // Teardown belongs to the loading task, not the document proxy — the
  // proxy only exposes cleanup() (frees page resources but leaves the
  // worker running). Destroying the task is what stops the worker and
  // aborts in-flight range requests — same distinction PdfReader's own
  // load effect draws.
  const task = pdfjs.getDocument({ url: fileUrl, withCredentials: true });
  try {
    const doc = await task.promise;
    const outline = await doc.getOutline();
    return outline ? resolvePdfOutline(doc, outline) : [];
  } finally {
    void task.destroy();
  }
}
