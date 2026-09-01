import { describe, expect, it } from "vitest";
import { assignmentRole, isBlockedOut, personName } from "./rota";

const away = [{ startDate: new Date("2026-08-03"), endDate: new Date("2026-08-05") }];

describe("isBlockedOut", () => {
  it("covers both ends of the range, because that is how people say it", () => {
    expect(isBlockedOut(away, new Date("2026-08-03T09:00:00Z"))).toBe(true);
    expect(isBlockedOut(away, new Date("2026-08-05T23:00:00Z"))).toBe(true);
  });

  it("doesn't cover the days either side", () => {
    expect(isBlockedOut(away, new Date("2026-08-02T23:00:00Z"))).toBe(false);
    expect(isBlockedOut(away, new Date("2026-08-06T00:30:00Z"))).toBe(false);
  });

  // A plan with no date yet can't clash with anything; treating it as a clash
  // would grey out every volunteer on a plan that hasn't been dated.
  it("says nothing about a service with no date", () => {
    expect(isBlockedOut(away, null)).toBe(false);
  });

  it("is false for somebody with no blockouts", () => {
    expect(isBlockedOut([], new Date("2026-08-04"))).toBe(false);
  });
});

describe("assignmentRole", () => {
  it("uses the job where one was written down", () => {
    expect(assignmentRole({ position: "Piano", team: { name: "Musicians" } })).toBe("Piano");
  });

  it("falls back to the team, so a row is never nameless", () => {
    expect(assignmentRole({ position: "", team: { name: "Welcome" } })).toBe("Welcome");
    expect(assignmentRole({ position: "   ", team: { name: "Welcome" } })).toBe("Welcome");
  });
});

describe("personName", () => {
  it("prefers the name somebody chose for themselves", () => {
    expect(personName({ displayName: "Dev", name: "Devin L", email: "d@example.com" })).toBe("Dev");
    expect(personName({ displayName: null, name: "Devin L", email: "d@example.com" })).toBe("Devin L");
    expect(personName({ displayName: null, name: null, email: "d@example.com" })).toBe("d@example.com");
  });
});
