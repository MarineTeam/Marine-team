import { describe, expect, it } from "vitest";

import { isPlausibleName, normalizeName, splitNames, toDisplayName } from "./names";

/**
 * The requirement under test: "Devin", " devin " and "DEVIN" must not become
 * three different people -- while the preferred display spelling survives.
 */

describe("normalizeName", () => {
  it("folds the case and whitespace variants onto one key", () => {
    const key = normalizeName("Devin");
    expect(normalizeName(" devin ")).toBe(key);
    expect(normalizeName("DEVIN")).toBe(key);
    expect(normalizeName("  DeViN  ")).toBe(key);
    expect(normalizeName("Devin​")).toBe(key);
  });

  it("collapses internal whitespace", () => {
    expect(normalizeName("Mary   Jane")).toBe("mary jane");
    expect(normalizeName("Mary\tJane")).toBe("mary jane");
  });

  it("folds accents so Jose and José match", () => {
    expect(normalizeName("José")).toBe(normalizeName("Jose"));
  });

  it("normalizes typographic apostrophes and hyphens", () => {
    expect(normalizeName("O’Brien")).toBe(normalizeName("O'Brien"));
    expect(normalizeName("Mary‐Jane")).toBe(normalizeName("Mary-Jane"));
  });

  it("returns an empty string for input with nothing usable", () => {
    expect(normalizeName("")).toBe("");
    expect(normalizeName("   ")).toBe("");
  });

  it("keeps genuinely different people apart", () => {
    expect(normalizeName("Devin")).not.toBe(normalizeName("Devon"));
    expect(normalizeName("John")).not.toBe(normalizeName("Jon"));
  });
});

describe("toDisplayName", () => {
  it("preserves a deliberate mixed-case spelling", () => {
    expect(toDisplayName("McDonald")).toBe("McDonald");
    expect(toDisplayName("de Vries")).toBe("de Vries");
    expect(toDisplayName("José")).toBe("José");
  });

  it("title-cases spreadsheet artefacts", () => {
    expect(toDisplayName("DEVIN")).toBe("Devin");
    expect(toDisplayName("devin")).toBe("Devin");
    expect(toDisplayName("mary jane")).toBe("Mary Jane");
  });

  it("capitalizes after hyphens and apostrophes", () => {
    expect(toDisplayName("mary-jane")).toBe("Mary-Jane");
    expect(toDisplayName("o'brien")).toBe("O’Brien");
  });

  it("trims and collapses whitespace", () => {
    expect(toDisplayName("  Devin  ")).toBe("Devin");
    expect(toDisplayName("Mary   Jane")).toBe("Mary Jane");
  });

  it("returns an empty string for empty input", () => {
    expect(toDisplayName("   ")).toBe("");
  });
});

describe("splitNames", () => {
  it("splits on the common separators", () => {
    expect(splitNames("Devin, Cindy")).toEqual(["Devin", "Cindy"]);
    expect(splitNames("Devin & Cindy")).toEqual(["Devin", "Cindy"]);
    expect(splitNames("Devin / Cindy")).toEqual(["Devin", "Cindy"]);
    expect(splitNames("Devin; Cindy")).toEqual(["Devin", "Cindy"]);
    expect(splitNames("Devin and Cindy")).toEqual(["Devin", "Cindy"]);
  });

  it("handles a mix of separators", () => {
    expect(splitNames("Devin, Cindy & John")).toEqual(["Devin", "Cindy", "John"]);
  });

  it("drops blank fragments", () => {
    expect(splitNames("Devin,, ,Cindy")).toEqual(["Devin", "Cindy"]);
    expect(splitNames(",")).toEqual([]);
    expect(splitNames("")).toEqual([]);
  });

  it("deduplicates on the normalized form", () => {
    expect(splitNames("Devin, devin, DEVIN")).toEqual(["Devin"]);
  });

  it("respects a custom separator list", () => {
    expect(splitNames("Devin|Cindy", ["|"])).toEqual(["Devin", "Cindy"]);
    // A comma is not a separator here, so the whole cell is one name.
    expect(splitNames("Devin, Cindy", ["|"])).toEqual(["Devin, Cindy"]);
  });

  it("does not split a name that merely contains the letters and", () => {
    // "Andrew" starts with "and" but the separator is word-bounded.
    expect(splitNames("Andrew")).toEqual(["Andrew"]);
  });
});

describe("isPlausibleName", () => {
  it.each(["Devin", "Mary Jane", "O'Brien", "José"])("accepts %s", (name) => {
    expect(isPlausibleName(name)).toBe(true);
  });

  it.each(["", "   ", "42", "-", "???", "x".repeat(200)])("rejects %j", (name) => {
    expect(isPlausibleName(name)).toBe(false);
  });
});
