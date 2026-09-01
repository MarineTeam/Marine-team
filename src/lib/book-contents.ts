/**
 * Reading a book's contents out of typed text.
 *
 * The indexing pass reads a PDF's embedded bookmarks, which is the right
 * answer when a book has them. Cheaply scanned hymnals frequently don't:
 * the file is six hundred images and nothing else, so the pass indexes it to
 * nothing and its whole section stays unsearchable. The contents *are* in the
 * book — printed on its first few pages — and typing them out is work
 * somebody can actually do, in an evening, once.
 *
 * So this parses what they type. It is deliberately forgiving about the shape
 * of a line and strict about what it can't read: a line it doesn't understand
 * is reported with its number rather than dropped, because a silently missing
 * hymn is exactly the failure this feature exists to fix.
 *
 * Pages typed here are the ones **printed in the book**, since that is what
 * the person is copying from — the contents page in front of them. They're
 * converted to PDF pages on the way in and back on the way out (see
 * lib/page-offset.ts), so what is stored matches what the bookmark-reading
 * pass stores and an offset corrected later moves both alike.
 */
import { pdfPageOf, printedPage } from "./page-offset";

/** One entry ready for the API: `page` is a PDF page, like everything stored. */
export type ContentsDraft = {
  title: string;
  page: number;
  depth: number;
};

export type ContentsProblem = {
  /** 1-based, counting every line of the box including blank ones, so it points at what the typist sees. */
  line: number;
  raw: string;
  reason: string;
};

/**
 * A page written as `pdf:2` is that PDF page, not a printed one.
 *
 * Front matter has no printed number (see printedPage), so an entry in it —
 * a preface, a note on the tunes — has nothing this could round-trip through.
 * Rather than lose those entries whenever an indexed book is opened in the
 * editor and saved again, they are written in the one numbering that can
 * express them, marked so it's clear which is meant.
 */
const PDF_PAGE = /^pdf:(\d{1,5})$/i;

/**
 * How far a line is indented, in levels of two spaces.
 *
 * Nesting is what tells a section heading from the hymns under it, and a
 * book indexed from its bookmarks already has it. Without a way to write
 * that down, opening such a book in the editor and saving it back would
 * flatten the outline — a silent loss from an edit that looked like it only
 * touched one line. A leading tab counts as one level, since that is what
 * pressing Tab in the box produces.
 */
function depthOf(raw: string): number {
  const indent = /^[ \t]*/.exec(raw)?.[0] ?? "";
  const spaces = indent.replace(/\t/g, "  ").length;
  return Math.min(20, Math.floor(spaces / 2));
}

/**
 * Splits a line into its label and its page.
 *
 * A tab or a pipe wins when there is one: that is an explicit separator, and
 * a paste out of a spreadsheet is tab-separated. Otherwise the trailing
 * number is the page, which is how a contents page reads — "214 Amazing
 * Grace 230" — and it has to be trailing, so the 214 at the front stays part
 * of the label where hymnNumberOf can find it.
 */
function splitLine(raw: string): { label: string; page: string } | null {
  const line = raw.trim();
  const separator = Math.max(line.lastIndexOf("\t"), line.lastIndexOf("|"));
  if (separator >= 0) {
    return { label: line.slice(0, separator).trim(), page: line.slice(separator + 1).trim() };
  }
  const trailing = /^(.*?)\s+(pdf:\d{1,5}|\d{1,5})$/i.exec(line);
  if (!trailing) return null;
  return { label: trailing[1].trim(), page: trailing[2].trim() };
}

export function parseContentsText(
  text: string,
  offset: number,
): { entries: ContentsDraft[]; problems: ContentsProblem[] } {
  const entries: ContentsDraft[] = [];
  const problems: ContentsProblem[] = [];

  text.split("\n").forEach((raw, index) => {
    const line = index + 1;
    if (!raw.trim()) return;

    const parts = splitLine(raw);
    if (!parts) {
      problems.push({ line, raw: raw.trim(), reason: "No page number at the end of the line" });
      return;
    }
    if (!parts.label) {
      problems.push({ line, raw: raw.trim(), reason: "A page with nothing to call it" });
      return;
    }

    const asPdfPage = PDF_PAGE.exec(parts.page);
    const typed = Number(asPdfPage ? asPdfPage[1] : parts.page);
    if (!Number.isInteger(typed) || typed < 1) {
      problems.push({ line, raw: raw.trim(), reason: `“${parts.page}” isn't a page number` });
      return;
    }

    const page = asPdfPage ? typed : pdfPageOf(typed, offset);
    // Only reachable by typing a printed page under a book's own offset —
    // page 3 of a book whose first ten pages are front matter is a
    // contradiction, and quietly storing PDF page 13 would put the hymn
    // somewhere nobody asked for.
    if (page < 1) {
      problems.push({ line, raw: raw.trim(), reason: `Page ${typed} is in front of this book's page 1` });
      return;
    }

    entries.push({ title: parts.label, page, depth: depthOf(raw) });
  });

  return { entries, problems };
}

/**
 * The text a set of stored entries reads as — what fills the box when an
 * already-indexed book is opened for editing.
 *
 * Round-trips through parseContentsText exactly, including front matter,
 * which is what makes it safe to open a book indexed from its bookmarks,
 * correct one line, and save the lot back.
 */
export function formatContentsText(
  entries: { title: string; page: number; depth?: number }[],
  offset: number,
): string {
  return entries
    .map((entry) => {
      const printed = printedPage(entry.page, offset);
      const page = printed === null ? `pdf:${entry.page}` : printed;
      return `${"  ".repeat(entry.depth ?? 0)}${entry.title} | ${page}`;
    })
    .join("\n");
}
