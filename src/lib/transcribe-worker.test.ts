import { describe, expect, it } from "vitest";
import { hasTimeForAnother } from "./transcribe-worker";

/**
 * The rule that decides how much of the queue one daily run gets through.
 *
 * It used to be "one", on an hourly cron. On a plan that allows a cron only
 * once a day that would be one video a day, so the bound became the function's
 * own time limit instead.
 */
describe("hasTimeForAnother", () => {
  it("always allows the first, since nothing has been timed yet", () => {
    expect(hasTimeForAnother(0, 0, 50_000)).toBe(true);
  });

  it("allows another when the slowest so far would still fit", () => {
    expect(hasTimeForAnother(20_000, 15_000, 50_000)).toBe(true);
  });

  it("stops when it wouldn't", () => {
    expect(hasTimeForAnother(40_000, 15_000, 50_000)).toBe(false);
  });

  it("allows one that fits exactly", () => {
    expect(hasTimeForAnother(35_000, 15_000, 50_000)).toBe(true);
  });

  it("stops once the budget is spent, whatever the estimate", () => {
    expect(hasTimeForAnother(50_001, 0, 50_000)).toBe(false);
  });
});
