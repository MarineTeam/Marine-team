import { describe, expect, it } from "vitest";
import { slugify, uniqueSlug } from "./slug";

describe("slugify", () => {
  it("makes a title into a URL", () => {
    expect(slugify("Men's Breakfast")).toBe("mens-breakfast");
    expect(slugify("Carol Service — 24 December")).toBe("carol-service-24-december");
    expect(slugify("  Youth   Weekend  ")).toBe("youth-weekend");
  });

  it("keeps the letter when stripping its accent", () => {
    expect(slugify("Café Church")).toBe("cafe-church");
  });

  it("never ends in a dash, including after the length cap", () => {
    const long = slugify("a".repeat(78) + " and then some more words");
    expect(long.endsWith("-")).toBe(false);
    expect(long.length).toBeLessThanOrEqual(80);
  });

  it("gives nothing back for a title with nothing in it", () => {
    expect(slugify("!!!")).toBe("");
    expect(slugify("")).toBe("");
  });
});

describe("uniqueSlug", () => {
  it("leaves a free slug alone", () => {
    expect(uniqueSlug("Men's Breakfast", ["something-else"])).toBe("mens-breakfast");
  });

  it("counts up rather than randomising, so next year's reads like next year's", () => {
    expect(uniqueSlug("Men's Breakfast", ["mens-breakfast"])).toBe("mens-breakfast-2");
    expect(uniqueSlug("Men's Breakfast", ["mens-breakfast", "mens-breakfast-2"])).toBe(
      "mens-breakfast-3",
    );
  });

  it("falls back rather than returning an empty slug", () => {
    expect(uniqueSlug("!!!", [], "event")).toBe("event");
    expect(uniqueSlug("!!!", ["event"], "event")).toBe("event-2");
  });
});
