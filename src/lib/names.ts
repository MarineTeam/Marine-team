/**
 * Name handling.
 *
 * Names are user-visible strings that arrive from spreadsheets typed by
 * humans, so they are messy: stray spaces, inconsistent casing, accents,
 * curly apostrophes, zero-width characters. `normalizeName` folds all of that
 * into a single matching key while `toDisplayName` keeps a tidy, readable
 * spelling for the UI.
 *
 * Nothing in the app uses a name as a database key -- `normalizeName` only
 * produces the value stored in `Person.normalizedName`, which is a lookup
 * column, not a primary key.
 */

/** Characters that look like an apostrophe but are not U+0027. */
const APOSTROPHE_VARIANTS = /[\u2018\u2019\u02BC\u055A\uFF07]/g;
/** Characters that look like a hyphen but are not U+002D. */
const HYPHEN_VARIANTS = /[\u2010-\u2015\u2212\uFE58\uFE63\uFF0D]/g;
/** Invisible characters that survive copy/paste out of spreadsheets. */
const INVISIBLE = /[\u00AD\u200B-\u200D\u2060\uFEFF]/g;
/** Unicode combining marks, stripped after NFD decomposition. */
const COMBINING_MARKS = /[\u0300-\u036F]/g;
/** The curly apostrophe used when tidying a name for display. */
const DISPLAY_APOSTROPHE = "\u2019";

/**
 * Fold a raw name into its canonical matching key.
 *
 * "Devin", " devin ", "DEVIN" and "Dévin" all normalize to "devin".
 * Returns an empty string for input that contains no usable characters.
 */
export function normalizeName(raw: string): string {
  return raw
    .normalize("NFD")
    // Strip combining accent marks, so "José" matches "Jose".
    .replace(COMBINING_MARKS, "")
    .replace(INVISIBLE, "")
    .replace(APOSTROPHE_VARIANTS, "'")
    .replace(HYPHEN_VARIANTS, "-")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Clean a raw name for display without destroying the preferred spelling.
 *
 * Whitespace is collapsed and invisible characters removed, but casing and
 * accents are preserved: an admin who types "McDonald" or "José" keeps it.
 * A name that arrives in ALL CAPS or all lowercase is title-cased, since that
 * is almost always a spreadsheet artefact rather than a preference.
 */
export function toDisplayName(raw: string): string {
  const cleaned = raw
    .replace(INVISIBLE, "")
    // Every apostrophe variant, including the plain ASCII one, is shown as the
    // typographic form. Matching is unaffected: `normalizeName` folds them all
    // back to a single character.
    .replace(APOSTROPHE_VARIANTS, DISPLAY_APOSTROPHE)
    .replace(/'/g, DISPLAY_APOSTROPHE)
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) return "";

  const hasLowercase = /\p{Ll}/u.test(cleaned);
  const hasUppercase = /\p{Lu}/u.test(cleaned);
  if (hasLowercase && hasUppercase) return cleaned;

  return titleCase(cleaned);
}

function titleCase(value: string): string {
  return value.replace(/\p{L}[\p{L}\p{M}'\u2019-]*/gu, (word) => {
    // Preserve internal capitals after hyphens and apostrophes: "mary-jane"
    // becomes "Mary-Jane", "o'brien" becomes "O’Brien".
    // Lowercasing first is what turns a shouted "DEVIN" into "Devin"; without
    // it, title-casing an already-uppercase word is a no-op.
    return word
      .toLowerCase()
      .replace(
        /(^|[-\u2019'])(\p{L})/gu,
        (_match, boundary: string, letter: string) => boundary + letter.toUpperCase(),
      );
  });
}

/**
 * Split a cell containing several names into individual raw names.
 *
 * Accepts any mix of the delimiters given (default: comma, slash, ampersand,
 * semicolon, newline, and the word "and"). Blank fragments are dropped and
 * duplicates within the same cell are collapsed on their normalized form so
 * "Devin, devin" yields one person.
 */
export function splitNames(
  cell: string,
  separators: readonly string[] = [",", ";", "/", "&", "\n", "+"],
): string[] {
  if (!cell) return [];

  const escaped = separators
    .filter((separator) => separator.length > 0)
    .map((separator) => separator.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  // " and " is always treated as a separator; it is far more common as a
  // conjunction than as part of a name.
  escaped.push("\\band\\b");
  const pattern = new RegExp(escaped.join("|"), "gi");

  const seen = new Set<string>();
  const result: string[] = [];
  for (const fragment of cell.split(pattern)) {
    const display = toDisplayName(fragment ?? "");
    if (!display) continue;
    const key = normalizeName(display);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(display);
  }
  return result;
}

/** Guard against absurd input before it reaches the database. */
export const MAX_NAME_LENGTH = 120;

export function isPlausibleName(raw: string): boolean {
  const normalized = normalizeName(raw);
  if (!normalized || normalized.length > MAX_NAME_LENGTH) return false;
  // Must contain at least one letter; "-", "???" and "1" are not names.
  return /\p{L}/u.test(normalized);
}
