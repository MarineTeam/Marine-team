import { en, type Messages } from "./en";
import { es } from "./es";

/**
 * The languages this app speaks.
 *
 * Adding one is adding a file and a line here — which is the right unit of
 * change, because a language is either translated or it isn't and a
 * half-filled catalogue would show English in the gaps. The `Messages` type
 * makes "half-filled" fail to compile.
 */
export const CATALOGUES = { en, es } satisfies Record<string, Messages>;

export const LOCALES = Object.keys(CATALOGUES) as Locale[];
export type Locale = keyof typeof CATALOGUES;
export const DEFAULT_LOCALE: Locale = "en";

/** What each language calls itself. A list of languages in English is no use. */
export const LOCALE_NAMES: Record<Locale, string> = {
  en: "English",
  es: "Español",
};

/** The cookie the server reads. See `locale.ts` for why this isn't only localStorage. */
export const LOCALE_COOKIE = "marine-locale";

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as string[]).includes(value);
}

export function messagesFor(locale: Locale): Messages {
  return CATALOGUES[locale] ?? CATALOGUES[DEFAULT_LOCALE];
}

/**
 * Fills `{placeholders}` in.
 *
 * Deliberately leaves an unknown placeholder standing rather than replacing it
 * with "undefined": a visible `{count}` on the page is a bug somebody reports,
 * and the word "undefined" is one they screenshot and laugh at.
 */
export function format(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (whole, key: string) =>
    key in values ? String(values[key]) : whole,
  );
}

/**
 * Picks a language from an `Accept-Language` header.
 *
 * Honours the quality weights, matches `es-419` and `es-ES` to `es`, and falls
 * back to English rather than to whatever came first — a browser asking for a
 * language this app doesn't speak should get the one it does, not an error.
 */
export function pickLocale(header: string | null | undefined): Locale {
  if (!header) return DEFAULT_LOCALE;

  const wanted = header
    .split(",")
    .map((part) => {
      const [tag, ...parameters] = part.trim().split(";");
      const quality = parameters
        .map((parameter) => /^\s*q=([\d.]+)\s*$/.exec(parameter))
        .find(Boolean);
      return { tag: tag.trim().toLowerCase(), q: quality ? Number(quality[1]) : 1 };
    })
    .filter((entry) => entry.tag && Number.isFinite(entry.q) && entry.q > 0)
    // A stable sort keeps equal weights in the order the browser listed them,
    // which is the order it means.
    .sort((a, b) => b.q - a.q);

  for (const { tag } of wanted) {
    if (tag === "*") return DEFAULT_LOCALE;
    const base = tag.split("-")[0];
    if (isLocale(tag)) return tag;
    if (isLocale(base)) return base;
  }
  return DEFAULT_LOCALE;
}

export type { Messages };
