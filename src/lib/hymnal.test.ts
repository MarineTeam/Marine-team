import { describe, expect, it } from "vitest";
import { hymnReadingOrder } from "./hymnal";

describe("hymnReadingOrder", () => {
  it("puts the book in printed page order", () => {
    const hymns = [
      { id: "c", pageNumber: 42 },
      { id: "a", pageNumber: 1 },
      { id: "b", pageNumber: 12 },
    ];
    expect(hymnReadingOrder(hymns).map((h) => h.id)).toEqual(["a", "b", "c"]);
  });

  it("keeps hymns with no printed number at the end, in the order they came in", () => {
    // Which is the admin's drag order, since the caller queries by position.
    const hymns = [
      { id: "unnumbered-1", pageNumber: null },
      { id: "numbered", pageNumber: 5 },
      { id: "unnumbered-2", pageNumber: null },
    ];
    expect(hymnReadingOrder(hymns).map((h) => h.id)).toEqual([
      "numbered",
      "unnumbered-1",
      "unnumbered-2",
    ]);
  });

  it("leaves two hymns printed on the same page in their given order", () => {
    const hymns = [
      { id: "first", pageNumber: 9 },
      { id: "second", pageNumber: 9 },
    ];
    expect(hymnReadingOrder(hymns).map((h) => h.id)).toEqual(["first", "second"]);
  });

  it("doesn't disturb the array it was given", () => {
    const hymns = [{ id: "b", pageNumber: 2 }, { id: "a", pageNumber: 1 }];
    hymnReadingOrder(hymns);
    expect(hymns.map((h) => h.id)).toEqual(["b", "a"]);
  });
});
