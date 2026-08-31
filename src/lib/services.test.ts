import { describe, expect, it } from "vitest";
import { planItemHref, planItemNumber, planItemReadable } from "./services";

const hymnFile = {
  id: "h1",
  mimeType: "application/pdf",
  bunnyPath: "hymns/holy.pdf",
  pageNumber: 12,
  series: { hymnPerFile: true },
};
const book = {
  id: "b1",
  mimeType: "application/pdf",
  bunnyPath: "books/hymnal.pdf",
  pageNumber: null,
  series: { hymnPerFile: false },
};

describe("planItemHref", () => {
  it("opens a hymn that is its own file at its lyrics", () => {
    expect(planItemHref({ hymnNumber: null, file: hymnFile })).toBe("/hymns/h1");
  });

  it("carries the number to a whole book's contents, which knows how to resolve it", () => {
    expect(planItemHref({ hymnNumber: 214, file: book })).toBe("/books/b1?hymn=214");
  });

  it("falls back to the contents when nobody wrote a number down", () => {
    expect(planItemHref({ hymnNumber: null, file: book })).toBe("/books/b1");
  });

  it("keeps a number off a hymn's own page, which has nothing to resolve", () => {
    expect(planItemHref({ hymnNumber: 214, file: hymnFile })).toBe("/hymns/h1");
  });

  it("has nowhere to open a file that isn't a hymn or a book", () => {
    expect(
      planItemHref({ hymnNumber: null, file: { ...book, mimeType: "audio/mpeg", bunnyPath: "a.mp3" } }),
    ).toBeNull();
  });
});

describe("planItemNumber", () => {
  it("prefers the number written for this service", () => {
    expect(planItemNumber({ hymnNumber: 214, file: { pageNumber: 12 } })).toBe(214);
  });

  it("falls back to the hymn's own printed number", () => {
    expect(planItemNumber({ hymnNumber: null, file: { pageNumber: 12 } })).toBe(12);
    expect(planItemNumber({ hymnNumber: null, file: { pageNumber: null } })).toBeNull();
  });
});

describe("planItemReadable", () => {
  const live = { published: true, hidden: false, deletedAt: null, memberOnly: false };

  it("opens what is published and public", () => {
    expect(planItemReadable({ file: live }, false)).toBe(true);
  });

  it("closes a members-only hymn to a signed-out visitor, and opens it to a member", () => {
    expect(planItemReadable({ file: { ...live, memberOnly: true } }, false)).toBe(false);
    expect(planItemReadable({ file: { ...live, memberOnly: true } }, true)).toBe(true);
  });

  it("closes a hymn unpublished, hidden or trashed since the plan was made", () => {
    expect(planItemReadable({ file: { ...live, published: false } }, true)).toBe(false);
    expect(planItemReadable({ file: { ...live, hidden: true } }, true)).toBe(false);
    expect(planItemReadable({ file: { ...live, deletedAt: new Date() } }, true)).toBe(false);
  });
});
