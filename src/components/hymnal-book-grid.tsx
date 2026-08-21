import Link from "next/link";
import { PdfCover } from "@/components/pdf-cover";

export type HymnalBook = {
  id: string;
  title: string;
  memberOnly: boolean;
};

/**
 * Grid of hymnal book covers for a hymnalStyle category or series — see
 * Category.hymnalStyle.
 *
 * One card per PDF: a hymnal book is a single PDF whose embedded bookmarks
 * are its table of contents (see BookContents), not a series of separate
 * per-hymn files. Covers are drawn from each PDF's own first page, so a
 * book needs nothing uploaded or typed beyond the PDF itself.
 */
export function HymnalBookGrid({ books, isLoggedIn }: { books: HymnalBook[]; isLoggedIn: boolean }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
      {books.map((book) => {
        // A locked book still links through — /books/[id] explains itself
        // and offers a login, the same way a locked series tile does. Its
        // cover is skipped rather than rendered, since fetching the bytes
        // would 403 anyway.
        const locked = book.memberOnly && !isLoggedIn;
        return (
          <Link key={book.id} href={`/books/${book.id}`} className="group flex flex-col gap-1.5">
            <div className="relative aspect-[3/4] w-full overflow-hidden rounded-lg bg-zinc-100 shadow-sm transition group-hover:-translate-y-0.5 group-hover:shadow-lg dark:bg-zinc-800">
              {/* Shows through until a cover has drawn, and stays put when
                  one can't be — a titled card is a fine cover on its own. */}
              <div className="flex h-full items-center justify-center p-3 text-center text-sm font-medium text-zinc-500 dark:text-zinc-400">
                {book.title}
              </div>
              {!locked && <PdfCover fileId={book.id} />}
              {locked && (
                <span className="absolute right-2 top-2 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">
                  Members
                </span>
              )}
            </div>
            <p className="truncate text-sm font-medium leading-snug group-hover:underline">
              {book.title}
            </p>
          </Link>
        );
      })}
    </div>
  );
}
