import { readerFormat } from "@/lib/reader";
import type { BookCardData } from "@/components/book-card";

/**
 * Turning a hymnalStyle category's contents into book cards.
 *
 * A "book" is deliberately allowed to be any of three shapes, because all
 * three occur in a real library:
 *
 * - A **hymnPerFile series** is one book whose files are its individual
 *   hymns; its page lists them by printed page number, and each links to
 *   its own lyrics page.
 * - A **series holding one PDF** is that book — the PDF's own embedded
 *   bookmarks are its contents.
 * - A **series holding several PDFs** is a shelf of books, and its page
 *   grids them.
 * - A **PDF filed straight on the category** is a book too, named by its
 *   own title, with no badge to hang metadata on.
 *
 * Only the first needs declaring (see Series.hymnPerFile) — several files
 * in a series looks the same whether they're hymns or whole books. The
 * rest follow from what's there, so a library can be built carefully (a
 * named, badged series per book) or in bulk (drop the PDFs in).
 */

type FileLike = {
  id: string;
  title: string;
  mimeType: string | null;
  bunnyPath: string;
  memberOnly: boolean;
  /** Derived once by an admin; absent means the card works them out live instead. */
  coverDataUrl: string | null;
  hymnCount: number | null;
};

type SeriesLike = {
  slug: string;
  title: string;
  abbreviation: string | null;
  coverImageUrl: string | null;
  memberOnly: boolean;
  hymnPerFile: boolean;
  files: FileLike[];
};

/**
 * A hymn-per-file book's hymns in the order the book prints them: by page
 * number, with any hymn that has none kept in the order an admin arranged
 * them, at the end.
 *
 * Shared between the list on the book's page and the "next hymn" arrows on a
 * hymn's own page, so the two can't disagree about what comes next.
 * `pageNumber` is the number printed in the book and `position` is the
 * admin's drag order — related but not the same sequence, since printed
 * numbers skip.
 */
export function hymnReadingOrder<T extends { pageNumber: number | null }>(files: T[]): T[] {
  const numbered = files
    .filter((file) => file.pageNumber !== null)
    .sort((a, b) => a.pageNumber! - b.pageNumber!);
  return [...numbered, ...files.filter((file) => file.pageNumber === null)];
}

/**
 * A short token for "these hymns, as they read right now".
 *
 * A device holding a hymn-per-file book offline holds a copy of its lyrics,
 * and lyrics are corrected and added long after the rest of a book has
 * settled — so the device needs a way to ask whether what it has is still
 * what the book says, without downloading the whole thing to find out. This
 * is that answer: computed the same way on the server (for the current book)
 * and stored with the copy (for the saved one), and compared.
 *
 * FNV-1a rather than a real digest: this is a change detector, not a
 * security boundary, and it has to run synchronously in both places. It
 * covers everything that changes what someone reads — the hymns present,
 * their order, their numbers, their titles and their words.
 */
export function fingerprintHymns(
  hymns: { id: string; title: string; pageNumber: number | null; lyricsText: string }[],
): string {
  let hash = 0x811c9dc5;
  for (const hymn of hymns) {
    const line = `${hymn.id}|${hymn.pageNumber ?? ""}|${hymn.title}|${hymn.lyricsText}\n`;
    for (let i = 0; i < line.length; i++) {
      hash ^= line.charCodeAt(i);
      // The FNV prime, by shifts: a plain multiply overflows into a float and
      // stops being the same function.
      hash = (hash + ((hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24))) >>> 0;
    }
  }
  // The count travels with it so two books can't collide into looking
  // identical on a hash alone.
  return `${hymns.length}-${hash.toString(16)}`;
}

/** The PDFs among a set of files — the only kind of file that can be a book. */
export function pdfsOf<T extends { mimeType: string | null; bunnyPath: string }>(files: T[]): T[] {
  return files.filter((file) => readerFormat(file.mimeType, file.bunnyPath) === "pdf");
}

/** A bare PDF as a book card: titled by the file, with its hymn count read from its own bookmarks. */
export function fileBook(file: FileLike, isLoggedIn: boolean): BookCardData {
  const locked = file.memberOnly && !isLoggedIn;
  return {
    href: `/books/${file.id}`,
    title: file.title,
    badge: null,
    locked,
    coverImageUrl: null,
    coverDataUrl: file.coverDataUrl,
    // Skipped when locked: fetching the bytes to draw a cover would 403.
    coverFileId: locked ? null : file.id,
    subtitle: null,
    hymnCount: file.hymnCount,
  };
}

/** A series as a book card — one holding several whole-book PDFs is labelled as the shelf it is. */
export function seriesBook(series: SeriesLike, isLoggedIn: boolean): BookCardData {
  const locked = series.memberOnly && !isLoggedIn;
  const pdfs = pdfsOf(series.files);
  const shelf = !series.hymnPerFile && pdfs.length > 1;
  const cover = pdfs[0];
  const coverReadable = Boolean(cover) && !locked && !cover.memberOnly;

  // Counted here for the two shapes whose total is already known: a shelf's
  // books, and a hymn-per-file book's hymns. A single whole-book PDF leaves
  // this null so the card reads its count out of that PDF's own bookmarks.
  const subtitle = shelf
    ? `${pdfs.length} books`
    : series.hymnPerFile
      ? `${series.files.length} ${series.files.length === 1 ? "hymn" : "hymns"}`
      : null;

  return {
    href: `/series/${series.slug}`,
    title: series.title,
    badge: series.abbreviation,
    locked,
    coverImageUrl: series.coverImageUrl,
    coverDataUrl: cover?.coverDataUrl ?? null,
    coverFileId: coverReadable ? cover.id : null,
    subtitle,
    // Only meaningful for a single whole-book series, where `subtitle` is
    // null and the count is the book's own; a shelf and a hymn-per-file
    // book both already have their number.
    hymnCount: cover?.hymnCount ?? null,
  };
}
