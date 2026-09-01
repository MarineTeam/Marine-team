/**
 * A URL-safe slug from a title somebody typed.
 *
 * Used by the things a member reaches by name rather than by id — an event, a
 * form, a small group. Kept separate from the title so renaming "Mens
 * Breakfast" to "Men's Breakfast" doesn't break a link already printed on a
 * newsletter.
 */
export function slugify(value: string): string {
  return (
    value
      .normalize("NFKD")
      // Strip the marks NFKD just separated out, so "Café" becomes "cafe"
      // rather than losing the letter entirely.
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/['’]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80)
      .replace(/-+$/g, "")
  );
}

/**
 * `slugify`, then made unique against what is already taken.
 *
 * Appends -2, -3 … rather than a random suffix: a second "Men's Breakfast" is
 * almost always next year's, and `mens-breakfast-2` reads like one.
 * A title with nothing slug-able in it (only punctuation, only non-Latin
 * script) falls back to `fallback`, because an empty slug is a URL collision
 * waiting to happen rather than a 404.
 */
export function uniqueSlug(value: string, taken: Iterable<string>, fallback = "item"): string {
  const base = slugify(value) || fallback;
  const used = new Set(taken);
  if (!used.has(base)) return base;
  for (let n = 2; ; n += 1) {
    const candidate = `${base}-${n}`;
    if (!used.has(candidate)) return candidate;
  }
}
