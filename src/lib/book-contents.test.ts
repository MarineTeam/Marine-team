import { describe, expect, it } from "vitest";
import { formatContentsText, parseContentsText } from "./book-contents";
import { hymnNumberOf } from "./toc-nav";

describe("parseContentsText", () => {
  it("reads a contents page as it is printed: number, title, page", () => {
    const { entries, problems } = parseContentsText("214 Amazing Grace 230\n302 It Is Well 318", 0);
    expect(problems).toEqual([]);
    expect(entries).toEqual([
      { title: "214 Amazing Grace", page: 230, depth: 0 },
      { title: "302 It Is Well", page: 318, depth: 0 },
    ]);
  });

  it("leaves the hymn number on the label, where hymnNumberOf finds it", () => {
    const { entries } = parseContentsText("214 Amazing Grace 230", 0);
    expect(hymnNumberOf(entries[0].title)).toBe(214);
  });

  it("takes a tab or a pipe as the separator, so a spreadsheet paste works", () => {
    const { entries } = parseContentsText("214 Amazing Grace\t230\nAdvent | 4", 0);
    expect(entries).toEqual([
      { title: "214 Amazing Grace", page: 230, depth: 0 },
      { title: "Advent", page: 4, depth: 0 },
    ]);
  });

  it("keeps a title that ends in a number apart from the page", () => {
    const { entries } = parseContentsText("Psalm 23 | 45", 0);
    expect(entries).toEqual([{ title: "Psalm 23", page: 45, depth: 0 }]);
  });

  it("converts the printed page a person types into the PDF page stored", () => {
    const { entries } = parseContentsText("214 Amazing Grace 230", 12);
    expect(entries).toEqual([{ title: "214 Amazing Grace", page: 242, depth: 0 }]);
  });

  it("takes pdf:N as the PDF page itself, for front matter with no printed number", () => {
    const { entries } = parseContentsText("Preface | pdf:2", 12);
    expect(entries).toEqual([{ title: "Preface", page: 2, depth: 0 }]);
  });

  it("skips blank lines without counting them as entries", () => {
    const { entries, problems } = parseContentsText("214 Amazing Grace 230\n\n  \n302 It Is Well 318", 0);
    expect(entries).toHaveLength(2);
    expect(problems).toEqual([]);
  });

  it("reports a line with no page rather than dropping the hymn", () => {
    const { entries, problems } = parseContentsText("214 Amazing Grace\n302 It Is Well 318", 0);
    expect(entries).toHaveLength(1);
    expect(problems).toEqual([
      { line: 1, raw: "214 Amazing Grace", reason: "No page number at the end of the line" },
    ]);
  });

  it("points at the line the typist sees, counting blanks", () => {
    const { problems } = parseContentsText("214 Amazing Grace 230\n\nIt Is Well", 0);
    expect(problems[0].line).toBe(3);
  });

  // Reachable through a negative offset, which a scan missing its opening
  // pages genuinely has: printed 3 is then before the file starts.
  it("refuses a page in front of the book's own page 1 instead of storing a guess", () => {
    const { entries, problems } = parseContentsText("Opening hymn | 3", -12);
    expect(entries).toEqual([]);
    expect(problems[0].reason).toContain("in front of this book's page 1");
  });

  it("refuses a page with nothing to call it", () => {
    const { problems } = parseContentsText("| 230", 0);
    expect(problems[0].reason).toBe("A page with nothing to call it");
  });

  it("reads indentation as nesting, so a heading keeps the hymns under it", () => {
    const { entries } = parseContentsText("Advent | 4\n  214 Amazing Grace | 230\n\t302 It Is Well | 318", 0);
    expect(entries.map((e) => e.depth)).toEqual([0, 1, 1]);
  });
});

describe("formatContentsText", () => {
  it("round-trips what was parsed, offset, nesting and all", () => {
    const typed = "Advent | 4\n  214 Amazing Grace | 230\n  302 It Is Well | 318\nPreface | pdf:2";
    const { entries, problems } = parseContentsText(typed, 12);
    expect(problems).toEqual([]);
    expect(formatContentsText(entries, 12)).toBe(typed);
  });

  it("writes front matter as a PDF page, having no printed one to write", () => {
    expect(formatContentsText([{ title: "Preface", page: 2, depth: 0 }], 12)).toBe("Preface | pdf:2");
  });

  it("keeps an entry indexed from bookmarks readable when it has no depth of its own", () => {
    expect(formatContentsText([{ title: "Advent", page: 4 }], 0)).toBe("Advent | 4");
  });
});
