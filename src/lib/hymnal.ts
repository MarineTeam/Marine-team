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
    // Skipped when locked: fetching the bytes to draw a cover would 403.
    coverFileId: locked ? null : file.id,
    subtitle: null,
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
    coverFileId: coverReadable ? cover.id : null,
    subtitle,
  };
}
