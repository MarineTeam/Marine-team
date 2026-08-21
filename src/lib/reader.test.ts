import { describe, expect, it } from "vitest";
import {
  clampPercent,
  contentDispositionFilename,
  excerptAround,
  findMatches,
  readerFormat,
  toSpeechChunks,
} from "./reader";

describe("readerFormat", () => {
  it("recognizes the correct mime types", () => {
    expect(readerFormat("application/pdf", "x")).toBe("pdf");
    expect(readerFormat("application/epub+zip", "x")).toBe("epub");
  });

  it("falls back to the extension when the mime type is missing or wrong", () => {
    // The common real-world case: a browser that sent octet-stream for an EPUB.
    expect(readerFormat("application/octet-stream", "books/psalms.epub")).toBe("epub");
    expect(readerFormat(null, "books/psalms.pdf")).toBe("pdf");
    expect(readerFormat(undefined, "PSALMS.EPUB")).toBe("epub");
  });

  it("ignores a query string or fragment on the path", () => {
    expect(readerFormat(null, "books/a.pdf?v=2")).toBe("pdf");
    expect(readerFormat(null, "books/a.epub#toc")).toBe("epub");
  });

  it("returns null for anything it can't open", () => {
    expect(readerFormat("audio/mpeg", "sermon.mp3")).toBeNull();
    expect(readerFormat(null, "notes")).toBeNull();
    expect(readerFormat("", "")).toBeNull();
  });

  it("trusts a correct mime type over a misleading extension", () => {
    expect(readerFormat("application/pdf", "actually-named.epub")).toBe("pdf");
  });
});

describe("clampPercent", () => {
  it("holds the value inside 0-100 as a whole number", () => {
    expect(clampPercent(42.6)).toBe(43);
    expect(clampPercent(-5)).toBe(0);
    expect(clampPercent(150)).toBe(100);
  });

  it("treats non-finite input as zero rather than writing NaN to the database", () => {
    expect(clampPercent(NaN)).toBe(0);
    expect(clampPercent(Infinity)).toBe(100);
  });
});

describe("toSpeechChunks", () => {
  it("splits on sentence endings, keeping the punctuation", () => {
    expect(toSpeechChunks("One. Two! Three?")).toEqual(["One.", "Two!", "Three?"]);
  });

  it("collapses whitespace, which extracted PDF text is full of", () => {
    expect(toSpeechChunks("One\n\n  two   three.")).toEqual(["One two three."]);
  });

  it("returns nothing for empty or whitespace-only text", () => {
    expect(toSpeechChunks("")).toEqual([]);
    expect(toSpeechChunks("   \n ")).toEqual([]);
  });

  it("breaks a runaway sentence on a space rather than emitting one huge utterance", () => {
    const long = `${"word ".repeat(200)}end.`;
    const chunks = toSpeechChunks(long, 100);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) expect(chunk.length).toBeLessThanOrEqual(100);
    // Nothing is lost in the splitting.
    expect(chunks.join(" ").replace(/\s+/g, " ")).toBe(long.replace(/\s+/g, " ").trim());
  });

  it("keeps a sentence with no terminal punctuation", () => {
    expect(toSpeechChunks("no full stop here")).toEqual(["no full stop here"]);
  });
});

describe("findMatches", () => {
  it("finds every case-insensitive occurrence", () => {
    expect(findMatches("Grace and grace and GRACE", "grace")).toEqual([0, 10, 20]);
  });

  it("finds overlapping matches", () => {
    expect(findMatches("aaa", "aa")).toEqual([0, 1]);
  });

  it("returns nothing for an empty or whitespace query", () => {
    expect(findMatches("anything", "")).toEqual([]);
    expect(findMatches("anything", "   ")).toEqual([]);
  });

  it("returns nothing when there's no hit", () => {
    expect(findMatches("psalms", "proverbs")).toEqual([]);
  });
});

describe("contentDispositionFilename", () => {
  it("takes the extension from the path, not the title", () => {
    expect(contentDispositionFilename("Psalms", "files/abc.pdf")).toContain('filename="Psalms.pdf"');
  });

  it("doesn't double up an extension the title already has", () => {
    expect(contentDispositionFilename("Psalms.pdf", "files/abc.pdf")).toContain('filename="Psalms.pdf"');
  });

  it("strips CR/LF so an admin-entered title can't inject a header", () => {
    const header = contentDispositionFilename("evil\r\nSet-Cookie: x=1", "files/a.pdf");
    expect(header).not.toContain("\r");
    expect(header).not.toContain("\n");
  });

  it("strips quotes and backslashes that would end the quoted string early", () => {
    const header = contentDispositionFilename('a"b\\c', "files/a.pdf");
    // Exactly two quotes: the ones this function opens and closes with.
    expect(header.match(/"/g)).toHaveLength(2);
  });

  it("keeps non-ASCII in filename* while falling back to ASCII in filename", () => {
    const header = contentDispositionFilename("Café", "files/a.pdf");
    expect(header).toContain('filename="Caf_.pdf"');
    expect(header).toContain(`filename*=UTF-8''${encodeURIComponent("Café.pdf")}`);
  });

  it("falls back to a usable name when the title is blank", () => {
    expect(contentDispositionFilename("   ", "files/a.pdf")).toContain('filename="download.pdf"');
  });

  it("ignores a junk extension rather than appending it", () => {
    expect(contentDispositionFilename("Notes", "files/no-extension")).toContain('filename="Notes"');
  });
});

describe("excerptAround", () => {
  it("ellipsizes only the ends it actually trimmed", () => {
    const text = `${"a".repeat(100)}NEEDLE${"b".repeat(100)}`;
    const excerpt = excerptAround(text, 100, 6, 10);
    expect(excerpt.startsWith("…")).toBe(true);
    expect(excerpt.endsWith("…")).toBe(true);
    expect(excerpt).toContain("NEEDLE");
  });

  it("adds no ellipsis when the whole string already fits", () => {
    expect(excerptAround("short text", 0, 5, 60)).toBe("short text");
  });
});
