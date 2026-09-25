import { describe, it, expect } from "vitest";
import {
  AUDITED_READ_KEYS,
  byActor,
  describeRead,
  isNewLook,
  looksAtSubject,
  retentionCutoff,
  type ExistingLook,
  type LookRow,
} from "./read-audit";

const NOW = new Date("2026-09-25T12:00:00Z");
const ago = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000);

const look = (over: Partial<ExistingLook> = {}): ExistingLook => ({
  kind: "giving_list",
  actorEmail: "treasurer@x.test",
  subjectId: null,
  at: ago(1),
  ...over,
});

describe("isNewLook", () => {
  it("records the first look", () => {
    expect(isNewLook({ kind: "giving_list", actorEmail: "treasurer@x.test" }, [], NOW)).toBe(true);
  });

  it("treats a refresh a minute later as the same look", () => {
    // Somebody refreshing five times looked once. Without this the log is
    // unreadable and the write load is absurd.
    expect(isNewLook({ kind: "giving_list", actorEmail: "treasurer@x.test" }, [look()], NOW)).toBe(false);
  });

  it("treats coming back after an hour as a new one", () => {
    expect(
      isNewLook({ kind: "giving_list", actorEmail: "treasurer@x.test" }, [look({ at: ago(60) })], NOW),
    ).toBe(true);
  });

  it("counts the window from the edge, not loosely", () => {
    expect(
      isNewLook({ kind: "giving_list", actorEmail: "treasurer@x.test" }, [look({ at: ago(29) })], NOW),
    ).toBe(false);
    expect(
      isNewLook({ kind: "giving_list", actorEmail: "treasurer@x.test" }, [look({ at: ago(31) })], NOW),
    ).toBe(true);
  });

  it("tells two people apart", () => {
    expect(
      isNewLook({ kind: "giving_list", actorEmail: "pastor@x.test" }, [look()], NOW),
    ).toBe(true);
  });

  it("tells two screens apart", () => {
    expect(
      isNewLook({ kind: "checkin_register", actorEmail: "treasurer@x.test" }, [look()], NOW),
    ).toBe(true);
  });

  it("tells two subjects apart — which household is the whole content", () => {
    // The same officer opening two households in one sitting is two looks.
    const first = look({ kind: "household", subjectId: "h1" });
    expect(
      isNewLook({ kind: "household", actorEmail: "treasurer@x.test", subjectId: "h2" }, [first], NOW),
    ).toBe(true);
    expect(
      isNewLook({ kind: "household", actorEmail: "treasurer@x.test", subjectId: "h1" }, [first], NOW),
    ).toBe(false);
  });

  it("treats an absent subject and a null one as the same", () => {
    expect(isNewLook({ kind: "giving_list", actorEmail: "treasurer@x.test", subjectId: null }, [look()], NOW)).toBe(
      false,
    );
  });

  it("does not let a subjectless look swallow a subject one", () => {
    const listLook = look({ kind: "household", subjectId: null });
    expect(
      isNewLook({ kind: "household", actorEmail: "treasurer@x.test", subjectId: "h1" }, [listLook], NOW),
    ).toBe(true);
  });
});

describe("describeRead", () => {
  it("has words for every kind", () => {
    for (const kind of AUDITED_READ_KEYS) {
      expect(describeRead(kind).length).toBeGreaterThan(3);
    }
  });

  it("never repeats what was read, only what was opened", () => {
    // The log says "the giving records", never "Ruth Bell's £50" — that is what
    // stops an oversight record becoming a second copy of the sensitive data.
    for (const kind of AUDITED_READ_KEYS) {
      expect(describeRead(kind)).not.toMatch(/[£$€]|\d{2,}/);
    }
  });
});

describe("retentionCutoff", () => {
  it("keeps a year", () => {
    expect(retentionCutoff(NOW).toISOString().slice(0, 10)).toBe("2025-09-25");
  });

  it("takes a different span", () => {
    expect(retentionCutoff(NOW, 30).toISOString().slice(0, 10)).toBe("2026-08-26");
  });
});

describe("looksAtSubject", () => {
  const rows: LookRow[] = [
    { kind: "household", actorEmail: "a@x.test", subjectId: "h1", at: ago(10) },
    { kind: "household", actorEmail: "b@x.test", subjectId: "h1", at: ago(5) },
    { kind: "household", actorEmail: "c@x.test", subjectId: "h2", at: ago(1) },
  ];

  it("answers the question a complaint starts with, most recent first", () => {
    expect(looksAtSubject(rows, "h1").map((row) => row.actorEmail)).toEqual(["b@x.test", "a@x.test"]);
  });

  it("says nothing about anybody else's record", () => {
    expect(looksAtSubject(rows, "h1").some((row) => row.subjectId === "h2")).toBe(false);
  });

  it("is empty for a record nobody has opened", () => {
    expect(looksAtSubject(rows, "h9")).toEqual([]);
  });
});

describe("byActor", () => {
  const rows: LookRow[] = [
    { kind: "giving_list", actorEmail: "a@x.test", subjectId: null, at: ago(60) },
    { kind: "household", actorEmail: "a@x.test", subjectId: "h1", at: ago(30) },
    { kind: "household", actorEmail: "a@x.test", subjectId: "h2", at: ago(10) },
    { kind: "checkin_register", actorEmail: "b@x.test", subjectId: null, at: ago(5) },
  ];

  it("totals each person's looks", () => {
    const summary = byActor(rows);
    expect(summary.find((row) => row.actorEmail === "a@x.test")).toMatchObject({
      looks: 3,
      kinds: ["giving_list", "household"],
    });
  });

  it("puts whoever looked most recently first", () => {
    expect(byActor(rows).map((row) => row.actorEmail)).toEqual(["b@x.test", "a@x.test"]);
  });

  it("keeps the latest time, not the first one it saw", () => {
    expect(byActor(rows).find((row) => row.actorEmail === "a@x.test")?.lastAt).toEqual(ago(10));
  });

  it("has nothing to say about nothing", () => {
    expect(byActor([])).toEqual([]);
  });
});
