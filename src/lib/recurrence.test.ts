import { describe, it, expect } from "vitest";
import {
  MAX_OCCURRENCES,
  RecurrenceError,
  dayInZone,
  describeRule,
  formatRule,
  isKnownTimeZone,
  occurrencesBetween,
  parseRule,
  zonedInstant,
} from "./recurrence";

/** The dates a rule lands on, from its start, for a generous window. */
const from = (rule: string, start: string, to = "2030-12-31") =>
  occurrencesBetween(parseRule(rule), start, start, to);

describe("parseRule", () => {
  it("reads the parts a church diary uses", () => {
    expect(parseRule("FREQ=WEEKLY;INTERVAL=2;BYDAY=TU,TH")).toEqual({
      freq: "WEEKLY",
      interval: 2,
      byDay: [
        { weekday: "TU", nth: null },
        { weekday: "TH", nth: null },
      ],
      byMonthDay: [],
      count: null,
      until: null,
    });
  });

  it("accepts the RRULE: prefix an .ics line carries", () => {
    expect(parseRule("RRULE:FREQ=DAILY").freq).toBe("DAILY");
  });

  it("reads a numbered weekday", () => {
    expect(parseRule("FREQ=MONTHLY;BYDAY=-1SA").byDay).toEqual([{ weekday: "SA", nth: -1 }]);
  });

  it("drops the time of day from UNTIL, which is a day here", () => {
    expect(parseRule("FREQ=WEEKLY;UNTIL=20261231T235959Z").until).toBe("2026-12-31");
  });

  it("refuses a part it cannot compute rather than ignoring it", () => {
    // The whole point: a rule that half-works produces dates people turn up on.
    expect(() => parseRule("FREQ=MONTHLY;BYDAY=SU;BYSETPOS=-1")).toThrow(RecurrenceError);
    expect(() => parseRule("FREQ=HOURLY")).toThrow(/Unsupported FREQ/);
    expect(() => parseRule("FREQ=WEEKLY;WKST=MO")).toThrow(/Unsupported rule part/);
  });

  it("refuses the combinations that don't mean what they look like", () => {
    expect(() => parseRule("FREQ=MONTHLY;BYDAY=SU;BYMONTHDAY=15")).toThrow(/not both/);
    expect(() => parseRule("FREQ=WEEKLY;COUNT=4;UNTIL=20261231")).toThrow(/not both/);
    expect(() => parseRule("FREQ=WEEKLY;BYMONTHDAY=15")).toThrow(/makes no sense/);
    expect(() => parseRule("FREQ=WEEKLY;BYDAY=2TU")).toThrow(/monthly or yearly/);
  });

  it("refuses rubbish", () => {
    expect(() => parseRule("")).toThrow(RecurrenceError);
    expect(() => parseRule("FREQ=WEEKLY;INTERVAL=0")).toThrow(RecurrenceError);
    expect(() => parseRule("FREQ=WEEKLY;BYDAY=FUNDAY")).toThrow(RecurrenceError);
    expect(() => parseRule("FREQ=WEEKLY;FREQ=DAILY")).toThrow(/twice/);
    expect(() => parseRule("WEEKLY")).toThrow(RecurrenceError);
  });
});

describe("formatRule", () => {
  it("round-trips every rule this app writes", () => {
    for (const text of [
      "FREQ=DAILY",
      "FREQ=WEEKLY;INTERVAL=2;BYDAY=TU,TH",
      "FREQ=MONTHLY;BYDAY=1SU",
      "FREQ=MONTHLY;BYMONTHDAY=-1",
      "FREQ=WEEKLY;COUNT=6",
      "FREQ=YEARLY;UNTIL=20301225",
    ]) {
      expect(formatRule(parseRule(text))).toBe(text);
    }
  });
});

describe("occurrencesBetween", () => {
  it("always counts the start, even when the rule wouldn't have picked it", () => {
    // Somebody setting up "every Tuesday" from a Thursday meant that Thursday
    // as well. Dropping it moves their first meeting by five days.
    expect(from("FREQ=WEEKLY;BYDAY=TU", "2026-09-03", "2026-09-20")).toEqual([
      "2026-09-03",
      "2026-09-08",
      "2026-09-15",
    ]);
  });

  it("keeps the rest of the starting week", () => {
    // The bug this test exists for: starting a Tuesday-and-Thursday series on
    // the Tuesday, and losing the Thursday two days later because the walk
    // began at the *next* week.
    expect(from("FREQ=WEEKLY;BYDAY=TU,TH", "2026-09-01", "2026-09-11")).toEqual([
      "2026-09-01",
      "2026-09-03",
      "2026-09-08",
      "2026-09-10",
    ]);
  });

  it("counts intervals in whole weeks from the starting week", () => {
    expect(from("FREQ=WEEKLY;INTERVAL=2;BYDAY=WE", "2026-09-02", "2026-10-15")).toEqual([
      "2026-09-02",
      "2026-09-16",
      "2026-09-30",
      "2026-10-14",
    ]);
  });

  it("does the first Sunday of the month", () => {
    expect(from("FREQ=MONTHLY;BYDAY=1SU", "2026-09-06", "2026-12-31")).toEqual([
      "2026-09-06",
      "2026-10-04",
      "2026-11-01",
      "2026-12-06",
    ]);
  });

  it("does the last Saturday, whether the month has four or five", () => {
    expect(from("FREQ=MONTHLY;BYDAY=-1SA", "2026-01-31", "2026-05-01")).toEqual([
      "2026-01-31",
      "2026-02-28",
      "2026-03-28",
      "2026-04-25",
    ]);
  });

  it("skips a month too short for the day, rather than sliding to the 28th", () => {
    // "The 31st" means the 31st. Every calendar application does this, and a
    // February meeting nobody scheduled is worse than a month with none.
    expect(from("FREQ=MONTHLY", "2026-01-31", "2026-06-01")).toEqual([
      "2026-01-31",
      "2026-03-31",
      "2026-05-31",
    ]);
  });

  it("does the last day of every month", () => {
    expect(from("FREQ=MONTHLY;BYMONTHDAY=-1", "2026-01-31", "2026-04-30")).toEqual([
      "2026-01-31",
      "2026-02-28",
      "2026-03-31",
      "2026-04-30",
    ]);
  });

  it("does a yearly date, including one that only exists in leap years", () => {
    expect(from("FREQ=YEARLY", "2024-02-29", "2036-12-31")).toEqual(["2024-02-29", "2028-02-29", "2032-02-29", "2036-02-29"]);
  });

  it("stops at COUNT, counting from the start and not from the window", () => {
    const rule = parseRule("FREQ=WEEKLY;COUNT=3");
    expect(occurrencesBetween(rule, "2026-09-01", "2026-09-01", "2030-12-31")).toEqual([
      "2026-09-01",
      "2026-09-08",
      "2026-09-15",
    ]);
    // Paging forward past the end of a six-week course must not find six more.
    expect(occurrencesBetween(rule, "2026-09-01", "2026-09-09", "2030-12-31")).toEqual(["2026-09-15"]);
  });

  it("stops at UNTIL, inclusive", () => {
    expect(from("FREQ=WEEKLY;UNTIL=20260915", "2026-09-01")).toEqual(["2026-09-01", "2026-09-08", "2026-09-15"]);
  });

  it("answers only the window asked for", () => {
    expect(occurrencesBetween(parseRule("FREQ=DAILY"), "2026-01-01", "2026-03-02", "2026-03-04")).toEqual([
      "2026-03-02",
      "2026-03-03",
      "2026-03-04",
    ]);
  });

  it("gives nothing for a window that ends before it starts", () => {
    expect(occurrencesBetween(parseRule("FREQ=DAILY"), "2026-01-01", "2026-03-04", "2026-03-02")).toEqual([]);
  });

  it("caps a rule that would otherwise answer with a decade of days", () => {
    const dates = occurrencesBetween(parseRule("FREQ=DAILY"), "2026-01-01", "2026-01-01", "2040-01-01");
    expect(dates).toHaveLength(MAX_OCCURRENCES);
  });

  it("gives up on a rule that can never land again", () => {
    // The 5th Monday exists in some months; a rule that matched nothing at all
    // would spin forever looking for the next one.
    const dates = occurrencesBetween(parseRule("FREQ=MONTHLY;BYDAY=5MO"), "2026-03-30", "2026-03-30", "2027-12-31");
    expect(dates[0]).toBe("2026-03-30");
    expect(dates).toContain("2026-06-29");
    expect(dates).not.toContain("2026-04-27");
  });
});

describe("describeRule", () => {
  it("says what a rule means, in words somebody can check", () => {
    const say = (text: string, start?: string) => describeRule(parseRule(text), start);
    expect(say("FREQ=WEEKLY;BYDAY=TU")).toBe("Every Tuesday");
    expect(say("FREQ=WEEKLY;INTERVAL=2;BYDAY=WE")).toBe("Every other week on Wednesday");
    expect(say("FREQ=WEEKLY;BYDAY=TU,TH")).toBe("Every Tuesday and Thursday");
    expect(say("FREQ=WEEKLY", "2026-09-01")).toBe("Every Tuesday");
    expect(say("FREQ=MONTHLY;BYDAY=1SU")).toBe("Every month on the first Sunday");
    expect(say("FREQ=MONTHLY;BYDAY=-1SA")).toBe("Every month on the last Saturday");
    expect(say("FREQ=MONTHLY;BYMONTHDAY=-1")).toBe("Every month on the last day");
    expect(say("FREQ=MONTHLY", "2026-09-03")).toBe("Every month on the 3rd");
    expect(say("FREQ=DAILY;INTERVAL=3")).toBe("Every 3 days");
    expect(say("FREQ=YEARLY")).toBe("Every year");
    expect(say("FREQ=WEEKLY;BYDAY=TU;COUNT=6")).toBe("Every Tuesday, 6 times");
    expect(say("FREQ=WEEKLY;BYDAY=TU;UNTIL=20261231")).toBe("Every Tuesday, until 2026-12-31");
  });

  it("gets the ordinal suffixes right", () => {
    const day = (n: number) => describeRule(parseRule(`FREQ=MONTHLY;BYMONTHDAY=${n}`));
    expect(day(1)).toContain("the 1st");
    expect(day(2)).toContain("the 2nd");
    expect(day(3)).toContain("the 3rd");
    expect(day(4)).toContain("the 4th");
    expect(day(11)).toContain("the 11th");
    expect(day(12)).toContain("the 12th");
    expect(day(13)).toContain("the 13th");
    expect(day(21)).toContain("the 21st");
  });
});

describe("zonedInstant", () => {
  const shown = (instant: Date, timeZone: string) =>
    new Intl.DateTimeFormat("en-GB", {
      timeZone,
      dateStyle: "short",
      timeStyle: "short",
      hourCycle: "h23",
    }).format(instant);

  it("keeps the wall clock across a daylight-saving change", () => {
    // The whole reason this function exists: 19:30 in London is 19:30 in
    // London in January and in July, and two different instants.
    expect(zonedInstant("2026-01-13", "19:30", "Europe/London").toISOString()).toBe("2026-01-13T19:30:00.000Z");
    expect(zonedInstant("2026-07-14", "19:30", "Europe/London").toISOString()).toBe("2026-07-14T18:30:00.000Z");
    expect(shown(zonedInstant("2026-01-13", "19:30", "Europe/London"), "Europe/London")).toBe("13/01/2026, 19:30");
    expect(shown(zonedInstant("2026-07-14", "19:30", "Europe/London"), "Europe/London")).toBe("14/07/2026, 19:30");
  });

  it("works west of Greenwich too", () => {
    expect(shown(zonedInstant("2026-07-14", "19:30", "America/New_York"), "America/New_York")).toBe("14/07/2026, 19:30");
    expect(zonedInstant("2026-07-14", "19:30", "America/New_York").toISOString()).toBe("2026-07-14T23:30:00.000Z");
  });

  it("moves an hour that never happens forward, not backward", () => {
    // 2026-03-29: the UK clocks go from 01:00 to 02:00. 01:30 does not exist.
    // Answering 00:30 would put the meeting before the one anybody set.
    const instant = zonedInstant("2026-03-29", "01:30", "Europe/London");
    expect(shown(instant, "Europe/London")).toBe("29/03/2026, 02:30");
  });

  it("takes the first of an hour that happens twice", () => {
    // 2026-10-25: the UK clocks go back from 02:00 to 01:00, so 01:30 comes
    // round twice. The earlier instant is the first one.
    const instant = zonedInstant("2026-10-25", "01:30", "Europe/London");
    expect(instant.toISOString()).toBe("2026-10-25T00:30:00.000Z");
    expect(shown(instant, "Europe/London")).toBe("25/10/2026, 01:30");
  });

  it("handles a zone whose offset is not a whole hour", () => {
    expect(zonedInstant("2026-07-14", "19:30", "Asia/Kolkata").toISOString()).toBe("2026-07-14T14:00:00.000Z");
  });

  it("treats a zone it doesn't know as UTC rather than throwing", () => {
    // Same choice dates.ts makes: a bad row of settings shouldn't stop a
    // scheduled job doing everything else it was going to do.
    expect(zonedInstant("2026-07-14", "19:30", "Mars/Olympus").toISOString()).toBe("2026-07-14T19:30:00.000Z");
  });

  it("refuses a time of day it can't read", () => {
    expect(() => zonedInstant("2026-07-14", "half seven", "Europe/London")).toThrow(RecurrenceError);
    expect(() => zonedInstant("2026-07-14", "25:00", "Europe/London")).toThrow(RecurrenceError);
  });
});

describe("dayInZone", () => {
  it("gives the local day, which need not be the UTC one", () => {
    // 23:30 in New York on the 14th is 03:30 UTC on the 15th.
    expect(dayInZone(new Date("2026-07-15T03:30:00Z"), "America/New_York")).toBe("2026-07-14");
    expect(dayInZone(new Date("2026-07-15T03:30:00Z"), "UTC")).toBe("2026-07-15");
  });
});

describe("isKnownTimeZone", () => {
  it("knows a real zone from a typo", () => {
    expect(isKnownTimeZone("Europe/London")).toBe(true);
    expect(isKnownTimeZone("UTC")).toBe(true);
    expect(isKnownTimeZone("Europe/Londn")).toBe(false);
  });
});
