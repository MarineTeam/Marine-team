/**
 * The contract the surrounding reader chrome (contents, search, marks,
 * read-aloud) talks to, so it never needs to know whether a PDF or an EPUB
 * is underneath.
 *
 * Every `location` here is the same opaque string stored on ReadingProgress
 * and ReadingMark — a page number for PDF, a CFI for EPUB. Only the reader
 * that produced one ever parses it.
 */

export type TocEntry = {
  label: string;
  /** Null when a contents entry has no resolvable destination — shown, but not clickable. */
  location: string | null;
  /** Nesting level, 0 for top-level, used purely for indentation. */
  depth: number;
};

export type SearchHit = {
  /** Where the hit is, in human terms: "Page 12", or a chapter title. */
  label: string;
  excerpt: string;
  location: string;
};

export type ReaderHandle = {
  loadToc: () => Promise<TocEntry[]>;
  search: (query: string) => Promise<SearchHit[]>;
  /** Readable text at a location, for read-aloud. */
  textAt: (location: string) => Promise<string>;
  goTo: (location: string) => void;
  next: () => void;
  previous: () => void;
  currentLocation: () => string;
  /**
   * Moves forward one unit, returning whether it actually moved. Read-aloud
   * uses the return value to know it has reached the end of the book rather
   * than looping on the last page forever.
   */
  advance: () => boolean;
};
