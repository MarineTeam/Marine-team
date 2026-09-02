import { describe, it, expect } from "vitest";
import { describeRule, parseRule } from "./recurrence";
import {
  HORIZON_DAYS,
  monthPositionOf,
  ruleFromChoices,
  datesToCreate,
  describeSeries,
  horizonEnd,
  planOccurrences,
  seriesProblems,
  stopSeriesPlan,
  type SeriesShape,
} from "./event-series";

const weekly: SeriesShape = {
  rule: "FREQ=WEEKLY;BYDAY=TU",
  timeZone: "Europe/London",
  startDate: "2026-01-06",
  startTime: "19:30",
  durationMinutes: 90,
  allDay: false,
  opensDaysBefore: null,
  closesDaysBefore: null,
};

const shown = (instant: Date) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    dateStyle: "short",
    timeStyle: "short",
    hourCycle: "h23",
  }).format(instant);

describe("planOccurrences", () => {
  it("keeps the wall clock the same on both sides of a clock change", () => {
    // The reason the series stores a time and a zone rather than instants: a
    // Bible study at 19:30 is at 19:30 in February and in July.
    const dates = planOccurrences(weekly, "2026-03-20", "2026-04-05");
    expect(dates.map((d) => d.date)).toEqual(["2026-03-24", "2026-03-31"]);
    expect(dates.map((d) => shown(d.startsAt))).toEqual(["24/03/2026, 19:30", "31/03/2026, 19:30"]);
    // ...and they are genuinely different offsets from UTC either side of it.
    expect(dates[0].startsAt.toISOString()).toBe("2026-03-24T19:30:00.000Z");
    expect(dates[1].startsAt.toISOString()).toBe("2026-03-31T18:30:00.000Z");
  });

  it("ends each occurrence its own length later", () => {
    const [first] = planOccurrences(weekly, "2026-01-06", "2026-01-06");
    expect(first.endsAt).not.toBeNull();
    expect(first.endsAt!.getTime() - first.startsAt.getTime()).toBe(90 * 60_000);
  });

  it("leaves the finish open when no length is given", () => {
    const [first] = planOccurrences({ ...weekly, durationMinutes: null }, "2026-01-06", "2026-01-06");
    expect(first.endsAt).toBeNull();
  });

  it("starts an all-day occurrence at local midnight, whatever the stored time says", () => {
    const [first] = planOccurrences(
      { ...weekly, allDay: true, startTime: "19:30" },
      "2026-07-07",
      "2026-07-07",
    );
    expect(shown(first.startsAt)).toBe("07/07/2026, 00:00");
  });

  it("moves the sign-up window with each date rather than copying one pair of instants", () => {
    // A repeating event with an absolute window would close December's
    // sign-up in September.
    const series = { ...weekly, opensDaysBefore: 14, closesDaysBefore: 2 };
    const [january, july] = [
      planOccurrences(series, "2026-01-06", "2026-01-06")[0],
      planOccurrences(series, "2026-07-07", "2026-07-07")[0],
    ];
    expect(shown(january.opensAt!)).toBe("23/12/2025, 00:00");
    expect(shown(july.opensAt!)).toBe("23/06/2026, 00:00");
    // "Closes two days before" means the end of that day, so sign-up is still
    // open all through the Sunday for a Tuesday meeting.
    expect(shown(january.closesAt!)).toBe("05/01/2026, 00:00");
  });

  it("closes at the end of the event's own day when told zero days before", () => {
    const [first] = planOccurrences({ ...weekly, closesDaysBefore: 0 }, "2026-01-06", "2026-01-06");
    expect(shown(first.closesAt!)).toBe("07/01/2026, 00:00");
  });

  it("leaves the window open at both ends when neither is set", () => {
    const [first] = planOccurrences(weekly, "2026-01-06", "2026-01-06");
    expect(first.opensAt).toBeNull();
    expect(first.closesAt).toBeNull();
  });
});

describe("datesToCreate", () => {
  const planned = planOccurrences(weekly, "2026-01-06", "2026-01-27");

  it("skips what already exists", () => {
    const todo = datesToCreate(planned, ["2026-01-06", "2026-01-13"], []);
    expect(todo.map((o) => o.date)).toEqual(["2026-01-20", "2026-01-27"]);
  });

  it("does not put back a date somebody took out", () => {
    // Without this the generator would see a gap in the rule and helpfully
    // restore the meeting that was cancelled.
    const todo = datesToCreate(planned, [], ["2026-01-13"]);
    expect(todo.map((o) => o.date)).toEqual(["2026-01-06", "2026-01-20", "2026-01-27"]);
  });

  it("is a no-op when everything is already there", () => {
    expect(datesToCreate(planned, planned.map((o) => o.date), [])).toEqual([]);
  });
});

describe("stopSeriesPlan", () => {
  const today = "2026-06-01";

  it("never deletes an occurrence somebody signed up for", () => {
    // The rule the whole feature turns on: unscheduling is not a way to break
    // a promise made to a person.
    const plan = stopSeriesPlan(
      [
        { id: "past-empty", date: "2026-05-25", registrations: 0 },
        { id: "past-booked", date: "2026-05-26", registrations: 3 },
        { id: "future-empty", date: "2026-06-08", registrations: 0 },
        { id: "future-booked", date: "2026-06-15", registrations: 1 },
      ],
      today,
    );
    expect(plan.remove).toEqual(["future-empty"]);
    expect(plan.keep).toEqual(["past-empty", "past-booked", "future-booked"]);
  });

  it("counts today as still to come", () => {
    const plan = stopSeriesPlan([{ id: "today", date: today, registrations: 0 }], today);
    expect(plan.remove).toEqual(["today"]);
  });

  it("keeps the past even when nobody came", () => {
    const plan = stopSeriesPlan([{ id: "old", date: "2025-01-01", registrations: 0 }], today);
    expect(plan.keep).toEqual(["old"]);
  });
});

describe("seriesProblems", () => {
  it("passes a series that is fit to save", () => {
    expect(seriesProblems(weekly)).toEqual([]);
  });

  it("catches a rule it cannot expand", () => {
    expect(seriesProblems({ ...weekly, rule: "FREQ=HOURLY" })).toEqual([expect.stringContaining("FREQ")]);
  });

  it("catches a time zone that doesn't exist", () => {
    expect(seriesProblems({ ...weekly, timeZone: "Europe/Londn" })).toEqual([
      expect.stringContaining("Unknown time zone"),
    ]);
  });

  it("wants a time unless it is all day", () => {
    expect(seriesProblems({ ...weekly, startTime: null })).toEqual([expect.stringContaining("start time")]);
    expect(seriesProblems({ ...weekly, startTime: null, allDay: true })).toEqual([]);
  });

  it("catches a sign-up window that shuts before it opens", () => {
    // Two numbers that are each fine on their own; only together are they wrong.
    expect(seriesProblems({ ...weekly, opensDaysBefore: 7, closesDaysBefore: 14 })).toEqual([
      "Sign-up would close before it opened",
    ]);
    expect(seriesProblems({ ...weekly, opensDaysBefore: 14, closesDaysBefore: 7 })).toEqual([]);
  });

  it("reports everything wrong at once, not just the first", () => {
    expect(seriesProblems({ ...weekly, rule: "nonsense", timeZone: "Nowhere/Here", startTime: null }).length).toBe(3);
  });
});

describe("describeSeries", () => {
  it("says it the way somebody would", () => {
    expect(describeSeries(weekly)).toBe("Every Tuesday, 19:30");
    expect(describeSeries({ ...weekly, allDay: true })).toBe("Every Tuesday");
    expect(describeSeries({ ...weekly, rule: "FREQ=MONTHLY;BYDAY=1SU", startTime: "10:30" })).toBe(
      "Every month on the first Sunday, 10:30",
    );
  });

  it("says something rather than throwing on a rule that can't be read", () => {
    expect(describeSeries({ ...weekly, rule: "broken" })).toBe("Repeats");
  });
});

describe("horizonEnd", () => {
  it("looks half a year ahead", () => {
    expect(horizonEnd("2026-01-01")).toBe("2026-06-30");
    expect(HORIZON_DAYS).toBe(180);
  });
});

describe("ruleFromChoices", () => {
  const choices = {
    shape: "WEEKLY" as const,
    interval: 1,
    weekdays: [] as const,
    startDate: "2026-09-06",
    ends: { kind: "never" } as const,
  };

  it("falls back to the day the first date lands on", () => {
    // Somebody who picked a Sunday has already said "Sundays"; making them
    // tick the box as well is how the two come to disagree.
    expect(ruleFromChoices(choices)).toBe("FREQ=WEEKLY;BYDAY=SU");
  });

  it("orders the days it was given, whatever order they were clicked in", () => {
    expect(ruleFromChoices({ ...choices, weekdays: ["FR", "TU"] })).toBe("FREQ=WEEKLY;BYDAY=TU,FR");
  });

  it("reads the monthly shapes off the first date", () => {
    // 6 September 2026 is the first Sunday, and September has four of them.
    expect(ruleFromChoices({ ...choices, shape: "MONTHLY_DAY" })).toBe("FREQ=MONTHLY;BYMONTHDAY=6");
    expect(ruleFromChoices({ ...choices, shape: "MONTHLY_WEEKDAY" })).toBe("FREQ=MONTHLY;BYDAY=1SU");
    expect(ruleFromChoices({ ...choices, shape: "MONTHLY_LAST_WEEKDAY" })).toBe("FREQ=MONTHLY;BYDAY=-1SU");
  });

  it("carries the interval and the ending", () => {
    expect(ruleFromChoices({ ...choices, interval: 2 })).toBe("FREQ=WEEKLY;INTERVAL=2;BYDAY=SU");
    expect(ruleFromChoices({ ...choices, ends: { kind: "count", count: 6 } })).toBe("FREQ=WEEKLY;BYDAY=SU;COUNT=6");
    expect(ruleFromChoices({ ...choices, ends: { kind: "until", until: "2026-12-25" } })).toBe(
      "FREQ=WEEKLY;BYDAY=SU;UNTIL=20261225",
    );
  });

  it("only ever builds rules the parser accepts", () => {
    // The form and the reader are two halves of one thing; this is what stops
    // them drifting apart.
    const shapes = ["DAILY", "WEEKLY", "MONTHLY_DAY", "MONTHLY_WEEKDAY", "MONTHLY_LAST_WEEKDAY"] as const;
    const endings = [
      { kind: "never" },
      { kind: "count", count: 3 },
      { kind: "until", until: "2027-01-01" },
    ] as const;
    for (const shape of shapes) {
      for (const ends of endings) {
        for (const startDate of ["2026-09-06", "2026-01-31", "2026-02-28", "2024-02-29"]) {
          const rule = ruleFromChoices({ ...choices, shape, ends, startDate, interval: 2 });
          expect(() => parseRule(rule), rule).not.toThrow();
          expect(describeRule(parseRule(rule), startDate)).not.toBe("");
        }
      }
    }
  });
});

describe("monthPositionOf", () => {
  it("knows which weekday of the month a date is", () => {
    expect(monthPositionOf("2026-09-06")).toEqual({ weekday: "SU", nth: 1, isLast: false });
    expect(monthPositionOf("2026-09-27")).toEqual({ weekday: "SU", nth: 4, isLast: true });
    expect(monthPositionOf("2026-01-31")).toEqual({ weekday: "SA", nth: 5, isLast: true });
  });
});
