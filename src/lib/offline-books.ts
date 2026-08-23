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
 * pdf.js, copied into `public/pdfjs` at build time
 * (scripts/copy-offline-pdfjs.mjs). Saved into the book cache along with the
 * first book, so the offline shell has something to draw pages with; without
 * it that shell falls back to handing the file to the browser's own PDF
 * viewer.
 */
export const VIEWER_ASSETS = ["/pdfjs/pdf.min.mjs", "/pdfjs/pdf.worker.min.mjs"];

/**
 * The two shapes a "book" comes in here, which is the same split the rest of
 * the app makes (see lib/hymnal.ts): one PDF holding the whole book, or a
 * series whose files *are* its hymns. They are saved differently — a file of
 * bytes against a list of lyrics — and read differently offline, but they are
 * one list to the person who saved them, so they share an index.
 */
export type OfflineBookKind = "pdf" | "hymnal";

/** One hymn of a hymn-per-file book, as it is stored for reading offline. */
export type OfflineHymn = {
  id: string;
  title: string;
  pageNumber: number | null;
  groupLabel: string | null;
  lyricsText: string;
};

export type OfflineBook = {
  /** "pdf": the book is one file. "hymnal": the book is a series of hymns. */
  kind: OfflineBookKind;
  /** The file's id for a PDF; the series' id for a hymn-per-file book. */
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
   * PDF only: the file's recorded size — which is also the tag its cached
   * contents list is stored under (see lib/reader-cache.ts), so the offline
   * shell can tell whether that list still describes this book.
   */
  sizeBytes: number | null;
  /** Hymn-per-file only: how many hymns were actually stored. */
  hymnCount?: number;
  /** What was actually stored, which is what the "saved on this device" total counts. */
  bytes: number;
  savedAt: string;
};

/** Books are keyed by id on our own origin, so the SW can recognise them by path. */
export function offlineBookUrl(fileId: string): string {
  return `/offline-book/${fileId}.pdf`;
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
      // Everything without a kind predates hymn-per-file books being savable,
      // and every one of those was a PDF.
      .map((item): OfflineBook => ({ ...item, kind: item.kind === "hymnal" ? "hymnal" : "pdf" }));
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
  meta: Omit<OfflineBook, "kind" | "cacheUrl" | "bytes" | "savedAt">,
  onProgress?: (fraction: number, bytes: number) => void,
  signal?: AbortSignal,
): Promise<{ entry: OfflineBook; data: Uint8Array }> {
  const cacheUrl = offlineBookUrl(meta.id);
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

  const cache = await caches.open(BOOK_CACHE);
  await cache.put(
    cacheUrl,
    new Response(data, {
      headers: {
        // Typed as a PDF whatever the upload said, so the browser's own
        // viewer will render it if the offline shell has to fall back to it.
        "Content-Type": "application/pdf",
        "Content-Length": String(data.byteLength),
        "Accept-Ranges": "bytes",
      },
    }),
  );
  // Best effort, and after the book itself: the shell can still hand a saved
  // book to the browser's PDF viewer without these.
  await cacheViewerAssets();

  const entry: OfflineBook = {
    ...meta,
    kind: "pdf",
    cacheUrl,
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
  meta: Omit<OfflineBook, "kind" | "cacheUrl" | "bytes" | "savedAt" | "hymnCount" | "pageOffset" | "sizeBytes">,
  hymns: OfflineHymn[],
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
    bytes: body.length,
    savedAt: new Date().toISOString(),
  };
  writeOfflineBooks([entry, ...readOfflineBooks().filter((item) => item.id !== meta.id)]);
  return entry;
}

/**
 * Puts pdf.js in the book cache, re-fetching it rather than taking whatever
 * the HTTP cache holds — this is the moment an upgraded copy should land, and
 * it happens once per save rather than once per page.
 */
export async function cacheViewerAssets(): Promise<void> {
  try {
    const cache = await caches.open(BOOK_CACHE);
    await Promise.all(
      VIEWER_ASSETS.map(async (asset) => {
        const response = await fetch(asset, { cache: "reload" });
        if (response.ok) await cache.put(asset, response);
      }),
    );
  } catch {
    // Never deployed, or the network went away mid-save. The book itself is
    // already stored, and the shell falls back to the browser's PDF viewer.
  }
}

export async function removeOfflineBook(id: string): Promise<void> {
  const saved = readOfflineBooks().find((item) => item.id === id);
  try {
    const cache = await caches.open(BOOK_CACHE);
    // By the stored key rather than a rebuilt one: a hymn-per-file book is
    // not at the path a PDF would be.
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
