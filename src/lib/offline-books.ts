/**
 * Keeping a book on the device: the bytes in Cache Storage, and an index of
 * what's there.
 *
 * The sibling of lib/offline-downloads.ts, and deliberately a separate cache
 * and index rather than a shared one — a hymnal and a sermon video are saved
 * for different reasons, listed in different places, and removed
 * independently, and one wiping the other would be a nasty surprise.
 *
 * Cache Storage rather than IndexedDB for the same reason as video: the
 * service worker can answer for the file directly (see public/sw.js), which
 * is what lets the offline shell open a hymnal — and lets the in-app reader
 * keep working if the connection drops while it is open.
 *
 * Everything here is per device and unauthenticated: the server is never told
 * what has been saved.
 */

export const BOOK_CACHE = "marine-team-books-v1";
const INDEX_KEY = "marine-offline-books";
export const OFFLINE_BOOKS_CHANGED_EVENT = "marine-offline-books-change";

/**
 * The reader libraries, copied into `public/` at build time
 * (scripts/copy-offline-viewers.mjs) and saved into the book cache alongside
 * the first book that needs them — the offline shell is a static page with
 * no bundle, so a book without its library is a book it can't open.
 *
 * Per format on purpose: pdf.js is 1.7MB and a church whose library is all
 * EPUBs should never fetch it. epub.js's dist build is UMD and expects
 * `JSZip` as a global, so those two travel together.
 */
export const VIEWER_ASSETS: Record<OfflineBookFormat, string[]> = {
  pdf: ["/pdfjs/pdf.min.mjs", "/pdfjs/pdf.worker.min.mjs"],
  epub: ["/epubjs/jszip.min.js", "/epubjs/epub.min.js"],
};

/**
 * The two shapes a "book" comes in here, which is the same split the rest of
 * the app makes (see lib/hymnal.ts): one PDF holding the whole book, or a
 * series whose files *are* its hymns. They are saved differently — a file of
 * bytes against a list of lyrics — and read differently offline, but they are
 * one list to the person who saved them, so they share an index.
 */
export type OfflineBookKind = "file" | "hymnal";

/** Which reader opens a saved file, and so which library has to be there to do it. */
export type OfflineBookFormat = "pdf" | "epub";

/** One hymn of a hymn-per-file book, as it is stored for reading offline. */
export type OfflineHymn = {
  id: string;
  title: string;
  pageNumber: number | null;
  groupLabel: string | null;
  lyricsText: string;
};

export type OfflineBook = {
  /** "file": the book is one document. "hymnal": the book is a series of hymns. */
  kind: OfflineBookKind;
  /** Which reader opens it. Files only; a hymnal is lyrics and needs neither. */
  format?: OfflineBookFormat;
  /** The file's id for a document; the series' id for a hymn-per-file book. */
  id: string;
  /** The cache key the file is stored under; also what the offline shell opens. */
  cacheUrl: string;
  title: string;
  /**
   * The section this book belongs to (`/categories/hymnals`, `/series/gsfh1`)
   * and its name — where "back" goes in the app.
   */
  homeHref: string | null;
  homeLabel: string | null;
  /**
   * The nav category above that, when there is one. Between them these are
   * what let the offline shell answer a tap on the Hymnals icon with the
   * hymnals — it has no server to ask where a book lives, and a book filed
   * under a series still belongs to the section the icon names.
   */
  categoryHref: string | null;
  categoryLabel: string | null;
  /** PDF only: front matter, so the offline contents can quote printed page numbers. */
  pageOffset: number;
  /**
   * Files only: the file's recorded size — which is also the tag its cached
   * contents list is stored under (see lib/reader-cache.ts), so the offline
   * shell can tell whether that list still describes this book.
   */
  sizeBytes: number | null;
  /** Hymn-per-file only: how many hymns were actually stored. */
  hymnCount?: number;
  /**
   * What was saved, as the server described it at the time: a PDF's ETag, or
   * a hymnal's fingerprint (see lib/hymnal.ts). Compared against the server's
   * current answer to tell a copy that is still the book from one that is a
   * year out of date — see checkSavedBook. Absent when the server gave no
   * validator, in which case staleness simply isn't knowable.
   */
  version?: string | null;
  /** What was actually stored, which is what the "saved on this device" total counts. */
  bytes: number;
  savedAt: string;
};

/**
 * Books are keyed by id on our own origin, so the SW can recognise them by
 * path. The extension carries the format, which is what lets that same
 * handler answer with a type the browser understands.
 */
export function offlineBookUrl(fileId: string, format: OfflineBookFormat = "pdf"): string {
  return `/offline-book/${fileId}.${format}`;
}

/**
 * A hymn-per-file book is a list of hymns rather than a file, so what's
 * stored is the list itself — under its own path, for the same reason: the
 * service worker and the offline shell both find it by name.
 */
export function offlineHymnalUrl(seriesId: string): string {
  return `/offline-hymnal/${seriesId}.json`;
}

export function readOfflineBooks(): OfflineBook[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(INDEX_KEY) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item) => Boolean(item?.id && item?.cacheUrl))
      .map((item): OfflineBook => ({
        ...item,
        // Anything that isn't a hymnal is a document, whatever an older
        // version of this app called it.
        kind: item.kind === "hymnal" ? "hymnal" : "file",
        format: item.format === "epub" ? "epub" : "pdf",
      }));
  } catch {
    return [];
  }
}

function writeOfflineBooks(items: OfflineBook[]): void {
  try {
    window.localStorage.setItem(INDEX_KEY, JSON.stringify(items));
  } catch {
    // Storage full or blocked; the cached file itself is still usable this session.
  }
  window.dispatchEvent(new CustomEvent(OFFLINE_BOOKS_CHANGED_EVENT));
}

export function isBookSaved(id: string): boolean {
  return readOfflineBooks().some((item) => item.id === id);
}

/** Whether this browser can hold books at all — Cache Storage needs a secure context. */
export function offlineBooksSupported(): boolean {
  return typeof window !== "undefined" && "caches" in window && window.isSecureContext;
}

/**
 * Fetches a book through the app's own content route — so access is checked
 * exactly as it is for reading it — and stores the bytes under our cache key.
 *
 * Streamed through a reader rather than `cache.add()` so a 40MB hymnal has
 * something to show while it arrives. The bytes are handed back as well as
 * stored: the caller reads the book's contents straight out of them rather
 * than fetching the whole file a second time to do it.
 */
export async function saveBookOffline(
  meta: Omit<OfflineBook, "kind" | "cacheUrl" | "bytes" | "savedAt"> & { format: OfflineBookFormat },
  onProgress?: (fraction: number, bytes: number) => void,
  signal?: AbortSignal,
): Promise<{ entry: OfflineBook; data: Uint8Array }> {
  const cacheUrl = offlineBookUrl(meta.id, meta.format);
  const response = await fetch(`/api/files/${meta.id}/content`, {
    credentials: "same-origin",
    signal,
  });
  if (!response.ok || !response.body) {
    throw new Error(
      response.status === 403
        ? "You don't have access to this book."
        : "Couldn't fetch this book. Check your connection and try again.",
    );
  }

  const total = Number(response.headers.get("Content-Length") ?? meta.sizeBytes ?? 0);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.byteLength;
    onProgress?.(total ? received / total : 0, received);
  }

  const data = new Uint8Array(received);
  let at = 0;
  for (const chunk of chunks) {
    data.set(chunk, at);
    at += chunk.byteLength;
  }

  const version = response.headers.get("etag");
  const cache = await caches.open(BOOK_CACHE);
  await cache.put(
    cacheUrl,
    new Response(data, {
      headers: {
        // The reader's own type whatever the upload said, so a PDF still
        // opens in the browser's own viewer if the offline shell has to fall
        // back to it.
        "Content-Type": meta.format === "epub" ? "application/epub+zip" : "application/pdf",
        "Content-Length": String(data.byteLength),
        "Accept-Ranges": "bytes",
      },
    }),
  );
  // Best effort, and after the book itself: the shell can still hand a saved
  // PDF to the browser's own viewer without these.
  await cacheViewerAssets(meta.format);

  const entry: OfflineBook = {
    ...meta,
    kind: "file",
    cacheUrl,
    version,
    bytes: data.byteLength,
    savedAt: new Date().toISOString(),
  };
  writeOfflineBooks([entry, ...readOfflineBooks().filter((item) => item.id !== meta.id)]);
  return { entry, data };
}

/**
 * Keeps a hymn-per-file book on the device: its hymns, with the lyrics, as
 * one JSON document in the same cache the PDFs live in.
 *
 * There is no file to store for one of these — the "book" is a series, and
 * each hymn is a row with its own lyrics — so what is saved is the list the
 * server would have rendered. Hymns with no lyrics text are dropped rather
 * than saved as blank pages: offline they would be nothing at all, and the
 * count on the button says how many were actually kept.
 */
export async function saveHymnalOffline(
  meta: Omit<
    OfflineBook,
    "kind" | "cacheUrl" | "bytes" | "savedAt" | "hymnCount" | "pageOffset" | "sizeBytes" | "version"
  >,
  hymns: OfflineHymn[],
  fingerprint: string | null,
): Promise<OfflineBook> {
  const cacheUrl = offlineHymnalUrl(meta.id);
  const body = JSON.stringify({ id: meta.id, title: meta.title, hymns });

  const cache = await caches.open(BOOK_CACHE);
  await cache.put(
    cacheUrl,
    new Response(body, {
      headers: { "Content-Type": "application/json", "Content-Length": String(body.length) },
    }),
  );

  const entry: OfflineBook = {
    ...meta,
    kind: "hymnal",
    cacheUrl,
    pageOffset: 0,
    sizeBytes: null,
    hymnCount: hymns.length,
    version: fingerprint,
    bytes: body.length,
    savedAt: new Date().toISOString(),
  };
  writeOfflineBooks([entry, ...readOfflineBooks().filter((item) => item.id !== meta.id)]);
  return entry;
}

/**
 * Saves a PDF book and remembers its contents in one go.
 *
 * The two belong together: a book on the device with no contents list opens
 * at page one and can't be searched for a hymn, which is most of what having
 * it there is for. The contents are read out of the bytes just downloaded
 * rather than fetched again, and a book whose outline won't parse is still
 * kept — it just opens at the first page.
 */
export async function saveBookWithContents(
  meta: Omit<OfflineBook, "kind" | "cacheUrl" | "bytes" | "savedAt" | "version"> & {
    format: OfflineBookFormat;
  },
  onProgress?: (fraction: number, bytes: number) => void,
): Promise<OfflineBook> {
  const { entry, data } = await saveBookOffline(meta, onProgress);
  try {
    const { bookCacheTag, writeCachedToc } = await import("@/lib/reader-cache");
    // Each format's own parser, from the bytes already in hand.
    const entries =
      meta.format === "epub"
        ? await (await import("@/lib/epub-client")).loadEpubTocFromBytes(data)
        : await (await import("@/lib/pdf-client")).loadPdfOutlineFromBytes(data);
    writeCachedToc(meta.id, bookCacheTag({ sizeBytes: meta.sizeBytes }), entries);
  } catch {
    // See above: a book whose contents won't read is still worth having.
  }
  return entry;
}

/**
 * Puts pdf.js in the book cache, re-fetching it rather than taking whatever
 * the HTTP cache holds — this is the moment an upgraded copy should land, and
 * it happens once per save rather than once per page.
 */
export async function cacheViewerAssets(format: OfflineBookFormat): Promise<void> {
  try {
    const cache = await caches.open(BOOK_CACHE);
    await Promise.all(
      VIEWER_ASSETS[format].map(async (asset) => {
        const response = await fetch(asset, { cache: "reload" });
        if (response.ok) await cache.put(asset, response);
      }),
    );
  } catch {
    // Never deployed, or the network went away mid-save. The book itself is
    // already stored, and the shell falls back to the browser's PDF viewer.
  }
}

/**
 * Whether what this device is holding is still what the book says.
 *
 * - `current` — the copy matches the server's current version.
 * - `outdated` — the book has changed since it was saved.
 * - `unavailable` — it isn't there any more, or this account can no longer
 *   read it. Never acted on automatically: a saved book is removed by the
 *   person who saved it, not by a failed request.
 * - `unknown` — no connection, or nothing to compare (a copy saved before
 *   versions were recorded, or a file the CDN gives no validator for).
 *
 * A PDF is asked with a conditional request for a single byte: unchanged
 * comes back as a bodyless 304, changed as one byte and a new ETag, and
 * neither costs the megabytes the book actually is. A hymnal is asked for
 * its fingerprint alone (see the route's ?probe=1).
 */
export type SavedBookStatus = "current" | "outdated" | "unavailable" | "unknown";

export async function checkSavedBook(book: OfflineBook): Promise<SavedBookStatus> {
  try {
    if (book.kind === "hymnal") {
      const response = await fetch(`/api/offline/hymnal/${book.id}?probe=1`, {
        credentials: "same-origin",
        cache: "no-store",
      });
      if (response.status === 403 || response.status === 404) return "unavailable";
      if (!response.ok) return "unknown";
      const data = await response.json();
      if (!book.version || typeof data.fingerprint !== "string") return "unknown";
      return data.fingerprint === book.version ? "current" : "outdated";
    }

    const response = await fetch(`/api/files/${book.id}/content`, {
      credentials: "same-origin",
      cache: "no-store",
      headers: {
        // One byte, not the book: all that's wanted here is the validator
        // that comes back with it.
        Range: "bytes=0-0",
        ...(book.version ? { "If-None-Match": book.version } : {}),
      },
    });
    // Nothing was sent back, so there is nothing to release; every other
    // answer carries a byte or an error page that would otherwise be left
    // hanging on a slow connection.
    if (response.status !== 304) void response.body?.cancel();

    if (response.status === 304) return "current";
    if (response.status === 403 || response.status === 404) return "unavailable";
    if (!response.ok && response.status !== 206) return "unknown";
    const etag = response.headers.get("etag");
    if (!book.version || !etag) return "unknown";
    return etag === book.version ? "current" : "outdated";
  } catch {
    // Offline, which is not news about the book.
    return "unknown";
  }
}

export async function removeOfflineBook(id: string): Promise<void> {
  const saved = readOfflineBooks().find((item) => item.id === id);
  try {
    const cache = await caches.open(BOOK_CACHE);
    // By the stored key rather than a rebuilt one: neither a hymn-per-file
    // book nor an EPUB is at the path a PDF would be.
    await cache.delete(saved?.cacheUrl ?? offlineBookUrl(id));
  } catch {
    // Already gone, or storage cleared by the browser — the index entry below
    // goes either way, so the list doesn't offer a book that isn't there.
  }
  writeOfflineBooks(readOfflineBooks().filter((item) => item.id !== id));
}

export async function removeAllOfflineBooks(): Promise<void> {
  try {
    await caches.delete(BOOK_CACHE);
  } catch {
    // As above.
  }
  writeOfflineBooks([]);
}

/**
 * Drops index entries whose cached file has vanished — browsers evict caches
 * under storage pressure without telling the page, and an offline list
 * offering a book that isn't there is worse than a shorter list.
 */
export async function reconcileOfflineBooks(): Promise<OfflineBook[]> {
  const index = readOfflineBooks();
  if (index.length === 0 || !offlineBooksSupported()) return index;
  try {
    const cache = await caches.open(BOOK_CACHE);
    const present = await Promise.all(
      index.map(async (item) => ((await cache.match(item.cacheUrl)) ? item : null)),
    );
    const kept = present.filter((item): item is OfflineBook => item !== null);
    if (kept.length !== index.length) writeOfflineBooks(kept);
    return kept;
  } catch {
    return index;
  }
}
