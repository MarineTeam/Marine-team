import { DEFAULT_LOCALE, isLocale, LOCALE_NAMES, type Locale } from "@/lib/i18n";

/**
 * What language a piece of content is in — a different question from what
 * language the app's screens are in.
 *
 * A member's setting changes the chrome. This says what a sermon was actually
 * preached in, so a Spanish-speaking congregation sharing one site with an
 * English one can find their own.
 *
 * Unlabelled means unlabelled, and is treated as the site's default rather
 * than as "any": filing every unlabelled sermon under every language would
 * make the filter useless in exactly the church that needs it, where most of
 * the archive predates anybody thinking about this.
 */

export type Tagged = { language: string | null };

/** A video's own answer, or the series' if it has none. */
export function languageOf(
  item: Tagged & { series?: Tagged | null },
  fallback: Locale = DEFAULT_LOCALE,
): Locale {
  const own = item.language;
  if (isLocale(own)) return own;
  const inherited = item.series?.language;
  // A Spanish series' episodes are Spanish, even the ones nobody tagged.
  if (isLocale(inherited)) return inherited;
  return fallback;
}

/**
 * Whether a badge saying which language this is in earns its place.
 *
 * Only when it differs from what the reader is browsing in — a shelf where
 * every item is labelled "English" to an English reader is noise, and the one
 * Spanish item among them is the thing worth marking.
 */
export function shouldLabelLanguage(itemLanguage: Locale, viewing: Locale): boolean {
  return itemLanguage !== viewing;
}

export function languageName(locale: Locale): string {
  return LOCALE_NAMES[locale];
}
