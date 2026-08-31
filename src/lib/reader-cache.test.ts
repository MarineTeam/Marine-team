import { describe, expect, it } from "vitest";
import { bookCacheTag, parseCachedToc, serializeToc, TOC_MAX_AGE_MS } from "./reader-cache";
import type { TocEntry } from "@/components/reader-types";

const entries: TocEntry[] = [
  { label: "Praise", location: null, depth: 0 },
  { label: "1. Holy, Holy, Holy", location: "11", depth: 1 },
];

describe("bookCacheTag", () => {
  it("changes when the file's bytes do", () => {
    expect(bookCacheTag({ sizeBytes: 1024 })).not.toBe(bookCacheTag({ sizeBytes: 2048 }));
  });

  it("has a value for a file whose size was never recorded", () => {
    expect(bookCacheTag({ sizeBytes: null })).toBe("0");
  });
});

describe("parseCachedToc", () => {
  it("reads back what was written", () => {
    expect(parseCachedToc(serializeToc(entries, "1024"), "1024")).toEqual(entries);
  });

  it("keeps an empty contents list, which is an answer like any other", () => {
    expect(parseCachedToc(serializeToc([], "1024"), "1024")).toEqual([]);
  });

  it("misses when the file has been replaced", () => {
    expect(parseCachedToc(serializeToc(entries, "1024"), "2048")).toBeNull();
  });

  it("misses once the entry is too old, in either direction", () => {
    const raw = serializeToc(entries, "1024", 1_000_000);
    expect(parseCachedToc(raw, "1024", 1_000_000 + TOC_MAX_AGE_MS + 1)).toBeNull();
    // A device whose clock went backwards shouldn't hold an entry forever.
    expect(parseCachedToc(raw, "1024", 1_000_000 - TOC_MAX_AGE_MS - 1)).toBeNull();
    expect(parseCachedToc(raw, "1024", 1_000_000 + TOC_MAX_AGE_MS - 1)).toEqual(entries);
  });

  it("refuses anything it can't trust rather than rendering it", () => {
    expect(parseCachedToc(null, "1024")).toBeNull();
    expect(parseCachedToc("not json", "1024")).toBeNull();
    expect(parseCachedToc("[]", "1024")).toBeNull();
    expect(parseCachedToc(JSON.stringify({ tag: "1024", savedAt: Date.now() }), "1024")).toBeNull();
  });

  it("refuses a list with an entry of the wrong shape", () => {
    const raw = JSON.stringify({
      tag: "1024",
      savedAt: Date.now(),
      entries: [{ label: "1. Holy", location: 11, depth: 1 }],
    });
    expect(parseCachedToc(raw, "1024")).toBeNull();
  });
});
