"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { formatBytes } from "@/lib/offline-downloads";
import {
  checkSavedBook,
  OFFLINE_BOOKS_CHANGED_EVENT,
  offlineBooksSupported,
  reconcileOfflineBooks,
  removeAllOfflineBooks,
  removeOfflineBook,
  saveBookWithContents,
  type OfflineBook,
  type SavedBookStatus,
} from "@/lib/offline-books";

/**
 * The books this device is holding — the same list the offline shell shows,
 * rendered here so they can be managed from inside the app.
 *
 * Read from Cache Storage rather than from the server, which is never told
 * what has been saved. Reconciled on mount because browsers evict caches
 * under storage pressure without saying so, and each one is asked — cheaply,
 * a byte or a fingerprint — whether it is still the book it was when it was
 * saved. Nothing is removed on the strength of that answer: a book leaves
 * this device when the person holding it says so.
 */
export function OfflineBooksManager() {
  const [items, setItems] = useState<OfflineBook[]>([]);
  const [statuses, setStatuses] = useState<Record<string, SavedBookStatus>>({});
  const [updating, setUpdating] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const refresh = useCallback(async () => {
    const books = await reconcileOfflineBooks();
    setItems(books);
    const checked = await Promise.all(
      books.map(async (book) => [book.id, await checkSavedBook(book)] as const),
    );
    setStatuses(Object.fromEntries(checked));
  }, []);

  /**
   * Only PDFs update from here: a hymnal's own page has the button for it,
   * and re-fetching a book's lyrics needs the section context this list
   * doesn't carry.
   */
  async function update(book: OfflineBook) {
    setUpdating(book.id);
    try {
      await saveBookWithContents({
        id: book.id,
        title: book.title,
        format: book.format ?? "pdf",
        homeHref: book.homeHref,
        homeLabel: book.homeLabel,
        categoryHref: book.categoryHref,
        categoryLabel: book.categoryLabel,
        pageOffset: book.pageOffset,
        sizeBytes: book.sizeBytes,
      });
      setStatuses((current) => ({ ...current, [book.id]: "current" }));
    } catch {
      // Left as it was: the copy already on the device still opens.
    } finally {
      setUpdating(null);
    }
  }

  useEffect(() => {
    if (!offlineBooksSupported()) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setReady(true);
      return;
    }
    setReady(true);
    void refresh();
    window.addEventListener(OFFLINE_BOOKS_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(OFFLINE_BOOKS_CHANGED_EVENT, refresh);
  }, [refresh]);

  const total = items.reduce((sum, item) => sum + item.bytes, 0);

  return (
    <section className="space-y-3" aria-busy={!ready}>
      <div>
        <h3 className="text-sm font-medium">Books on this device</h3>
        <p className="text-xs text-sec">
          Saved with “Save for offline” on a book&apos;s page. These open with no connection — from the
          book&apos;s own icon in the bottom bar, or from the offline screen.
        </p>
      </div>

      {items.length === 0 ? (
        <p className="rounded-lg border border-dashed border-sep p-4 text-sm text-sec">
          No books saved here yet.
        </p>
      ) : (
        <>
          <ul className="divide-y divide-sep rounded-lg border border-sep text-sm">
            {items.map((book) => (
              <li key={book.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
                <div className="min-w-0 flex-1">
                  {/*
                    A hymn-per-file book has no page of its own — it *is* its
                    series — so each kind links back to where it was saved
                    from.
                  */}
                  <Link
                    href={book.kind === "hymnal" ? (book.homeHref ?? "/") : `/books/${book.id}`}
                    className="block truncate hover:underline"
                  >
                    {book.title}
                  </Link>
                  <p className="text-xs text-sec">
                    {[
                      book.homeLabel,
                      book.kind === "hymnal" && book.hymnCount ? `${book.hymnCount} hymns` : null,
                      formatBytes(book.bytes),
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  {statuses[book.id] === "outdated" && (
                    <p className="text-xs text-amber-700 dark:text-amber-400">
                      {book.kind === "hymnal"
                        ? "The hymns have changed since you saved this — update it from the book's page."
                        : "This book has been replaced since you saved it."}
                    </p>
                  )}
                  {statuses[book.id] === "unavailable" && (
                    <p className="text-xs text-sec">
                      Not available to this account any more; your saved copy still opens.
                    </p>
                  )}
                </div>
                {statuses[book.id] === "outdated" && book.kind === "file" && (
                  <button
                    onClick={() => void update(book)}
                    disabled={updating === book.id}
                    className="rounded-md btn-primary px-2 py-1 text-xs text-white disabled:opacity-60"
                  >
                    {updating === book.id ? "Updating…" : "Update"}
                  </button>
                )}
                <button
                  onClick={() => void removeOfflineBook(book.id)}
                  className="rounded-md border border-sep px-2 py-1 text-xs hover:bg-hover"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
          <div className="flex items-center gap-3 text-xs text-sec">
            <span>{formatBytes(total)} in books</span>
            <button
              onClick={() => void removeAllOfflineBooks()}
              className="rounded-md border border-sep px-2 py-1 hover:bg-hover"
            >
              Remove all books
            </button>
          </div>
        </>
      )}
    </section>
  );
}
