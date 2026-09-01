import { describe, expect, it } from "vitest";
import { languageOf, shouldLabelLanguage } from "./content-language";

describe("languageOf", () => {
  it("takes the item's own tag", () => {
    expect(languageOf({ language: "es" })).toBe("es");
  });

  it("inherits the series' — a Spanish series' episodes are Spanish", () => {
    expect(languageOf({ language: null, series: { language: "es" } })).toBe("es");
  });

  it("lets an episode override its series", () => {
    expect(languageOf({ language: "en", series: { language: "es" } })).toBe("en");
  });

  it("treats unlabelled as the site's default, not as 'any'", () => {
    // Filing every unlabelled sermon under every language would make the
    // filter useless in exactly the church that needs it, where most of the
    // archive predates anybody thinking about this.
    expect(languageOf({ language: null })).toBe("en");
    expect(languageOf({ language: null, series: { language: null } })).toBe("en");
    expect(languageOf({ language: null }, "es")).toBe("es");
  });

  it("ignores a tag for a language the site doesn't speak", () => {
    expect(languageOf({ language: "kli" })).toBe("en");
  });
});

describe("shouldLabelLanguage", () => {
  it("marks the odd one out and stays quiet about the rest", () => {
    expect(shouldLabelLanguage("es", "en")).toBe(true);
    expect(shouldLabelLanguage("en", "en")).toBe(false);
  });
});
