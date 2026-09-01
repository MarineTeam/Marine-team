import { describe, expect, it } from "vitest";

import { parserConfigSchema, type ParserConfig } from "./config";
import { columnLetterToIndex, fingerprintEvents, parseSheet, resolveColumn } from "./parse";

/**
 * The sheet parser, exercised against the layouts and the mess real
 * spreadsheets contain: blank rows, merged-looking gaps, duplicate names,
 * missing columns, junk in date cells.
 *
 * The governing rule under test: a bad row is skipped and reported, never
 * allowed to abort the import of the good rows around it.
 */

const REFERENCE = new Date("2026-06-15T12:00:00Z");

function config(overrides: Partial<ParserConfig> = {}): ParserConfig {
  return parserConfigSchema.parse(overrides);
}

function parseDateNames(grid: unknown[][], overrides: Partial<ParserConfig> = {}) {
  return parseSheet(grid, {
    format: "DATE_NAMES",
    config: config(overrides),
    referenceDate: REFERENCE,
  });
}

function parseNameColumns(grid: unknown[][], overrides: Partial<ParserConfig> = {}) {
  return parseSheet(grid, {
    format: "NAME_COLUMNS",
    config: config(overrides),
    referenceDate: REFERENCE,
  });
}

describe("column resolution", () => {
  it("converts letters to indexes", () => {
    expect(columnLetterToIndex("A")).toBe(0);
    expect(columnLetterToIndex("B")).toBe(1);
    expect(columnLetterToIndex("Z")).toBe(25);
    expect(columnLetterToIndex("AA")).toBe(26);
    expect(columnLetterToIndex("not a column")).toBeNull();
  });

  it("prefers a header match over a letter", () => {
    // "B" is a legitimate header when columns are named after people.
    const headers = ["Date", "B", "Names"];
    expect(resolveColumn("B", headers)).toBe(1);
    expect(resolveColumn("Names", headers)).toBe(2);
    expect(resolveColumn("names", headers)).toBe(2);
  });

  it("falls back to the letter when no header matches", () => {
    expect(resolveColumn("C", ["Date", "Names"])).toBe(2);
  });
});

describe("DATE_NAMES format", () => {
  const HAPPY_PATH = [
    ["Date", "Names"],
    ["July 10", "Devin, Cindy"],
    ["July 17", "John"],
    ["July 24", "Devin, Sarah"],
  ];

  it("parses the documented example", () => {
    const result = parseDateNames(HAPPY_PATH);

    expect(result.issues).toEqual([]);
    expect(result.events).toHaveLength(3);
    expect(result.events[0]).toMatchObject({
      date: "2026-07-10",
      peopleNames: ["Devin", "Cindy"],
      sourceRow: 2,
    });
    expect(result.events[1].peopleNames).toEqual(["John"]);
    expect(result.discoveredNames).toEqual(["Cindy", "Devin", "John", "Sarah"]);
  });

  it("splits names on every configured separator", () => {
    const result = parseDateNames([
      ["Date", "Names"],
      ["July 10", "Devin & Cindy"],
      ["July 17", "John / Sarah"],
      ["July 24", "Devin; Cindy"],
      ["July 31", "Devin and Sarah"],
      ["August 7", "Devin + John"],
    ]);

    expect(result.events.map((event) => event.peopleNames)).toEqual([
      ["Devin", "Cindy"],
      ["John", "Sarah"],
      ["Devin", "Cindy"],
      ["Devin", "Sarah"],
      ["Devin", "John"],
    ]);
  });

  it("collapses duplicate names inside one cell", () => {
    const result = parseDateNames([
      ["Date", "Names"],
      ["July 10", "Devin, devin, DEVIN, Cindy"],
    ]);

    expect(result.events[0].peopleNames).toEqual(["Devin", "Cindy"]);
  });

  it("skips blank rows silently", () => {
    const result = parseDateNames([
      ["Date", "Names"],
      ["July 10", "Devin"],
      ["", ""],
      [],
      ["July 17", "Cindy"],
    ]);

    expect(result.events).toHaveLength(2);
    expect(result.issues).toEqual([]);
  });

  it("reports a row that has content but no date", () => {
    const result = parseDateNames([
      ["Date", "Names"],
      ["", "Devin"],
      ["July 17", "Cindy"],
    ]);

    expect(result.events).toHaveLength(1);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: "missing_date", row: 2 }),
    );
  });

  it("reports an invalid date and keeps the surrounding rows", () => {
    const result = parseDateNames([
      ["Date", "Names"],
      ["July 10", "Devin"],
      ["TBD", "Cindy"],
      ["July 24", "John"],
    ]);

    expect(result.events.map((event) => event.date)).toEqual(["2026-07-10", "2026-07-24"]);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: "invalid_date", row: 3 }),
    );
  });

  it("reports rows with a valid date but nobody listed", () => {
    const result = parseDateNames([
      ["Date", "Names"],
      ["July 10", ""],
      ["July 17", "Cindy"],
    ]);

    expect(result.events).toHaveLength(1);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: "missing_names", row: 2 }),
    );
  });

  it("keeps unassigned rows when configured to", () => {
    const result = parseDateNames(
      [
        ["Date", "Names"],
        ["July 10", ""],
      ],
      { skipRowsWithoutPeople: false },
    );

    expect(result.events).toHaveLength(1);
    expect(result.events[0].peopleNames).toEqual([]);
  });

  it("rejects entries that are not names", () => {
    const result = parseDateNames([
      ["Date", "Names"],
      ["July 10", "Devin, ???, 42"],
    ]);

    expect(result.events[0].peopleNames).toEqual(["Devin"]);
    expect(result.issues.some((issue) => issue.code === "invalid_name")).toBe(true);
  });

  it("reports a missing date column rather than importing nothing silently", () => {
    const result = parseDateNames(
      [
        ["Week", "Names"],
        ["July 10", "Devin"],
      ],
      { dateColumn: "When" },
    );

    expect(result.events).toEqual([]);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: "missing_column", column: "When" }),
    );
  });

  it("reports an empty sheet", () => {
    const result = parseDateNames([]);
    expect(result.issues).toContainEqual(expect.objectContaining({ code: "empty_sheet" }));
  });

  it("reads optional title, notes and time columns", () => {
    const result = parseDateNames(
      [
        ["Date", "Names", "Title", "Notes", "Time"],
        ["July 10", "Devin", "Communion", "Bring extra cups", "7:30 pm"],
      ],
      { titleColumn: "Title", notesColumn: "Notes", timeColumn: "Time" },
    );

    expect(result.events[0]).toMatchObject({
      title: "Communion",
      notes: "Bring extra cups",
      startTime: "19:30",
      allDay: false,
    });
  });

  it("works with no header row when columns are given by letter", () => {
    const result = parseDateNames(
      [
        ["July 10", "Devin"],
        ["July 17", "Cindy"],
      ],
      { headerRow: 0, dateColumn: "A", namesColumn: "B" },
    );

    expect(result.events).toHaveLength(2);
    expect(result.events[0].sourceRow).toBe(1);
  });

  it("gives two events on the same day distinct external ids", () => {
    const result = parseDateNames([
      ["Date", "Names"],
      ["July 10", "Devin"],
      ["July 10", "Cindy"],
    ]);

    const ids = result.events.map((event) => event.externalId);
    expect(new Set(ids).size).toBe(2);
  });

  it("truncates a sheet that exceeds maxRows and says so", () => {
    const grid: unknown[][] = [["Date", "Names"]];
    for (let index = 0; index < 12; index += 1) {
      grid.push([`July ${index + 1}`, "Devin"]);
    }

    const result = parseDateNames(grid, { maxRows: 5 });
    expect(result.events).toHaveLength(5);
    expect(result.issues).toContainEqual(expect.objectContaining({ code: "truncated" }));
  });

  it("skips dates outside the configured import window", () => {
    const result = parseDateNames(
      [
        ["Date", "Names"],
        ["July 10, 2026", "Devin"],
        ["July 10, 2027", "Cindy"],
      ],
      { maxFutureDays: 30 },
    );

    expect(result.events).toHaveLength(1);
    expect(result.issues.some((issue) => issue.code === "invalid_date")).toBe(true);
  });
});

describe("NAME_COLUMNS format", () => {
  const HAPPY_PATH = [
    ["Date", "Devin", "Cindy", "John", "Sarah"],
    ["July 10", "x", "x", "", ""],
    ["July 17", "", "x", "x", ""],
    ["July 24", "x", "", "", "x"],
  ];

  it("parses the documented example", () => {
    const result = parseNameColumns(HAPPY_PATH);

    expect(result.events).toHaveLength(3);
    expect(result.events[0]).toMatchObject({
      date: "2026-07-10",
      peopleNames: ["Devin", "Cindy"],
    });
    expect(result.events[1].peopleNames).toEqual(["Cindy", "John"]);
    expect(result.events[2].peopleNames).toEqual(["Devin", "Sarah"]);
  });

  it("accepts a variety of tick marks", () => {
    const result = parseNameColumns([
      ["Date", "Devin", "Cindy", "John"],
      ["July 10", "✓", "YES", "1"],
    ]);

    expect(result.events[0].peopleNames).toEqual(["Devin", "Cindy", "John"]);
  });

  it("treats explicit negatives as unassigned", () => {
    const result = parseNameColumns([
      ["Date", "Devin", "Cindy"],
      ["July 10", "no", "-"],
      ["July 17", "x", ""],
    ]);

    expect(result.events).toHaveLength(1);
    expect(result.events[0].peopleNames).toEqual(["Devin"]);
  });

  it("uses free text in a person column as a role", () => {
    const result = parseNameColumns([
      ["Date", "Devin", "Cindy"],
      ["July 10", "Bread", "Cup"],
    ]);

    expect(result.events[0].roles).toEqual({ Devin: "Bread", Cindy: "Cup" });
  });

  it("ignores configured non-person columns", () => {
    const result = parseNameColumns(
      [
        ["Date", "Team", "Devin", "Cindy"],
        ["July 10", "A", "x", ""],
      ],
      { ignoreColumns: ["Team"] },
    );

    expect(result.events[0].peopleNames).toEqual(["Devin"]);
    expect(result.discoveredNames).toEqual(["Cindy", "Devin"]);
  });

  it("never treats an obvious non-person column as a person", () => {
    // The trap this guards against: a "Notes" column silently becomes a
    // person who is on every event that happens to have a note.
    const result = parseNameColumns([
      ["Date", "Week", "Devin", "Cindy", "Notes", "Location"],
      ["July 10", "28", "x", "", "Communion", "Main hall"],
    ]);

    expect(result.events[0].peopleNames).toEqual(["Devin"]);
    expect(result.discoveredNames).toEqual(["Cindy", "Devin"]);
    expect(result.events[0].roles ?? {}).toEqual({});
  });

  it.each(["Notes", "notes", "NOTES", "Comments", "Time", "Location", "Total", "Status"])(
    "skips the %s column",
    (header) => {
      const result = parseNameColumns([
        ["Date", "Devin", header],
        ["July 10", "x", "something"],
      ]);
      expect(result.events[0].peopleNames).toEqual(["Devin"]);
    },
  );

  it("collapses two columns for the same person and reports it", () => {
    const result = parseNameColumns([
      ["Date", "Devin", "devin"],
      ["July 10", "x", "x"],
    ]);

    expect(result.events[0].peopleNames).toEqual(["Devin"]);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: "duplicate_row", column: "devin" }),
    );
  });

  it("ignores a header that is not usable as a name", () => {
    const result = parseNameColumns([
      ["Date", "Devin", "???"],
      ["July 10", "x", "x"],
    ]);

    expect(result.events[0].peopleNames).toEqual(["Devin"]);
    expect(result.issues.some((issue) => issue.code === "invalid_name")).toBe(true);
  });

  it("requires a header row and says so when there is none", () => {
    const result = parseNameColumns(
      [
        ["July 10", "x", ""],
        ["July 17", "", "x"],
      ],
      { headerRow: 0 },
    );

    expect(result.events).toEqual([]);
    expect(result.issues).toContainEqual(expect.objectContaining({ code: "missing_column" }));
  });

  it("reports a row where nobody is marked", () => {
    const result = parseNameColumns([
      ["Date", "Devin", "Cindy"],
      ["July 10", "", ""],
      ["July 17", "x", ""],
    ]);

    expect(result.events).toHaveLength(1);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: "missing_names", row: 2 }),
    );
  });

  it("survives rows shorter than the header", () => {
    const result = parseNameColumns([
      ["Date", "Devin", "Cindy", "John"],
      ["July 10", "x"],
      ["July 17"],
    ]);

    expect(result.events).toHaveLength(1);
    expect(result.events[0].peopleNames).toEqual(["Devin"]);
  });
});

describe("fingerprintEvents", () => {
  const GRID = [
    ["Date", "Names"],
    ["July 10", "Devin, Cindy"],
    ["July 17", "John"],
  ];

  it("is stable for identical input", () => {
    const a = fingerprintEvents(parseDateNames(GRID).events);
    const b = fingerprintEvents(parseDateNames(GRID).events);
    expect(a).toBe(b);
  });

  it("is unchanged by name casing or ordering within a row", () => {
    const original = fingerprintEvents(parseDateNames(GRID).events);
    const reworded = fingerprintEvents(
      parseDateNames([
        ["Date", "Names"],
        ["July 10", "cindy, DEVIN"],
        ["July 17", "john"],
      ]).events,
    );
    expect(reworded).toBe(original);
  });

  it("changes when a person is added", () => {
    const original = fingerprintEvents(parseDateNames(GRID).events);
    const changed = fingerprintEvents(
      parseDateNames([
        ["Date", "Names"],
        ["July 10", "Devin, Cindy, Sarah"],
        ["July 17", "John"],
      ]).events,
    );
    expect(changed).not.toBe(original);
  });

  it("changes when a date moves", () => {
    const original = fingerprintEvents(parseDateNames(GRID).events);
    const changed = fingerprintEvents(
      parseDateNames([
        ["Date", "Names"],
        ["July 11", "Devin, Cindy"],
        ["July 17", "John"],
      ]).events,
    );
    expect(changed).not.toBe(original);
  });
});
