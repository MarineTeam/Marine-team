import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Every cron in `vercel.json` must run at most once a day.
 *
 * Vercel's Hobby plan refuses anything more frequent — not at runtime, but at
 * *deploy* time: the whole deployment fails with "Hobby accounts are limited
 * to daily cron jobs". So an hourly schedule added here is not a job that runs
 * too often, it is a site that doesn't go live, and nothing else in the build
 * catches it.
 *
 * If this project moves to a paid plan, this test is the thing to delete —
 * deliberately, rather than by discovering it in a failed deploy.
 */
const config = JSON.parse(readFileSync(new URL("../../vercel.json", import.meta.url), "utf8")) as {
  crons?: { path: string; schedule: string }[];
};

/** A field naming exactly one value: not `*`, a range, a list or a step. */
function isSingleValue(field: string): boolean {
  return /^\d+$/.test(field);
}

describe("the scheduled jobs", () => {
  it("has crons to check", () => {
    // An empty list would make every assertion below pass vacuously.
    expect(config.crons?.length ?? 0).toBeGreaterThan(0);
  });

  it.each((config.crons ?? []).map((cron) => [cron.path, cron.schedule]))(
    "%s (%s) runs at most once a day",
    (_path: string, schedule: string) => {
      const [minute, hour, ...rest] = schedule.split(/\s+/);
      expect(rest).toHaveLength(3);
      // Both the minute and the hour have to be pinned. `15 * * * *` fixes the
      // minute and leaves the hour open, which is hourly — the exact shape
      // that failed a deploy.
      expect([minute, hour].every(isSingleValue)).toBe(true);
    },
  );

  it("doesn't fire two jobs at the same minute", () => {
    // They share one database and one set of function limits; stacking them
    // turns a slow job into two slow jobs.
    const times = (config.crons ?? []).map((cron) => cron.schedule.split(/\s+/).slice(0, 2).join(":"));
    expect(new Set(times).size).toBe(times.length);
  });
});
