import { addIsoDays, compareIsoDates, isoDayDifference, type IsoDate } from "@/lib/dates";

/**
 * How many people were here — the rules, with no database near them.
 *
 * The app could already say which sermon was watched most and which hymn this
 * congregation actually looks up. It could not say how many people were in the
 * building on Sunday, which is the denominator under every other number it
 * keeps: giving, check-in, group rolls and follow-ups are each a figure with no
 * population to divide by.
 *
 * Four decisions run through this file.
 *
 *   1. **A count is taken, not inferred.** Nothing here derives a headcount
 *      from check-ins or sign-ins. Counting digital traces undercounts exactly
 *      the people a church most needs to notice.
 *   2. **Visitors are a subset, not an addend.** A visitor is an adult or a
 *      child who was there. Adding them to the total counts them twice, and it
 *      is the single easiest way to make this whole feature quietly wrong.
 *   3. **Missing is missing.** A week nobody counted is `null`, never zero, all
 *      the way through — including out of the averages, which skip it rather
 *      than divide by it. A zero is a claim that nobody came.
 *   4. **Trends, not weeks.** Weather, half-term and one large funeral each
 *      move a single Sunday enough to mean nothing. Everything that reads as a
 *      judgement is computed over a span.
 */

export type CountRow = {
  date: IsoDate;
  gathering: string;
  adults: number | null;
  children: number | null;
  visitors: number | null;
  note: string | null;
};

/**
 * How many people that row accounts for, or null when nobody counted.
 *
 * Visitors are deliberately absent from this sum — see the file comment. A row
 * with children counted and adults not is still a count of something, so the
 * total is the sum of what is there; only a row with neither is unknown.
 */
export function totalOf(row: Pick<CountRow, "adults" | "children">): number | null {
  if (row.adults === null && row.children === null) return null;
  return (row.adults ?? 0) + (row.children ?? 0);
}

/** Whether anybody counted this one at all. */
export function isCounted(row: Pick<CountRow, "adults" | "children">): boolean {
  return totalOf(row) !== null;
}

/**
 * Everybody who was there on one day, across its gatherings.
 *
 * Summed rather than averaged: a church with a morning and an evening service
 * had both congregations, and the people who came to both are a rounding error
 * against the cost of pretending the evening did not happen.
 */
export function dayTotal(rows: readonly CountRow[], date: IsoDate): number | null {
  const onDay = rows.filter((row) => row.date === date && isCounted(row));
  if (onDay.length === 0) return null;
  return onDay.reduce((sum, row) => sum + (totalOf(row) ?? 0), 0);
}

/** The Monday of the week a date falls in, as the key a chart groups by. */
export function weekStart(date: IsoDate): IsoDate {
  // getUTCDay: 0 is Sunday. A church week that runs Monday to Sunday keeps a
  // Sunday morning and the Sunday evening after it in the same bar.
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return addIsoDays(date, -((day + 6) % 7));
}

export type WeekPoint = { week: IsoDate; total: number | null; gatherings: number };

/**
 * One point per week across a span, gaps included.
 *
 * Uncounted weeks are emitted with a null total rather than dropped. A chart
 * that silently omits them draws a continuous line through a month nobody
 * measured, which is a more confident lie than leaving a hole.
 */
export function weeklySeries(
  rows: readonly CountRow[],
  from: IsoDate,
  to: IsoDate,
  maxWeeks = 260,
): WeekPoint[] {
  const points: WeekPoint[] = [];
  let cursor = weekStart(from);
  const end = weekStart(to);

  while (compareIsoDates(cursor, end) <= 0 && points.length < maxWeeks) {
    const week = cursor;
    const inWeek = rows.filter((row) => weekStart(row.date) === week && isCounted(row));
    points.push({
      week,
      total: inWeek.length === 0 ? null : inWeek.reduce((sum, row) => sum + (totalOf(row) ?? 0), 0),
      gatherings: inWeek.length,
    });
    cursor = addIsoDays(cursor, 7);
  }
  return points;
}

export type Average = { mean: number; weeksCounted: number; weeksMissing: number };

/**
 * The average over a run of weeks, skipping the ones nobody counted.
 *
 * Reports how many weeks it actually had, because an average over three of the
 * last twelve weeks is a different claim from an average over twelve, and a
 * figure that hides which one it is will be quoted as though it were the
 * second. Returns null rather than zero when there is nothing to average.
 */
export function averageOf(points: readonly WeekPoint[]): Average | null {
  const counted = points.filter((point) => point.total !== null);
  if (counted.length === 0) return null;
  return {
    mean: counted.reduce((sum, point) => sum + (point.total ?? 0), 0) / counted.length,
    weeksCounted: counted.length,
    weeksMissing: points.length - counted.length,
  };
}

export type Trend =
  | { known: false; reason: string }
  | { known: true; recent: number; previous: number; change: number; direction: "up" | "down" | "level" };

/**
 * Where attendance is going, over two spans rather than two Sundays.
 *
 * Refuses to answer on thin data instead of answering badly: a trend drawn
 * from two counted weeks is noise with a percentage attached, and a church
 * will act on it exactly as though it were not.
 *
 * "Level" is a band, not a point. Congregations do not hold still to the
 * nearest person, and a system reporting a 1% rise as growth trains people to
 * ignore it reporting a 20% fall.
 */
export function trendOf(
  points: readonly WeekPoint[],
  span = 8,
  minimumWeeks = 3,
  levelBand = 0.05,
): Trend {
  const recentPoints = points.slice(-span);
  const previousPoints = points.slice(-span * 2, -span);

  const recent = averageOf(recentPoints);
  const previous = averageOf(previousPoints);
  if (!recent || recent.weeksCounted < minimumWeeks) {
    return { known: false, reason: "Not enough counted weeks yet to say." };
  }
  if (!previous || previous.weeksCounted < minimumWeeks) {
    return { known: false, reason: "Nothing far enough back to compare with." };
  }

  const change = (recent.mean - previous.mean) / previous.mean;
  return {
    known: true,
    recent: recent.mean,
    previous: previous.mean,
    change,
    direction: Math.abs(change) < levelBand ? "level" : change > 0 ? "up" : "down",
  };
}

/** How a trend reads in a sentence. */
export function trendLabel(trend: Trend): string {
  if (!trend.known) return trend.reason;
  const percent = Math.round(Math.abs(trend.change) * 100);
  const recent = Math.round(trend.recent);
  if (trend.direction === "level") return `Holding at about ${recent} a week.`;
  return `About ${recent} a week, ${trend.direction} ${percent}% on the weeks before.`;
}

/**
 * The share of the congregation that is children, over a span.
 *
 * Computed from the weeks where **both** parts were counted, not from the
 * totals: a week where somebody wrote down 120 and did not split it would
 * otherwise drag the proportion towards zero and read as a collapse in the
 * children's work that never happened.
 */
export function childrenShare(rows: readonly CountRow[]): number | null {
  const split = rows.filter((row) => row.adults !== null && row.children !== null);
  if (split.length === 0) return null;
  const children = split.reduce((sum, row) => sum + (row.children ?? 0), 0);
  const everyone = split.reduce((sum, row) => sum + (totalOf(row) ?? 0), 0);
  return everyone === 0 ? null : children / everyone;
}

/**
 * Weeks in a span that nobody counted, most recent first.
 *
 * The thing that makes the rest trustworthy. A church seeing "you haven't
 * counted for three weeks" fixes it; one seeing a chart with an unexplained
 * dip argues about the dip.
 */
export function uncountedWeeks(points: readonly WeekPoint[]): IsoDate[] {
  return points
    .filter((point) => point.total === null)
    .map((point) => point.week)
    .sort((a, b) => compareIsoDates(b, a));
}

/**
 * Whether a count is worth querying before it is saved.
 *
 * Advisory, never a refusal — like the room capacity warning. Easter really is
 * three times a normal Sunday, and a checker that refuses the true number is
 * one somebody works around by not recording Easter.
 */
export function oddness(
  proposed: Pick<CountRow, "adults" | "children" | "visitors">,
  recent: readonly WeekPoint[],
): string | null {
  const total = totalOf(proposed);
  if (total === null) return null;

  if (proposed.visitors !== null && proposed.visitors > total) {
    // Not a judgement about plausibility — it is arithmetically impossible,
    // and almost always means somebody read "of whom visiting" as "plus".
    return `More visitors than people: visitors are counted within the ${total}, not added to it.`;
  }

  const average = averageOf(recent);
  if (!average || average.weeksCounted < 3) return null;
  if (total > average.mean * 2) return `That's more than double the usual ${Math.round(average.mean)}. Worth a second look.`;
  if (total * 2 < average.mean) return `That's less than half the usual ${Math.round(average.mean)}. Worth a second look.`;
  return null;
}

/**
 * The gatherings a church actually holds, most used first.
 *
 * Offered as suggestions when somebody types a new count, so "10:30" does not
 * become "10.30" and then "1030" and then three separate lines on the chart.
 */
export function knownGatherings(rows: readonly CountRow[]): string[] {
  const seen = new Map<string, number>();
  for (const row of rows) seen.set(row.gathering, (seen.get(row.gathering) ?? 0) + 1);
  return [...seen.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([gathering]) => gathering);
}

/** Whether a date is far enough back that chasing the count is pointless. */
export function worthChasing(week: IsoDate, today: IsoDate, weeks = 6): boolean {
  const away = isoDayDifference(week, today);
  return away >= 0 && away <= weeks * 7;
}
