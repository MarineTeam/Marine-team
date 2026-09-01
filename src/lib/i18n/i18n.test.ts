import { describe, expect, it } from "vitest";
import { CATALOGUES, format, LOCALES, LOCALE_NAMES, messagesFor, pickLocale } from "./index";
import { en } from "./en";
import { LANGUAGES } from "../device-settings";

/**
 * Completeness is the type-checker's job: a catalogue is typed as `Messages`,
 * so a missing or misspelled key doesn't compile.
 *
 * What it can't see is the subtler failure, which is what this file is for: a
 * translation that drops a `{placeholder}`. "Quedan {count} plazas" translated
 * as "Quedan plazas" compiles perfectly and loses the number on the page.
 */

const placeholders = (value: string) => [...value.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();

describe("the catalogues", () => {
  it("has more than one language to check", () => {
    expect(LOCALES.length).toBeGreaterThan(1);
  });

  it("names every language in its own language", () => {
    for (const locale of LOCALES) {
      expect(LOCALE_NAMES[locale]?.length ?? 0).toBeGreaterThan(0);
    }
  });

  it.each(LOCALES.filter((locale) => locale !== "en"))(
    "%s keeps every placeholder English has",
    (locale) => {
      const translated = messagesFor(locale) as Record<string, Record<string, string>>;
      const mismatches: string[] = [];

      for (const [section, strings] of Object.entries(en)) {
        for (const [key, value] of Object.entries(strings as Record<string, string>)) {
          const theirs = translated[section]?.[key] ?? "";
          const mine = placeholders(value);
          if (JSON.stringify(placeholders(theirs)) !== JSON.stringify(mine)) {
            mismatches.push(`${section}.${key}: expected ${JSON.stringify(mine)} in "${theirs}"`);
          }
        }
      }

      expect(mismatches).toEqual([]);
    },
  );

  it.each(LOCALES)("%s leaves no string empty", (locale) => {
    const empty: string[] = [];
    for (const [section, strings] of Object.entries(CATALOGUES[locale])) {
      for (const [key, value] of Object.entries(strings as Record<string, string>)) {
        if (!value.trim()) empty.push(`${section}.${key}`);
      }
    }
    expect(empty).toEqual([]);
  });
});

describe("format", () => {
  it("fills a placeholder in", () => {
    expect(format("Quedan {count} plazas", { count: 3 })).toBe("Quedan 3 plazas");
  });

  it("leaves an unknown one standing rather than writing 'undefined'", () => {
    // A visible {count} is a bug somebody reports. "undefined" is one they
    // screenshot.
    expect(format("Quedan {count} plazas", {})).toBe("Quedan {count} plazas");
  });

  it("fills every occurrence", () => {
    expect(format("{a} and {a} and {b}", { a: "x", b: "y" })).toBe("x and x and y");
  });
});

describe("pickLocale", () => {
  it("takes a language this app speaks", () => {
    expect(pickLocale("es")).toBe("es");
    expect(pickLocale("en")).toBe("en");
  });

  it("matches a regional variant to its base language", () => {
    expect(pickLocale("es-419")).toBe("es");
    expect(pickLocale("es-ES,es;q=0.9")).toBe("es");
  });

  it("honours the quality weights rather than the order", () => {
    expect(pickLocale("de;q=0.9,es;q=0.8")).toBe("es");
    expect(pickLocale("fr,es;q=0.5")).toBe("es");
  });

  it("falls back to English for a language it doesn't speak", () => {
    expect(pickLocale("de-DE,de;q=0.9")).toBe("en");
    expect(pickLocale("*")).toBe("en");
  });

  it("falls back for a missing or unreadable header", () => {
    expect(pickLocale(null)).toBe("en");
    expect(pickLocale("")).toBe("en");
    expect(pickLocale(";;;")).toBe("en");
  });

  it("still honours a language whose weight is malformed", () => {
    // The weight is broken; the request for Spanish isn't. Throwing the
    // language away over a typo in a parameter would be the worse reading.
    expect(pickLocale("es;q=notanumber")).toBe("es");
  });

  it("ignores a language the browser explicitly refused", () => {
    expect(pickLocale("es;q=0,de")).toBe("en");
  });
});

describe("the language list in device settings", () => {
  /**
   * `device-settings.ts` keeps its own copy of the language list, so that a
   * module every page imports to read a preference doesn't drag two message
   * catalogues along with it. Copies drift: a language added here and not
   * there would be offered by the switcher and then rejected as invalid by
   * the settings validator, which is a bug nobody would think to look for.
   */
  it("offers exactly the languages there are catalogues for", () => {
    expect(LANGUAGES.map((language) => language.code).sort()).toEqual([...LOCALES].sort());
  });

  it("labels each one the way the catalogue does", () => {
    for (const language of LANGUAGES) {
      expect(language.label).toBe(LOCALE_NAMES[language.code]);
    }
  });
});
