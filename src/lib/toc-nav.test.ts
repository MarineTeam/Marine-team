import { describe, expect, it } from "vitest";
import {
  countNumberedEntries,
  currentTocIndex,
  findHymnIndex,
  hymnNumberOf,
  nextTocIndex,
  previousTocIndex,
} from "./toc-nav";

// A small hymnal's worth of contents, as the reader would map them: a
// heading at the front, then hymns at the pages they start on.
const hymnal = [1, 5, 9, 9, 14];

describe("currentTocIndex", () => {
  it("finds the entry a page falls inside, not the next one", () => {
    expect(currentTocIndex(hymnal, 6)).toBe(1);
    expect(currentTocIndex(hymnal, 5)).toBe(1);
  });

  it("prefers the later of two entries starting in the same place", () => {
    // Two hymns on page 9: the one being read is the second.
    expect(currentTocIndex(hymnal, 9)).toBe(3);
  });

  it("has no answer before the first entry", () => {
    expect(currentTocIndex([4, 8], 2)).toBeNull();
  });

  it("skips entries it can't place rather than putting them at the front", () => {
    expect(currentTocIndex([null, 3, null], 4)).toBe(1);
    expect(currentTocIndex([null, null], 4)).toBeNull();
  });

  it("has no answer when the reader itself can't be placed", () => {
    expect(currentTocIndex(hymnal, null)).toBeNull();
  });
});

describe("nextTocIndex", () => {
  it("moves to the first entry after here", () => {
    expect(nextTocIndex(hymnal, 6)).toBe(2);
    expect(nextTocIndex(hymnal, 1)).toBe(1);
  });

  it("steps past every entry sharing this position, so it always moves", () => {
    expect(nextTocIndex(hymnal, 9)).toBe(4);
  });

  it("stops at the last entry", () => {
    expect(nextTocIndex(hymnal, 14)).toBeNull();
    expect(nextTocIndex(hymnal, 200)).toBeNull();
  });

  it("orders by position, not by the order entries are listed in", () => {
    // A PDF outline is not obliged to list its bookmarks in page order.
    expect(nextTocIndex([10, 2, 6], 3)).toBe(2);
  });
});

describe("previousTocIndex", () => {
  it("goes back to the start of the entry being read, the way a track skip does", () => {
    // Page 6 is inside the hymn that starts on 5: back goes to its own start.
    expect(previousTocIndex(hymnal, 6)).toBe(1);
    // From that start, back again is the hymn before it.
    expect(previousTocIndex(hymnal, 5)).toBe(0);
  });

  it("prefers the later of two entries starting in the same place", () => {
    expect(previousTocIndex(hymnal, 14)).toBe(3);
  });

  it("stops at the first entry", () => {
    expect(previousTocIndex(hymnal, 1)).toBeNull();
  });

  it("skips entries it can't place", () => {
    expect(previousTocIndex([null, 3, null], 8)).toBe(1);
  });
});

describe("hymnNumberOf", () => {
  it("reads the number a hymnal's own bookmarks put in front", () => {
    expect(hymnNumberOf("214")).toBe(214);
    expect(hymnNumberOf("1. Holy, Holy, Holy")).toBe(1);
    expect(hymnNumberOf("  12  Rock of Ages")).toBe(12);
    expect(hymnNumberOf("Hymn 45 — Praise")).toBe(45);
    expect(hymnNumberOf("No. 12 Rock of Ages")).toBe(12);
    expect(hymnNumberOf("no 12 Rock of Ages")).toBe(12);
    expect(hymnNumberOf("#7 Abide With Me")).toBe(7);
    expect(hymnNumberOf("007 Abide With Me")).toBe(7);
  });

  it("ignores a number that is part of the title rather than in front of it", () => {
    // The one that matters: sending someone to hymn 100 because the title
    // ends in a number would look like it worked.
    expect(hymnNumberOf("All People That On Earth Do Dwell 100")).toBeNull();
    expect(hymnNumberOf("Praise")).toBeNull();
    expect(hymnNumberOf("")).toBeNull();
  });

  it("takes the whole number, not the first digit of it", () => {
    expect(hymnNumberOf("214. Amazing Grace")).toBe(214);
    expect(hymnNumberOf("1234 Something")).toBe(1234);
  });

  it("refuses a zero, which no hymnal prints", () => {
    expect(hymnNumberOf("0. Nothing")).toBeNull();
  });
});

describe("findHymnIndex", () => {
  const toc = [
    { label: "Praise" },
    { label: "1. Holy, Holy, Holy" },
    { label: "12 Rock of Ages" },
    { label: "12 Rock of Ages (descant)" },
  ];

  it("finds the entry printed under that number", () => {
    expect(findHymnIndex(toc, 1)).toBe(1);
    expect(findHymnIndex(toc, 12)).toBe(2);
  });

  it("has no answer for a number the book doesn't list", () => {
    expect(findHymnIndex(toc, 214)).toBeNull();
  });
});

describe("countNumberedEntries", () => {
  it("counts only the entries a number can be typed for", () => {
    expect(countNumberedEntries([{ label: "Praise" }, { label: "1. Holy" }, { label: "2 Grace" }])).toBe(2);
    expect(countNumberedEntries([{ label: "Chapter One" }, { label: "Chapter Two" }])).toBe(0);
  });
});
