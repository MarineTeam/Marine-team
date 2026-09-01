import { describe, expect, it } from "vitest";
import { fingerprintOutline, outlineToText, parseOutline } from "./outline";

describe("parseOutline", () => {
  it("splits a line into what is printed and what is filled in", () => {
    const { lines, blanks } = parseOutline("Grace is ____ and free.");
    expect(blanks).toBe(1);
    expect(lines[0]).toEqual([
      { kind: "text", text: "Grace is " },
      { kind: "blank", index: 0 },
      { kind: "text", text: " and free." },
    ]);
  });

  it("numbers the gaps across the whole sheet, not per line", () => {
    const { lines, blanks } = parseOutline("1. ____\n2. ____ and ____");
    expect(blanks).toBe(3);
    expect(lines[1].filter((s) => s.kind === "blank")).toEqual([
      { kind: "blank", index: 1 },
      { kind: "blank", index: 2 },
    ]);
  });

  it("keeps blank lines, so the sheet has the shape it was typed in", () => {
    expect(parseOutline("One\n\nTwo").lines).toHaveLength(3);
    expect(parseOutline("One\n\nTwo").lines[1]).toEqual([]);
  });

  // Two underscores is a typo or an emphasis mark; three is a gap somebody
  // drew on purpose.
  it("doesn't treat two underscores as a gap", () => {
    expect(parseOutline("snake__case").blanks).toBe(0);
    expect(parseOutline("___").blanks).toBe(1);
  });

  it("handles a gap at the very start and the very end", () => {
    expect(parseOutline("____ is enough").lines[0][0]).toEqual({ kind: "blank", index: 0 });
    expect(parseOutline("enough is ____").lines[0].at(-1)).toEqual({ kind: "blank", index: 0 });
  });

  it("reads Windows line endings as lines, not as text", () => {
    expect(parseOutline("One\r\nTwo").lines).toHaveLength(2);
  });
});

describe("fingerprintOutline", () => {
  it("changes when a gap is added, which is when answers stop lining up", () => {
    expect(fingerprintOutline("a ____\nb ____")).not.toBe(fingerprintOutline("a ____\nb ____ c ____"));
  });

  it("is the same for the same outline, whatever its line endings", () => {
    expect(fingerprintOutline("a ____\r\nb")).toBe(fingerprintOutline("a ____\nb"));
  });
});

describe("outlineToText", () => {
  it("puts the answers back into the sentence", () => {
    expect(outlineToText("Grace is ____ and ____.", { "0": "unearned", "1": "free" })).toBe(
      "Grace is unearned and free.",
    );
  });

  // What was missed is part of the record: a sheet that closed its own gaps
  // would read as though it had been finished.
  it("leaves a gap that was never filled in", () => {
    expect(outlineToText("Grace is ____.", {})).toBe("Grace is ________.");
    expect(outlineToText("Grace is ____.", { "0": "   " })).toBe("Grace is ________.");
  });
});
