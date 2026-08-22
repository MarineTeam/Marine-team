/**
 * Printed page numbers vs PDF page numbers.
 *
 * A book's contents list is built from its PDF's embedded bookmarks, whose
 * destinations resolve to PDF pages — and a scanned hymnal opens with a
 * title page, a preface and ten pages of table of contents before printed
 * page 1, so the hymn printed on page 45 is the PDF's page 55. Listing it
 * as 55 makes the app disagree with the paper copy in someone's hands.
 *
 * `offset` (FileAsset.pageOffset) is how many PDF pages precede printed
 * page 1. Everything *stored* stays in PDF pages — ReadingProgress.location,
 * a ?page= link, a resolved bookmark destination — because that is the only
 * numbering pdf.js knows and the only one that survives an admin later
 * correcting the offset. These two convert at the edge, where a number is
 * shown to or typed by a person, and are exact inverses so a round trip
 * through the reader's page box lands back where it started.
 */

/**
 * What is printed on a given PDF page, or null for a page in front of
 * printed page 1.
 *
 * Front matter genuinely has no arabic page number — it is unnumbered, or
 * numbered in romans this makes no attempt to reconstruct — so callers show
 * nothing there rather than a zero or a negative number that looks like a
 * bug.
 */
export function printedPage(pdfPage: number, offset: number): number | null {
  const printed = pdfPage - offset;
  return printed >= 1 ? printed : null;
}

/**
 * Which PDF page carries a given printed page.
 *
 * Deliberately unclamped: this backs a number input someone is still
 * typing into, where an out-of-range intermediate value is normal, and the
 * reader already clamps every jump to the document's real bounds. Its only
 * job is to keep the sign of the offset in one place rather than spelling
 * out `+ offset` at each call site and eventually getting one backwards.
 */
export function pdfPageOf(printedPage: number, offset: number): number {
  return printedPage + offset;
}
