import { readerFormat } from "@/lib/reader";
import type { BookCardData } from "@/components/book-card";

/**
 * Turning a hymnalStyle category's contents into book cards.
 *
 * A "book" is deliberately allowed to be either shape, because both occur:
 *
 * - A **series** holding one PDF is that book — it carries the name, badge
 *   and cover a book wants, and its page shows that PDF's contents.
 * - A **series holding several PDFs** is a shelf of books, and its page
 *   shows them as their own grid.
 * - A **PDF filed straight on the category** is a book too, named by its
 *   own title, with no badge to hang metadata on.
 *
 * That means a library can be set up carefully (a series per book, named
 * and badged) or in bulk (drop the PDFs in), and both browse the same way.
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

/** A series as a book card — one holding several PDFs is labelled as the shelf it is. */
export function seriesBook(series: SeriesLike, isLoggedIn: boolean): BookCardData {
  const locked = series.memberOnly && !isLoggedIn;
  const pdfs = pdfsOf(series.files);
  const shelf = pdfs.length > 1;
  const cover = pdfs[0];
  const coverReadable = Boolean(cover) && !locked && !cover.memberOnly;

  return {
    href: `/series/${series.slug}`,
    title: series.title,
    badge: series.abbreviation,
    locked,
    coverImageUrl: series.coverImageUrl,
    coverFileId: coverReadable ? cover.id : null,
    // A shelf counts its books here; a single-PDF book leaves this null so
    // the card reads the hymn count out of that PDF's bookmarks instead.
    subtitle: shelf ? `${pdfs.length} books` : null,
  };
}
