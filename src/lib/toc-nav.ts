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
