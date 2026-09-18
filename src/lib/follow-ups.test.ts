import { describe, it, expect } from "vitest";
import {
  canAct,
  canSee,
  closeWith,
  countQueue,
  defaultDueDays,
  inWorkingOrder,
  newPrompts,
  titleFor,
  urgencyOf,
  visibleFollowUps,
  type FollowUpRow,
} from "./follow-ups";
import type { IsoDate } from "./dates";

const row = (over: Partial<FollowUpRow> = {}): FollowUpRow => ({
  id: "f1", title: "Ring Ruth", status: "OPEN", source: "MANUAL",
  dueOn: "2026-09-20" as IsoDate, assignedToId: null, personId: "p1", ...over,
});

const today = "2026-09-18" as IsoDate;
const office = { userId: "u-office", manages: true };
const mine = { userId: "u-me", manages: false };
const other = { userId: "u-other", manages: false };
const signedOut = { userId: null, manages: false };

describe("canSee", () => {
  it("gives the office the queue", () => {
    expect(canSee(row(), office)).toBe(true);
  });

  it("gives everybody else only what is theirs", () => {
    // A follow-up names somebody and often says why they are being rung.
    expect(canSee(row({ assignedToId: "u-me" }), mine)).toBe(true);
    expect(canSee(row({ assignedToId: "u-me" }), other)).toBe(false);
    expect(canSee(row({ assignedToId: null }), mine)).toBe(false);
    expect(canSee(row(), signedOut)).toBe(false);
  });

  it("filters a list the same way", () => {
    const rows = [row({ id: "a", assignedToId: "u-me" }), row({ id: "b", assignedToId: "u-other" })];
    expect(visibleFollowUps(rows, mine).map((r) => r.id)).toEqual(["a"]);
    expect(visibleFollowUps(rows, office)).toHaveLength(2);
  });

  it("lets whoever may see one act on it", () => {
    expect(canAct(row({ assignedToId: "u-me" }), mine)).toBe(true);
    expect(canAct(row({ assignedToId: "u-me" }), other)).toBe(false);
  });
});

describe("urgencyOf", () => {
  it("names lateness rather than colouring it", () => {
    expect(urgencyOf(row({ dueOn: "2026-09-17" as IsoDate }), today)).toBe("overdue");
    expect(urgencyOf(row({ dueOn: "2026-09-18" as IsoDate }), today)).toBe("today");
    expect(urgencyOf(row({ dueOn: "2026-09-24" as IsoDate }), today)).toBe("soon");
    expect(urgencyOf(row({ dueOn: "2026-10-30" as IsoDate }), today)).toBe("later");
  });

  it("says nothing about something already closed", () => {
    expect(urgencyOf(row({ status: "DONE", dueOn: "2020-01-01" as IsoDate }), today)).toBe("closed");
    expect(urgencyOf(row({ status: "DISMISSED", dueOn: "2020-01-01" as IsoDate }), today)).toBe("closed");
  });
});

describe("inWorkingOrder", () => {
  it("puts overdue first, then today, then soon", () => {
    const rows = [
      row({ id: "later", dueOn: "2026-12-01" as IsoDate }),
      row({ id: "overdue", dueOn: "2026-09-01" as IsoDate }),
      row({ id: "today", dueOn: "2026-09-18" as IsoDate }),
    ];
    expect(inWorkingOrder(rows, today).map((r) => r.id)).toEqual(["overdue", "today", "later"]);
  });

  it("puts what nobody has picked up ahead of what somebody has", () => {
    const rows = [
      row({ id: "claimed", assignedToId: "u-me", dueOn: "2026-09-19" as IsoDate }),
      row({ id: "free", assignedToId: null, dueOn: "2026-09-19" as IsoDate }),
    ];
    expect(inWorkingOrder(rows, today).map((r) => r.id)).toEqual(["free", "claimed"]);
  });

  it("sinks everything closed to the bottom", () => {
    const rows = [row({ id: "done", status: "DONE" }), row({ id: "open" })];
    expect(inWorkingOrder(rows, today).map((r) => r.id)).toEqual(["open", "done"]);
  });

  it("does not mutate the list it was given", () => {
    const rows = [row({ id: "a", dueOn: "2026-12-01" as IsoDate }), row({ id: "b", dueOn: "2026-01-01" as IsoDate })];
    inWorkingOrder(rows, today);
    expect(rows.map((r) => r.id)).toEqual(["a", "b"]);
  });
});

describe("countQueue", () => {
  it("counts what the office needs to know at a glance", () => {
    const rows = [
      row({ dueOn: "2026-09-01" as IsoDate }),
      row({ assignedToId: "u-me" }),
      row({ status: "DONE" }),
      row({ status: "DISMISSED" }),
    ];
    expect(countQueue(rows, today)).toEqual({ open: 2, overdue: 1, unassigned: 1, done: 1, dismissed: 1 });
  });
});

describe("newPrompts", () => {
  const prompts = [
    { source: "FORM" as const, sourceRef: "sub1", title: "a", personId: null, note: null },
    { source: "FORM" as const, sourceRef: "sub2", title: "b", personId: null, note: null },
  ];

  it("raises a card only for prompts with none", () => {
    expect(newPrompts(prompts, [{ source: "FORM", sourceRef: "sub1" }]).map((p) => p.sourceRef)).toEqual(["sub2"]);
  });

  it("does not raise one again for something already dismissed", () => {
    // The failure that teaches people to ignore a queue.
    expect(newPrompts(prompts, [{ source: "FORM", sourceRef: "sub1" }, { source: "FORM", sourceRef: "sub2" }]))
      .toEqual([]);
  });

  it("tells the same reference from two sources apart", () => {
    expect(newPrompts(prompts, [{ source: "EVENT", sourceRef: "sub1" }])).toHaveLength(2);
  });
});

describe("defaultDueDays and titleFor", () => {
  it("gives a card asking to be contacted the shortest fuse", () => {
    // A fortnight later is not a follow-up, it is an apology.
    expect(defaultDueDays("FORM")).toBeLessThan(defaultDueDays("EVENT"));
    expect(defaultDueDays("FORM")).toBeLessThan(defaultDueDays("GROUP_ABSENCE"));
  });

  it("writes the queue as sentences", () => {
    expect(titleFor("GROUP_ABSENCE", "Ruth")).toBe("Ruth has stopped coming to their group");
    expect(titleFor("MANUAL", "Ring the Bells")).toBe("Ring the Bells");
  });
});

describe("closeWith", () => {
  it("wants to know what came of a job marked done", () => {
    expect(closeWith("DONE", "Rang; they've moved away")).toEqual({
      ok: true, status: "DONE", outcome: "Rang; they've moved away",
    });
    expect(closeWith("DONE", "   ").ok).toBe(false);
    expect(closeWith("DONE", undefined).ok).toBe(false);
  });

  it("lets one be dismissed without a reason, but keeps one if given", () => {
    expect(closeWith("DISMISSED", undefined)).toEqual({ ok: true, status: "DISMISSED", outcome: null });
    expect(closeWith("DISMISSED", "Already in touch")).toMatchObject({ outcome: "Already in touch" });
  });

  it("is not a way to reopen one", () => {
    expect(closeWith("OPEN", "anything").ok).toBe(false);
  });
});
