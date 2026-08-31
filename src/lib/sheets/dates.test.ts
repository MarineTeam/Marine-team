import { describe, expect, it } from "vitest";

import { inferYear, parseSheetDate, parseSheetTime } from "./dates";

/**
 * Date cells are where spreadsheet imports break. These cover the shapes real
 * church rotas actually contain, plus the ones that must be *rejected* -- a
 * parser that guesses at "TBD" is worse than one that skips the row.
 */

// A fixed reference so year inference is deterministic.
const REFERENCE = new Date("2026-06-15T12:00:00Z");

function parse(value: unknown, options = {}) {
  return parseSheetDate(value, { referenceDate: REFERENCE, ...options });
}

describe("parseSheetDate", () => {
  describe("month-name formats", () => {
    it.each([
      ["July 10", "2026-07-10"],
      ["july 10", "2026-07-10"],
      ["JULY 10", "2026-07-10"],
      ["Jul 10", "2026-07-10"],
      ["Jul. 10", "2026-07-10"],
      ["July 10th", "2026-07-10"],
      ["July 1st", "2026-07-01"],
      ["August 22nd", "2026-08-22"],
      ["September 3rd", "2026-09-03"],
      ["July 10, 2027", "2027-07-10"],
      ["July 10 2027", "2027-07-10"],
      ["Sept 3", "2026-09-03"],
    ])("parses %s", (input, expected) => {
      const result = parse(input);
      expect(result).toEqual({ ok: true, date: expected });
    });

    it("ignores a leading weekday", () => {
      expect(parse("Sunday, July 12")).toEqual({ ok: true, date: "2026-07-12" });
      expect(parse("Sun July 12")).toEqual({ ok: true, date: "2026-07-12" });
      expect(parse("Sun - July 12")).toEqual({ ok: true, date: "2026-07-12" });
    });

    it("parses day-first wording", () => {
      expect(parse("10 July")).toEqual({ ok: true, date: "2026-07-10" });
      expect(parse("10 July 2027")).toEqual({ ok: true, date: "2027-07-10" });
    });
  });

  describe("numeric formats", () => {
    it("defaults to month/day", () => {
      expect(parse("7/10")).toEqual({ ok: true, date: "2026-07-10" });
      expect(parse("7-10-2026")).toEqual({ ok: true, date: "2026-07-10" });
    });

    it("honours the dayFirst setting", () => {
      expect(parse("3/4", { dayFirst: true })).toEqual({ ok: true, date: "2026-04-03" });
      expect(parse("3/4", { dayFirst: false })).toEqual({ ok: true, date: "2026-03-04" });
    });

    it("detects an unambiguous day/month even when configured month-first", () => {
      // 25 cannot be a month, so this is 25 March however the sheet is set up.
      expect(parse("25/3")).toEqual({ ok: true, date: "2026-03-25" });
    });

    it("expands two-digit years", () => {
      expect(parse("7/10/27")).toEqual({ ok: true, date: "2027-07-10" });
      expect(parse("7/10/99")).toEqual({ ok: false, reason: "out_of_range" });
    });

    it("parses ISO dates", () => {
      expect(parse("2026-07-10")).toEqual({ ok: true, date: "2026-07-10" });
      expect(parse("2026/07/10")).toEqual({ ok: true, date: "2026-07-10" });
    });
  });

  describe("serial numbers (a cell formatted as a date)", () => {
    it("converts Google's serial epoch", () => {
      // 46,000 days after the 1899-12-30 epoch.
      expect(parse(46000)).toEqual({ ok: true, date: "2025-12-09" });
    });

    it("accepts a serial that arrived as a string", () => {
      expect(parse("46000")).toEqual({ ok: true, date: "2025-12-09" });
    });

    it("rejects numbers outside the plausible range", () => {
      expect(parse(5)).toEqual({ ok: false, reason: "out_of_range" });
      expect(parse(999999)).toEqual({ ok: false, reason: "out_of_range" });
    });
  });

  describe("rejects things that are not dates", () => {
    it.each(["", "   ", "TBD", "n/a", "-", "???", "Devin", "next week"])(
      "rejects %j",
      (input) => {
        const result = parse(input);
        expect(result.ok).toBe(false);
      },
    );

    it("reports empty separately from unrecognized", () => {
      expect(parse("")).toEqual({ ok: false, reason: "empty" });
      expect(parse("TBD")).toEqual({ ok: false, reason: "unrecognized" });
    });

    it("rejects impossible calendar days", () => {
      expect(parse("February 30").ok).toBe(false);
      expect(parse("2026-02-30").ok).toBe(false);
      expect(parse("13/45").ok).toBe(false);
    });

    it("rejects dates decades away, which are almost always typos", () => {
      expect(parse("July 10, 2099")).toEqual({ ok: false, reason: "out_of_range" });
      expect(parse("July 10, 1980")).toEqual({ ok: false, reason: "out_of_range" });
    });

    it("rejects non-string, non-number cells", () => {
      expect(parse(null)).toEqual({ ok: false, reason: "empty" });
      expect(parse(undefined)).toEqual({ ok: false, reason: "empty" });
      expect(parse({}).ok).toBe(false);
    });

    it("rejects absurdly long input rather than trying to parse it", () => {
      expect(parse("x".repeat(200))).toEqual({ ok: false, reason: "unrecognized" });
    });
  });

  describe("year inference", () => {
    it("prefers the coming occurrence", () => {
      // Reference is mid-June 2026, so "January 5" means January 2027.
      expect(parse("January 5")).toEqual({ ok: true, date: "2027-01-05" });
    });

    it("keeps a date that has only just passed in the current year", () => {
      expect(parse("June 1")).toEqual({ ok: true, date: "2026-06-01" });
    });

    it("respects an explicit defaultYear", () => {
      expect(parse("July 10", { defaultYear: 2026 })).toEqual({ ok: true, date: "2026-07-10" });
    });

    it("exposes the heuristic directly", () => {
      expect(inferYear(7, 10, REFERENCE)).toBe(2026);
      expect(inferYear(1, 5, REFERENCE)).toBe(2027);
    });
  });
});

describe("parseSheetTime", () => {
  it.each([
    ["7:30", "07:30"],
    ["07:30", "07:30"],
    ["7:30 pm", "19:30"],
    ["7:30PM", "19:30"],
    ["7pm", "19:00"],
    ["12am", "00:00"],
    ["12pm", "12:00"],
    ["23:45", "23:45"],
  ])("parses %s", (input, expected) => {
    expect(parseSheetTime(input)).toBe(expected);
  });

  it.each(["", "later", "25:00", "7:75", "13pm", null, 42])("rejects %j", (input) => {
    expect(parseSheetTime(input)).toBeNull();
  });
});
