import { describe, expect, it } from "vitest";
import { fileHref, fingerprintHymns, hymnReadingOrder } from "./hymnal";

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

describe("fingerprintHymns", () => {
  const hymns = [
    { id: "a", title: "Holy, Holy, Holy", pageNumber: 1, lyricsText: "Holy, holy, holy!" },
    { id: "b", title: "Amazing Grace", pageNumber: 12, lyricsText: "Amazing grace" },
  ];

  it("is the same for the same book", () => {
    expect(fingerprintHymns(hymns)).toBe(fingerprintHymns([...hymns]));
  });

  it("changes when a hymn's words are corrected", () => {
    const fixed = [hymns[0], { ...hymns[1], lyricsText: "Amazing grace, how sweet the sound" }];
    expect(fingerprintHymns(fixed)).not.toBe(fingerprintHymns(hymns));
  });

  it("changes when a hymn is added, renumbered, retitled or reordered", () => {
    expect(fingerprintHymns([...hymns, { id: "c", title: "It Is Well", pageNumber: 44, lyricsText: "When peace" }]))
      .not.toBe(fingerprintHymns(hymns));
    expect(fingerprintHymns([hymns[0], { ...hymns[1], pageNumber: 13 }])).not.toBe(fingerprintHymns(hymns));
    expect(fingerprintHymns([hymns[0], { ...hymns[1], title: "Amazing Grace!" }])).not.toBe(fingerprintHymns(hymns));
    expect(fingerprintHymns([hymns[1], hymns[0]])).not.toBe(fingerprintHymns(hymns));
  });

  it("counts the hymns in the token, so a hash collision still can't read as unchanged", () => {
    expect(fingerprintHymns(hymns).startsWith("2-")).toBe(true);
    expect(fingerprintHymns([])).toBe("0-811c9dc5");
  });
});

describe("fileHref", () => {
  const pdf = { id: "f1", mimeType: "application/pdf", bunnyPath: "books/hymnal.pdf" };

  it("sends a hymn in a hymn-per-file book to its lyrics page", () => {
    expect(fileHref({ ...pdf, series: { hymnPerFile: true } })).toBe("/hymns/f1");
  });

  it("sends a book to its contents", () => {
    expect(fileHref({ ...pdf, series: { hymnPerFile: false } })).toBe("/books/f1");
    expect(fileHref({ id: "f2", mimeType: null, bunnyPath: "books/x.epub" })).toBe("/books/f2");
  });

  it("has nowhere to send a file that isn't either", () => {
    // An audio handout is a row with a download button, not a page.
    expect(fileHref({ id: "f3", mimeType: "audio/mpeg", bunnyPath: "talks/a.mp3" })).toBeNull();
  });
});
