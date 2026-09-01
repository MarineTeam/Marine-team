"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

type Hymn = {
  id: string;
  title: string;
  number: number | null;
  printedPage: number | null;
  href: string;
  bookId: string;
  bookTitle: string;
  /** The line that matched, when the hymn was found by its words. */
  excerpt: string | null;
};

/**
 * One box that searches every book in a section.
 *
 * The hymns of a scanned hymnal live in its PDF's bookmarks, so this can only
 * answer for books whose contents an admin has indexed (see the file list's
 * indexing pass) — which is why it says so plainly when a section has none
 * rather than looking broken. A hymn whose words have been typed is also
 * found by a line of them, which is how somebody who remembers the tune but
 * not the title gets there.
 *
 * Searching as you type, debounced: a hymn gets looked up mid-sentence, and
 * the answer should arrive while the sentence is still going.
 */
export function HymnalSearch({
  categoryId,
  indexed,
  bookCount,
}: {
  categoryId: string;
  /** Whether any book in this section has had its contents read yet. */
  indexed: boolean;
  bookCount: number;
}) {
  const [query, setQuery] = useState("");
  const [hymns, setHymns] = useState<Hymn[] | null>(null);
  const [searching, setSearching] = useState(false);
  // Only the newest answer is allowed to land: typing "It Is" fires three
  // searches, and the first to come back is not the one that was asked.
  const latest = useRef(0);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setHymns(null);
      setSearching(false);
      return;
    }
    setSearching(true);
    const ticket = ++latest.current;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/hymnals/search?category=${encodeURIComponent(categoryId)}&q=${encodeURIComponent(q)}`,
        );
        const data = await res.json().catch(() => ({}));
        if (ticket !== latest.current) return;
        setHymns(Array.isArray(data.hymns) ? data.hymns : []);
      } catch {
        if (ticket === latest.current) setHymns([]);
      } finally {
        if (ticket === latest.current) setSearching(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [query, categoryId]);

  if (!indexed) return null;

  return (
    <div className="space-y-2">
      <label htmlFor="hymnal-search" className="sr-only">
        Find a hymn in these books
      </label>
      <input
        id="hymnal-search"
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={
          bookCount === 1
            ? "Find a hymn — by name, number or a line of it"
            : `Find a hymn across ${bookCount} books`
        }
        className="w-full rounded-md border border-sep px-3 py-2 text-sm"
      />

      {hymns !== null && (
        <div className="rounded-lg border border-sep">
          {hymns.length === 0 ? (
            <p className="px-3 py-3 text-sm text-sec">
              {searching ? "Searching…" : `Nothing matching “${query.trim()}” in these books.`}
            </p>
          ) : (
            <ul className="divide-y divide-sep">
              {hymns.map((hymn) => (
                <li key={hymn.id}>
                  <Link href={hymn.href} className="flex items-center gap-3 px-3 py-2.5 hover:bg-hover">
                    {/* The number on the board where the book prints one,
                        falling back to the page it is on. */}
                    <span className="w-10 shrink-0 text-right text-sm tabular-nums text-ter">
                      {hymn.number ?? hymn.printedPage ?? ""}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">{hymn.title}</span>
                      <span className="block truncate text-xs text-sec">{hymn.bookTitle}</span>
                      {/* Kept below the book rather than instead of it: with
                          six hymnals on the shelf, which one this is in is
                          part of the answer. */}
                      {hymn.excerpt && (
                        <span className="block truncate text-xs italic text-ter">{hymn.excerpt}</span>
                      )}
                    </span>
                    <span aria-hidden className="shrink-0 text-ter">
                      →
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
