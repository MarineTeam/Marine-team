import { describe, it, expect } from "vitest";
import {
  canModerate,
  canRemoveMessage,
  cleanGroupMessage,
  inTheThread,
  latest,
  MAX_LENGTH,
  notifiable,
  threadMessage,
  threadState,
  visibleThread,
  type GroupMessageRow,
} from "./group-messages";
import type { GroupViewer, MemberRow, Standing } from "./groups";

const leader: GroupViewer = { userId: "lead", manages: false };
const member: GroupViewer = { userId: "mem", manages: false };
const staff: GroupViewer = { userId: "boss", manages: true };
const stranger: GroupViewer = { userId: "other", manages: false };
const signedOut: GroupViewer = { userId: null, manages: false };

const at = (minutes: number) => new Date(Date.UTC(2026, 8, 11, 19, minutes));

const thread: GroupMessageRow[] = [
  { id: "m1", userId: "lead", authorName: "Ruth", body: "Tuesday as usual", hidden: false, createdAt: at(0) },
  { id: "m2", userId: "mem", authorName: "Sam", body: "Can't make it", hidden: false, createdAt: at(5) },
  { id: "m3", userId: "third", authorName: "Jo", body: "taken down", hidden: true, createdAt: at(7) },
];

describe("inTheThread", () => {
  it("is people actually in the group", () => {
    expect(inTheThread("member")).toBe(true);
    expect(inTheThread("leader")).toBe(true);
  });

  it("is not people whose ask is unanswered, or who were turned down", () => {
    // A request is something nobody has agreed to; the thread is as private as
    // the address and turns on the same yes.
    expect(inTheThread("requested")).toBe(false);
    expect(inTheThread("waitlisted")).toBe(false);
    expect(inTheThread("declined")).toBe(false);
    expect(inTheThread("none")).toBe(false);
  });
});

describe("canModerate", () => {
  it("is this group's leaders", () => {
    expect(canModerate("leader", leader)).toBe(true);
  });

  it("is not a member", () => {
    expect(canModerate("member", member)).toBe(false);
  });

  it("is not a site manager who isn't in the group", () => {
    // The one place this file departs from canSeeAddress: running the website
    // is not a reason to read a group's conversation.
    expect(canModerate("none", staff)).toBe(false);
    expect(inTheThread("none")).toBe(false);
  });

  it("is a site manager who *is* in the group, because they lead by capability", () => {
    expect(canModerate("member", staff)).toBe(true);
  });
});

describe("threadState", () => {
  it("names why somebody can't see it", () => {
    expect(threadState("member", member)).toBe("open");
    expect(threadState("requested", member)).toBe("not-a-member");
    expect(threadState("none", signedOut)).toBe("signed-out");
  });

  it("has a sentence for every state but open", () => {
    expect(threadMessage("open")).toBe("");
    expect(threadMessage("not-a-member")).not.toBe("");
    expect(threadMessage("signed-out")).not.toBe("");
  });
});

describe("visibleThread", () => {
  it("gives members the messages, without the hidden one", () => {
    const seen = visibleThread(thread, "member", member);
    expect(seen.map((m) => m.id)).toEqual(["m1", "m2"]);
  });

  it("gives somebody outside the group nothing at all", () => {
    for (const standing of ["requested", "waitlisted", "declined", "none"] as Standing[]) {
      expect(visibleThread(thread, standing, stranger)).toEqual([]);
    }
    expect(visibleThread(thread, "none", staff)).toEqual([]);
    expect(visibleThread(thread, "member", signedOut)).toEqual([]);
  });

  it("keeps a hidden message hidden from the leader who hid it too", () => {
    // Hidden is hidden everywhere, including in the poll.
    expect(visibleThread(thread, "leader", leader).map((m) => m.id)).toEqual(["m1", "m2"]);
  });

  it("lets an author remove their own and nobody else's", () => {
    const seen = visibleThread(thread, "member", member);
    expect(seen.find((m) => m.id === "m2")?.canRemove).toBe(true);
    expect(seen.find((m) => m.id === "m2")?.mine).toBe(true);
    expect(seen.find((m) => m.id === "m1")?.canRemove).toBe(false);
    expect(seen.find((m) => m.id === "m1")?.mine).toBe(false);
  });

  it("lets a leader remove anything", () => {
    expect(visibleThread(thread, "leader", leader).every((m) => m.canRemove)).toBe(true);
  });

  it("carries no user ids out", () => {
    const seen = visibleThread(thread, "member", member);
    expect(Object.keys(seen[0]).sort()).toEqual(["at", "body", "by", "canRemove", "id", "mine"]);
  });
});

describe("canRemoveMessage", () => {
  const mine = { userId: "mem" };
  const theirs = { userId: "lead" };

  it("is the author, or a leader of the group", () => {
    expect(canRemoveMessage(mine, "member", member)).toBe(true);
    expect(canRemoveMessage(theirs, "leader", leader)).toBe(true);
  });

  it("is not another member", () => {
    expect(canRemoveMessage(theirs, "member", member)).toBe(false);
  });

  it("is not the author once they've left the group", () => {
    // Every read and write is checked against standing now, not at the door.
    expect(canRemoveMessage(mine, "none", member)).toBe(false);
  });

  it("is not a site manager outside the group", () => {
    expect(canRemoveMessage(theirs, "none", staff)).toBe(false);
  });
});

describe("cleanGroupMessage", () => {
  it("collapses the runs that turn one message into a screenful", () => {
    const clean = cleanGroupMessage("  Hi   there\n\n\n\n\nall  ");
    expect(clean).toEqual({ ok: true, body: "Hi there\n\nall" });
  });

  it("refuses an empty one", () => {
    expect(cleanGroupMessage("   \n  ").ok).toBe(false);
  });

  it("takes a paragraph, which the stream chat wouldn't", () => {
    const paragraph = "a".repeat(1200);
    expect(cleanGroupMessage(paragraph)).toEqual({ ok: true, body: paragraph });
    expect(MAX_LENGTH).toBeGreaterThan(1200);
  });

  it("stops at the limit and says what it is", () => {
    const over = cleanGroupMessage("a".repeat(MAX_LENGTH + 1));
    expect(over.ok).toBe(false);
    expect(over.ok === false && over.reason).toContain(String(MAX_LENGTH));
    expect(cleanGroupMessage("a".repeat(MAX_LENGTH)).ok).toBe(true);
  });
});

describe("notifiable", () => {
  const members: (MemberRow & { muted: boolean })[] = [
    { userId: "lead", role: "LEADER", status: "ACTIVE", muted: false },
    { userId: "mem", role: "MEMBER", status: "ACTIVE", muted: false },
    { userId: "quiet", role: "MEMBER", status: "ACTIVE", muted: true },
    { userId: "asked", role: "MEMBER", status: "REQUESTED", muted: false },
    { userId: "waiting", role: "MEMBER", status: "WAITLIST", muted: false },
  ];

  it("is active members other than the author, minus the muted", () => {
    expect(notifiable(members, "mem")).toEqual(["lead"]);
  });

  it("never tells somebody about their own message", () => {
    expect(notifiable(members, "lead")).not.toContain("lead");
  });

  it("doesn't reach people who aren't in the group yet", () => {
    // They can't read the thread, so mailing them the message would be the
    // leak the thread rules exist to stop.
    const told = notifiable(members, "lead");
    expect(told).not.toContain("asked");
    expect(told).not.toContain("waiting");
  });
});

describe("latest", () => {
  const rows = Array.from({ length: 60 }, (_, i) => ({ id: `m${i}`, createdAt: at(i) }));

  it("returns the newest page, in reading order", () => {
    const page = latest(rows, 50);
    expect(page).toHaveLength(50);
    expect(page[0].id).toBe("m10");
    expect(page[page.length - 1].id).toBe("m59");
  });

  it("copes with fewer messages than a page", () => {
    expect(latest(rows.slice(0, 3), 50).map((r) => r.id)).toEqual(["m0", "m1", "m2"]);
  });

  it("doesn't mutate what it was given", () => {
    const original = rows.map((r) => r.id);
    latest(rows, 5);
    expect(rows.map((r) => r.id)).toEqual(original);
  });

  it("breaks a tie on id so the order is stable", () => {
    const same = [
      { id: "b", createdAt: at(1) },
      { id: "a", createdAt: at(1) },
    ];
    expect(latest(same, 2).map((r) => r.id)).toEqual(["a", "b"]);
  });
});
