import { describe, expect, it } from "vitest";
import { splitVerses, verseHeading } from "./verses";

describe("splitVerses", () => {
  it("splits on the blank line between verses", () => {
    const verses = splitVerses("Amazing grace\nhow sweet the sound\n\nTwas grace that taught");
    expect(verses).toHaveLength(2);
    expect(verses[0].lines).toEqual(["Amazing grace", "how sweet the sound"]);
    expect(verses[1].number).toBe(2);
  });

  it("numbers the verses and lets a chorus keep its name", () => {
    const verses = splitVerses("Verse one\n\nChorus:\nSing it again\n\nVerse two");
    expect(verses.map(verseHeading)).toEqual(["Verse 1", "Chorus", "Verse 2"]);
    // The heading is the heading; only what follows it is sung.
    expect(verses[1].lines).toEqual(["Sing it again"]);
  });

  it("recognises the other names a hymnal prints, and nothing else", () => {
    expect(splitVerses("Refrain\nla")[0].label).toBe("Refrain");
    expect(splitVerses("Bridge:\nla")[0].label).toBe("Bridge");
    // A line that merely starts with one of those words is a line of the hymn.
    expect(splitVerses("Bridge over troubled water")[0].label).toBeNull();
    expect(splitVerses("Chorus of angels sang")[0].label).toBeNull();
  });

  it("survives what pasting from a document actually looks like", () => {
    const pasted = "  Line one\r\n  Line two\r\n\r\n\r\n  Second verse   \r\n";
    const verses = splitVerses(pasted);
    expect(verses).toHaveLength(2);
    expect(verses[1].lines).toEqual(["  Second verse"]);
  });

  it("has nothing to show for a hymn with no lyrics", () => {
    expect(splitVerses(null)).toEqual([]);
    expect(splitVerses("")).toEqual([]);
    expect(splitVerses("   \n\n  ")).toEqual([]);
  });
});
