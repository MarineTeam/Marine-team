import { describe, it, expect } from "vitest";
import {
  averageOf,
  childrenShare,
  dayTotal,
  isCounted,
  knownGatherings,
  oddness,
  totalOf,
  trendLabel,
  trendOf,
  uncountedWeeks,
  weeklySeries,
  weekStart,
  worthChasing,
  type CountRow,
  type WeekPoint,
} from "./service-attendance";

const row = (over: Partial<CountRow> = {}): CountRow => ({
  date: "2026-09-20",
  gathering: "10:30",
  adults: 100,
  children: 20,
  visitors: 5,
  note: null,
  ...over,
});

const point = (week: string, total: number | null): WeekPoint => ({
  week,
  total,
  gatherings: total === null ? 0 : 1,
});

describe("totalOf", () => {
  it("adds the parts", () => {
    expect(totalOf({ adults: 100, children: 20 })).toBe(120);
  });

  it("never adds visitors — they were already counted", () => {
    // The single easiest way to make this whole feature quietly wrong: a
    // visitor is an adult or a child who was there.
    expect(totalOf(row({ visitors: 40 }))).toBe(120);
    expect(totalOf(row({ visitors: 0 }))).toBe(120);
  });

  it("counts one part when only one was taken", () => {
    expect(totalOf({ adults: 100, children: null })).toBe(100);
    expect(totalOf({ adults: null, children: 20 })).toBe(20);
  });

  it("says nothing rather than zero when nobody counted", () => {
    // A zero is a claim that nobody came.
    expect(totalOf({ adults: null, children: null })).toBeNull();
    expect(isCounted({ adults: null, children: null })).toBe(false);
  });

  it("keeps a real zero, which is a different fact", () => {
    // A cancelled service that somebody counted as nought is a count.
    expect(totalOf({ adults: 0, children: 0 })).toBe(0);
    expect(isCounted({ adults: 0, children: 0 })).toBe(true);
  });
});

describe("dayTotal", () => {
  it("adds the gatherings on one day", () => {
    const rows = [row({ gathering: "10:30" }), row({ gathering: "Evening", adults: 40, children: 0 })];
    expect(dayTotal(rows, "2026-09-20")).toBe(160);
  });

  it("ignores another day", () => {
    expect(dayTotal([row({ date: "2026-09-13" })], "2026-09-20")).toBeNull();
  });

  it("is null when the day has only uncounted rows", () => {
    expect(dayTotal([row({ adults: null, children: null })], "2026-09-20")).toBeNull();
  });
});

describe("weekStart", () => {
  it("puts a Sunday morning and that Sunday evening in one week", () => {
    expect(weekStart("2026-09-20")).toBe(weekStart("2026-09-20"));
  });

  it("runs Monday to Sunday", () => {
    // 2026-09-21 is a Monday; the Sunday before it belongs to the week before.
    expect(weekStart("2026-09-21")).toBe("2026-09-21");
    expect(weekStart("2026-09-20")).toBe("2026-09-14");
    expect(weekStart("2026-09-27")).toBe("2026-09-21");
  });
});

describe("weeklySeries", () => {
  it("emits a point per week, including the empty ones", () => {
    // A chart that silently omits them draws a continuous line through a month
    // nobody measured, which is a more confident lie than leaving a hole.
    const rows = [row({ date: "2026-09-06" }), row({ date: "2026-09-20" })];
    const series = weeklySeries(rows, "2026-09-01", "2026-09-27");
    expect(series.map((p) => p.total)).toEqual([120, null, 120, null]);
  });

  it("adds the gatherings within a week", () => {
    const rows = [
      row({ date: "2026-09-20", gathering: "10:30" }),
      row({ date: "2026-09-20", gathering: "Evening", adults: 30, children: null }),
    ];
    const series = weeklySeries(rows, "2026-09-14", "2026-09-20");
    expect(series[0]).toEqual({ week: "2026-09-14", total: 150, gatherings: 2 });
  });

  it("stops rather than running away on a silly span", () => {
    expect(weeklySeries([], "2000-01-01", "2026-01-01", 10)).toHaveLength(10);
  });
});

describe("averageOf", () => {
  it("skips the weeks nobody counted rather than dividing by them", () => {
    const average = averageOf([point("a", 100), point("b", null), point("c", 200)]);
    expect(average?.mean).toBe(150);
  });

  it("says how many weeks it actually had", () => {
    // An average over three of the last twelve weeks is a different claim from
    // an average over twelve, and one that hides which will be quoted as the
    // second.
    const average = averageOf([point("a", 100), point("b", null), point("c", 200)]);
    expect(average).toMatchObject({ weeksCounted: 2, weeksMissing: 1 });
  });

  it("is null rather than zero with nothing to average", () => {
    expect(averageOf([point("a", null)])).toBeNull();
    expect(averageOf([])).toBeNull();
  });
});

describe("trendOf", () => {
  const run = (totals: (number | null)[]) =>
    totals.map((total, index) => point(`2026-0${index}`, total));

  it("compares spans, not Sundays", () => {
    const trend = trendOf(run([100, 100, 100, 100, 150, 150, 150, 150]), 4);
    expect(trend.known).toBe(true);
    if (!trend.known) return;
    expect(trend.direction).toBe("up");
    expect(Math.round(trend.change * 100)).toBe(50);
  });

  it("calls a small wobble level rather than growth", () => {
    // A system reporting a 1% rise as growth trains people to ignore it
    // reporting a 20% fall.
    const trend = trendOf(run([100, 100, 100, 100, 101, 102, 101, 102]), 4);
    expect(trend.known && trend.direction).toBe("level");
  });

  it("notices a real fall", () => {
    const trend = trendOf(run([200, 200, 200, 200, 100, 100, 100, 100]), 4);
    expect(trend.known && trend.direction).toBe("down");
  });

  it("refuses to answer on thin data instead of answering badly", () => {
    const trend = trendOf(run([100, null, null, null, 150, null, null, null]), 4);
    expect(trend.known).toBe(false);
  });

  it("refuses when the recent span is thin, even with plenty to compare against", () => {
    // The mutant that dropped this guard survived every other case here,
    // because they were all thin at *both* ends and the other branch caught
    // them. One counted week is not a trend however much history sits behind
    // it.
    const trend = trendOf(run([100, 100, 100, 100, 150, null, null, null]), 4);
    expect(trend.known).toBe(false);
    if (trend.known) return;
    expect(trend.reason).toMatch(/not enough/i);
  });

  it("refuses when there is nothing far enough back", () => {
    const trend = trendOf(run([100, 100, 100, 100]), 4);
    expect(trend.known).toBe(false);
    if (trend.known) return;
    expect(trend.reason).toMatch(/compare/i);
  });

  it("ignores the missing weeks rather than reading them as a collapse", () => {
    const trend = trendOf(run([100, 100, 100, null, 100, 100, 100, null]), 4);
    expect(trend.known && trend.direction).toBe("level");
  });
});

describe("trendLabel", () => {
  it("says what it does not know", () => {
    expect(trendLabel({ known: false, reason: "Not enough counted weeks yet to say." })).toMatch(/not enough/i);
  });

  it("reads as a sentence", () => {
    expect(
      trendLabel({ known: true, recent: 150, previous: 100, change: 0.5, direction: "up" }),
    ).toBe("About 150 a week, up 50% on the weeks before.");
    expect(
      trendLabel({ known: true, recent: 120, previous: 119, change: 0.008, direction: "level" }),
    ).toBe("Holding at about 120 a week.");
  });
});

describe("childrenShare", () => {
  it("uses only the weeks where both parts were counted", () => {
    // A week where somebody wrote 120 and did not split it would otherwise
    // drag the proportion down and read as a collapse that never happened.
    const rows = [
      row({ adults: 80, children: 20 }),
      row({ adults: 120, children: null }),
    ];
    expect(childrenShare(rows)).toBeCloseTo(0.2);
  });

  it("is null when nothing was ever split", () => {
    expect(childrenShare([row({ children: null })])).toBeNull();
  });

  it("copes with a counted week where nobody came", () => {
    expect(childrenShare([row({ adults: 0, children: 0 })])).toBeNull();
  });
});

describe("uncountedWeeks", () => {
  it("names the gaps, most recent first", () => {
    const points = [point("2026-09-07", 100), point("2026-09-14", null), point("2026-09-21", null)];
    expect(uncountedWeeks(points)).toEqual(["2026-09-21", "2026-09-14"]);
  });

  it("is empty when everything was counted", () => {
    expect(uncountedWeeks([point("2026-09-07", 100)])).toEqual([]);
  });
});

describe("oddness", () => {
  const usual = [point("a", 100), point("b", 100), point("c", 100)];

  it("catches the double-count before it is saved", () => {
    const warning = oddness({ adults: 50, children: 10, visitors: 80 }, usual);
    expect(warning).toMatch(/within the 60/);
  });

  it("queries a wildly high count without refusing it", () => {
    // Easter really is three times a normal Sunday, and a checker that refuses
    // the true number is one somebody works around by not recording Easter.
    expect(oddness({ adults: 300, children: 0, visitors: null }, usual)).toMatch(/double/i);
  });

  it("queries a wildly low one", () => {
    expect(oddness({ adults: 20, children: 0, visitors: null }, usual)).toMatch(/half/i);
  });

  it("says nothing about an ordinary week", () => {
    expect(oddness({ adults: 90, children: 15, visitors: 4 }, usual)).toBeNull();
  });

  it("leaves a merely good week alone — the bar is double, not a bit over", () => {
    // A checker that queries every above-average Sunday is one whose warnings
    // stop being read. Half as many again is a good week, not a typo.
    expect(oddness({ adults: 130, children: 20, visitors: 6 }, usual)).toBeNull();
    expect(oddness({ adults: 60, children: 10, visitors: 2 }, usual)).toBeNull();
  });

  it("says nothing when there is no history to judge against", () => {
    expect(oddness({ adults: 900, children: 0, visitors: null }, [point("a", 100)])).toBeNull();
  });

  it("says nothing about a row with no count in it", () => {
    expect(oddness({ adults: null, children: null, visitors: null }, usual)).toBeNull();
  });
});

describe("knownGatherings", () => {
  it("offers what the church actually holds, most used first", () => {
    // So "10:30" does not become "10.30" and then three lines on one chart.
    const rows = [
      row({ gathering: "10:30" }),
      row({ gathering: "Evening" }),
      row({ gathering: "10:30" }),
    ];
    expect(knownGatherings(rows)).toEqual(["10:30", "Evening"]);
  });

  it("orders by use, not alphabetically", () => {
    // The previous case could not tell the two apart: "10:30" sorts first
    // either way. Here the most-used gathering sorts last alphabetically.
    const rows = [
      row({ gathering: "Evening" }),
      row({ gathering: "Evening" }),
      row({ gathering: "10:30" }),
    ];
    expect(knownGatherings(rows)).toEqual(["Evening", "10:30"]);
  });

  it("has nothing to offer at the start", () => {
    expect(knownGatherings([])).toEqual([]);
  });
});

describe("worthChasing", () => {
  it("chases a recent week", () => {
    expect(worthChasing("2026-09-14", "2026-09-21")).toBe(true);
  });

  it("gives up on one far enough back", () => {
    expect(worthChasing("2026-01-05", "2026-09-21")).toBe(false);
  });

  it("does not chase a week that hasn't happened", () => {
    expect(worthChasing("2026-10-05", "2026-09-21")).toBe(false);
  });
});
