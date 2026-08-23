/**
 * Remembering a book's contents on the device that read them.
 *
 * Reading a PDF's contents is not cheap: pdf.js has to open the document and
 * then resolve every bookmark's destination to a page, which for a hymnal
 * with 900 hymns is 900 lookups into the page tree, each pulling bytes over
 * the wire. That happens on the book's contents page, again when the reader's
 * Contents panel is opened, and again on the next visit — for an answer that
 * only changes when the file itself is replaced.
 *
 * So it is kept twice: in memory for this page's lifetime, and in
 * localStorage for the next visit. Both are keyed by file id and tagged with
 * the file's size, so a book replaced with different bytes is read afresh
 * rather than showing the old book's hymn list; a fixed lifetime bounds
 * anything that tag can't catch.
 *
 * Nothing here is authoritative — every read can miss and every write can
 * fail (private-mode Safari throws on localStorage, and a quota can fill), so
 * every path falls back to simply reading the book again.
 */

import type { TocEntry } from "@/components/reader-types";

/** Bumping this invalidates every stored contents list, e.g. if TocEntry changes shape. */
const KEY_PREFIX = "marine-toc-v1:";

/** A month. Long enough to be worth having, short enough that nothing stale lives forever. */
export const TOC_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

type StoredToc = { tag: string; savedAt: number; entries: TocEntry[] };

/**
 * A short token identifying *these* bytes, so a re-uploaded book doesn't
 * serve the previous one's contents. Size is what's available on every row
 * that renders a book (FileAsset has no updatedAt), and two different scans
 * of the same hymnal agreeing to the byte is not a case worth engineering
 * for — the age limit above is the backstop.
 */
export function bookCacheTag(file: { sizeBytes: number | null }): string {
  return String(file.sizeBytes ?? 0);
}

export function serializeToc(entries: TocEntry[], tag: string, now = Date.now()): string {
  return JSON.stringify({ tag, savedAt: now, entries } satisfies StoredToc);
}

/**
 * Reads back what serializeToc wrote, or null for anything that can't be
 * trusted: junk, a different version of the file, or an entry that's too old.
 *
 * Deliberately paranoid about shape. This parses data written by a previous
 * (or future) version of the app, and a malformed entry rendered as a
 * contents row is a crash in the middle of a book — cheaper to re-read the
 * PDF than to guess.
 */
export function parseCachedToc(
  raw: string | null | undefined,
  tag: string,
  now = Date.now(),
): TocEntry[] | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const stored = parsed as Partial<StoredToc>;
  if (stored.tag !== tag) return null;
  if (typeof stored.savedAt !== "number" || !Number.isFinite(stored.savedAt)) return null;
  // Absolute difference, not just age: a device whose clock has been moved
  // backwards would otherwise hold an entry that never expires.
  if (Math.abs(now - stored.savedAt) > TOC_MAX_AGE_MS) return null;
  if (!Array.isArray(stored.entries)) return null;

  const entries: TocEntry[] = [];
  for (const entry of stored.entries) {
    if (!entry || typeof entry !== "object") return null;
    const { label, location, depth } = entry as TocEntry;
    if (typeof label !== "string") return null;
    if (location !== null && typeof location !== "string") return null;
    if (typeof depth !== "number" || !Number.isFinite(depth)) return null;
    entries.push({ label, location, depth });
  }
  return entries;
}

/** Survives a storage that's blocked or full, and answers before it's touched. */
const inMemory = new Map<string, { tag: string; entries: TocEntry[] }>();

/**
 * Loads in flight, so the reader's Contents panel and its hymn navigation
 * asking at the same moment open the document once rather than twice.
 */
const inFlight = new Map<string, Promise<TocEntry[]>>();

export function readCachedToc(fileId: string, tag: string): TocEntry[] | null {
  const remembered = inMemory.get(fileId);
  if (remembered && remembered.tag === tag) return remembered.entries;
  if (typeof window === "undefined") return null;

  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(KEY_PREFIX + fileId);
  } catch {
    return null;
  }
  const entries = parseCachedToc(raw, tag);
  if (entries) inMemory.set(fileId, { tag, entries });
  return entries;
}

export function writeCachedToc(fileId: string, tag: string, entries: TocEntry[]): void {
  inMemory.set(fileId, { tag, entries });
  if (typeof window === "undefined") return;

  const key = KEY_PREFIX + fileId;
  const value = serializeToc(entries, tag);
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Almost always the quota: a few large hymnals fill it between them.
    // Drop the other books rather than this one — it's the book being read
    // — and if that still isn't enough, this session's in-memory copy
    // carries it and the next visit reads the PDF again.
    try {
      for (const other of storedTocKeys()) {
        if (other !== key) window.localStorage.removeItem(other);
      }
      window.localStorage.setItem(key, value);
    } catch {
      // Storage is unusable here; nothing else to try.
    }
  }
}

function storedTocKeys(): string[] {
  const keys: string[] = [];
  for (let i = 0; i < window.localStorage.length; i++) {
    const key = window.localStorage.key(i);
    if (key?.startsWith(KEY_PREFIX)) keys.push(key);
  }
  return keys;
}

/**
 * The whole point of this module from a caller's side: the book's contents,
 * from wherever they're cheapest to get.
 *
 * An empty list is cached like any other answer — a PDF with no bookmarks
 * costs just as much to find that out from as one with 900.
 */
export async function loadCachedToc(
  fileId: string,
  tag: string,
  load: () => Promise<TocEntry[]>,
): Promise<TocEntry[]> {
  const cached = readCachedToc(fileId, tag);
  if (cached) return cached;

  const pending = inFlight.get(fileId);
  if (pending) return pending;

  const request = load()
    .then((entries) => {
      writeCachedToc(fileId, tag, entries);
      return entries;
    })
    .finally(() => {
      inFlight.delete(fileId);
    });
  inFlight.set(fileId, request);
  return request;
}
