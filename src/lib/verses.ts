/**
 * Splitting a hymn's lyrics into what gets put on the screen one at a time.
 *
 * Lyrics are typed by an admin into one text box, and the shape they are
 * typed in is the shape they are sung in: verses separated by a blank line, a
 * chorus among them marked as one. So a blank line is the split, and a block
 * whose first line names itself ("Chorus", "Refrain:") is that rather than a
 * numbered verse — which is what lets the numbering skip it, the way the
 * printed book does.
 *
 * Pure, and unaware of any screen: presenting is one caller, and read-aloud
 * or a lyrics sheet could be others.
 */

export type Verse = {
  /** 1, 2, 3… for verses; null for a chorus or anything else that names itself. */
  number: number | null;
  /** "Chorus", "Refrain" — as typed, minus a trailing colon. Null for a plain verse. */
  label: string | null;
  lines: string[];
};

/**
 * The words a block can use to say it isn't a verse. Deliberately short: a
 * misread heading turns into a missing verse number, so this only claims the
 * ones a hymnal actually prints.
 */
const NAMED_BLOCK = /^(chorus|refrain|bridge|coda|tag|antiphon)\b[.:]?\s*$/i;

export function splitVerses(lyricsText: string | null | undefined): Verse[] {
  if (!lyricsText?.trim()) return [];

  // Windows line endings arrive from pasted documents more often than not.
  const blocks = lyricsText
    .replace(/\r\n?/g, "\n")
    .split(/\n\s*\n/)
    .map((block) => block.replace(/\s+$/, ""))
    .filter((block) => block.trim().length > 0);

  let number = 0;
  return blocks.map((block) => {
    const lines = block.split("\n").filter((line) => line.trim().length > 0);
    const first = lines[0]?.trim() ?? "";

    if (NAMED_BLOCK.test(first)) {
      return {
        number: null,
        label: first.replace(/[.:]\s*$/, ""),
        // A heading on its own line is a heading; a chorus whose only line is
        // the word "Chorus" is nothing to sing, so what's left is what shows.
        lines: lines.slice(1),
      };
    }

    number += 1;
    return { number, label: null, lines };
  });
}

/** What to call a block on screen: "Chorus", or "Verse 3". */
export function verseHeading(verse: Verse): string {
  return verse.label ?? `Verse ${verse.number}`;
}
