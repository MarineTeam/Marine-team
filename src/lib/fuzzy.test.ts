import { describe, expect, it } from "vitest";
import { levenshtein, fuzzyMatchScore } from "./fuzzy";

describe("levenshtein", () => {
  it("is 0 for identical strings, case-insensitively", () => {
    expect(levenshtein("Church", "church")).toBe(0);
  });

  it("counts a single substitution", () => {
    expect(levenshtein("chruch", "church")).toBe(2);
  });

  it("handles an empty string as the length of the other", () => {
    expect(levenshtein("", "abc")).toBe(3);
    expect(levenshtein("abc", "")).toBe(3);
  });
});

describe("fuzzyMatchScore", () => {
  it("scores 1 for an exact word match", () => {
    expect(fuzzyMatchScore("church", "Sunday Church Service")).toBe(1);
  });

  it("scores a near-miss typo highly without being exact", () => {
    const score = fuzzyMatchScore("chruch", "Sunday Church Service");
    expect(score).toBeGreaterThan(0.6);
    expect(score).toBeLessThan(1);
  });

  it("scores an unrelated query low", () => {
    expect(fuzzyMatchScore("xyzzy", "Sunday Church Service")).toBeLessThan(0.3);
  });

  it("returns 0 for an empty query or empty text", () => {
    expect(fuzzyMatchScore("", "Sunday Church Service")).toBe(0);
    expect(fuzzyMatchScore("church", "")).toBe(0);
  });
});
