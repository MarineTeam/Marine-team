"use client";

import type { NavItem } from "epubjs";
import type { TocEntry } from "@/components/reader-types";

/**
 * Reading an EPUB's contents without opening a reader.
 *
 * The counterpart of loadPdfOutlineFromBytes in lib/pdf-client.ts, and used
 * for the same reason: a book being saved to the device has its bytes in
 * hand, and its contents list has to be stored with it or there is no way to
 * find a hymn offline. epub.js takes an ArrayBuffer directly, so nothing is
 * fetched twice.
 *
 * Imported dynamically because epub.js reaches for browser globals at load
 * and has no business in a server render or in a bundle that never opens a
 * book — the same reason EpubReader imports it inside an effect.
 */
export async function loadEpubTocFromBytes(data: Uint8Array): Promise<TocEntry[]> {
  const ePub = (await import("epubjs")).default;
  // A copy, not a view: epub.js hands the buffer to JSZip, and `data` may be
  // a view onto a larger allocation whose extra bytes are not this book.
  const book = ePub(data.slice().buffer as ArrayBuffer);
  try {
    await book.ready;
    return flatten(book.navigation.toc, 0);
  } finally {
    try {
      book.destroy();
    } catch {
      // Already torn down.
    }
  }
}

/** Matches EpubReader.loadToc, so a cached list reads the same whoever wrote it. */
function flatten(items: NavItem[], depth: number): TocEntry[] {
  return items.flatMap((item) => [
    { label: item.label.trim(), location: item.href, depth },
    ...(item.subitems?.length ? flatten(item.subitems, depth + 1) : []),
  ]);
}
