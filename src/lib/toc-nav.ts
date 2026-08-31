/**
 * Stepping through a book's contents — "next hymn", "back one" — rather than
 * a page at a time.
 *
 * These work on positions, not locations. A PDF location is a page number and
 * an EPUB's is a CFI, and only the reader that produced one can order it; so
 * the reader maps both the contents entries and wherever it currently is onto
 * one comparable number line (ReaderHandle.order) and these helpers do the
 * rest. That keeps the ordering rules — the fiddly part — pure, testable and
 * out of both reader engines.
 *
 * A null position means "this reader couldn't place that", which happens for
 * real: a contents entry whose destination doesn't resolve, or a location in
 * a section the spine doesn't list. Those entries are skipped rather than
 * treated as position 0, which would drag them to the front of the book.
 */

/** A contents entry's place on the reader's number line, or null if unplaceable. */
export type TocPosition = number | null;

/**
 * Which entry the reader is inside: the last one starting at or before `at`.
 *
 * "Last" rather than "first" is what makes ties read correctly — two hymns
 * starting on the same page, or (in an EPUB) a whole section's worth of
 * entries mapping to the one spine item. The one further down is the one
 * being read.
 */
export function currentTocIndex(positions: TocPosition[], at: TocPosition): number | null {
  if (at === null) return null;
  let found: number | null = null;
  let best = -Infinity;
  for (let index = 0; index < positions.length; index++) {
    const position = positions[index];
    if (position === null || position > at) continue;
    if (position >= best) {
      best = position;
      found = index;
    }
  }
  return found;
}

/** The entry to jump forward to: the first one starting after `at`. */
export function nextTocIndex(positions: TocPosition[], at: TocPosition): number | null {
  if (at === null) return null;
  let found: number | null = null;
  let best = Infinity;
  for (let index = 0; index < positions.length; index++) {
    const position = positions[index];
    if (position === null || position <= at) continue;
    if (position < best) {
      best = position;
      found = index;
    }
  }
  return found;
}

/**
 * The entry to jump back to: the last one starting strictly before `at`.
 *
 * Strictly before is what gives this a music player's "previous track"
 * feel, and it falls out rather than being special-cased: paging into the
 * middle of a hymn and pressing back returns to that hymn's own first page,
 * and pressing it again from there goes to the hymn before it.
 */
export function previousTocIndex(positions: TocPosition[], at: TocPosition): number | null {
  if (at === null) return null;
  let found: number | null = null;
  let best = -Infinity;
  for (let index = 0; index < positions.length; index++) {
    const position = positions[index];
    if (position === null || position >= at) continue;
    if (position >= best) {
      best = position;
      found = index;
    }
  }
  return found;
}


/**
 * The hymn number a contents entry announces, if it announces one.
 *
 * This is the number that goes up on the board at the front of a service,
 * and the one somebody wants to type. It is *not* the page number: in most
 * hymnals the two differ, and in the ones where they agree the reader's page
 * box already gets you there.
 *
 * Only a number at the *start* of the label counts, with the words a
 * hymnal's own bookmarks put in front of one — "214", "1. Holy, Holy,
 * Holy", "Hymn 45 — Praise", "No. 12", "#7". A number anywhere else is part
 * of a title ("Psalm 23 of David" is a title; "All People That On Earth Do
 * Dwell 100" is a stray), and guessing at those would send someone to the
 * wrong hymn while looking like it worked.
 */
export function hymnNumberOf(label: string): number | null {
  const match = /^\s*(?:hymn|hymn\s+no\.?|no\.?|#)?\s*(\d{1,4})(?![\d])/i.exec(label);
  if (!match) return null;
  const number = Number(match[1]);
  return number >= 1 ? number : null;
}

/**
 * Which contents entry is that hymn, or null if the book doesn't list one.
 *
 * The first match wins: a book that numbers two entries the same (a hymn and
 * its descant, say) means the first, which is the one printed under that
 * number.
 */
export function findHymnIndex(entries: { label: string }[], hymnNumber: number): number | null {
  for (let index = 0; index < entries.length; index++) {
    if (hymnNumberOf(entries[index].label) === hymnNumber) return index;
  }
  return null;
}

/**
 * How many of a book's entries are numbered — what decides whether offering
 * a "hymn number" box makes any sense. A contents list of chapter titles has
 * nothing to type into it.
 */
export function countNumberedEntries(entries: { label: string }[]): number {
  return entries.reduce((count, entry) => count + (hymnNumberOf(entry.label) === null ? 0 : 1), 0);
}
