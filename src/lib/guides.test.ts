import { describe, it, expect } from "vitest";
import {
  MEMBER_KINDS,
  canOpenGuide,
  canSeeLeaderNotes,
  describeGuide,
  isMemberKind,
  presentGuide,
  type GuideItemRow,
  type GuideRow,
} from "./guides";
import type { GroupViewer } from "./groups";

const leader: GroupViewer = { userId: "lead", manages: false };
const member: GroupViewer = { userId: "mem", manages: false };
const staff: GroupViewer = { userId: "boss", manages: true };
const signedOut: GroupViewer = { userId: null, manages: false };

const guide: GuideRow = {
  id: "g1",
  slug: "romans-8",
  title: "Romans 8",
  description: "Four evenings in one chapter.",
  published: true,
  seriesId: "s1",
  videoId: null,
};

const items: GuideItemRow[] = [
  { id: "i3", kind: "QUESTION", body: "Where do you feel that most?", reference: null, position: 3 },
  { id: "i1", kind: "SCRIPTURE", body: "Read together", reference: "Romans 8:1-11", position: 1 },
  { id: "i4", kind: "LEADER_NOTE", body: "THE HARRISONS LOST THEIR SON IN MARCH", reference: null, position: 4 },
  { id: "i2", kind: "NOTE", body: "Paul is writing to a church he has never met.", reference: null, position: 2 },
];

describe("presentGuide", () => {
  it("gives a member the questions, the scripture and the notes", () => {
    const seen = presentGuide(guide, items, "member", member);
    expect(seen.items.map((i) => i.id)).toEqual(["i1", "i2", "i3"]);
    expect(seen.title).toBe("Romans 8");
  });

  it("never lets a leader note reach a member, in any field", () => {
    // The rule this whole file exists for.
    const seen = presentGuide(guide, items, "member", member);
    expect(JSON.stringify(seen)).not.toContain("HARRISONS");
    expect(seen.items.some((i) => i.id === "i4")).toBe(false);
  });

  it("leaves the field off entirely rather than sending an empty one", () => {
    // `"leaderNotes" in guide` is then a true answer, not a length check —
    // and a page that spreads the object cannot find an empty array to map.
    const asMember = presentGuide(guide, items, "member", member);
    expect("leaderNotes" in asMember).toBe(false);
    expect(asMember.leaderNotes).toBeUndefined();
  });

  it("gives the notes to whoever is leading", () => {
    const seen = presentGuide(guide, items, "leader", leader);
    expect(seen.leaderNotes?.map((n) => n.body)).toEqual(["THE HARRISONS LOST THEIR SON IN MARCH"]);
    // ...and they are still not in the items a page renders.
    expect(seen.items.some((i) => i.body.includes("HARRISONS"))).toBe(false);
  });

  it("gives them to whoever keeps the group list", () => {
    expect(presentGuide(guide, items, "none", staff).leaderNotes).toHaveLength(1);
  });

  it("withholds them from somebody who only asked to join, or is waiting", () => {
    for (const standing of ["requested", "waitlisted", "none", "declined"] as const) {
      expect(presentGuide(guide, items, standing, member).leaderNotes).toBeUndefined();
    }
  });

  it("withholds them from a signed-out reader", () => {
    expect(presentGuide(guide, items, "none", signedOut).leaderNotes).toBeUndefined();
  });

  it("omits the field when a leader opens a guide that has no notes", () => {
    const plain = items.filter((i) => i.kind !== "LEADER_NOTE");
    expect(presentGuide(guide, plain, "leader", leader).leaderNotes).toBeUndefined();
  });

  it("reads in the order it was written, whatever order the rows arrive in", () => {
    const shuffled = [...items].reverse();
    expect(presentGuide(guide, shuffled, "member", member).items.map((i) => i.position)).toEqual([1, 2, 3]);
  });
});

describe("isMemberKind", () => {
  it("names exactly the three anybody may read", () => {
    expect([...MEMBER_KINDS]).toEqual(["QUESTION", "SCRIPTURE", "NOTE"]);
    for (const kind of MEMBER_KINDS) expect(isMemberKind(kind)).toBe(true);
    expect(isMemberKind("LEADER_NOTE")).toBe(false);
  });
});

describe("canSeeLeaderNotes", () => {
  it("is leading this group, or keeping the group list", () => {
    expect(canSeeLeaderNotes("leader", leader)).toBe(true);
    expect(canSeeLeaderNotes("none", staff)).toBe(true);
    expect(canSeeLeaderNotes("member", member)).toBe(false);
  });
});

describe("canOpenGuide", () => {
  it("lets anybody open a published guide", () => {
    expect(canOpenGuide({ published: true }, member)).toBe(true);
  });

  it("keeps a draft to staff", () => {
    // A link pasted into a group chat before anybody is happy with it must
    // not become the thing everybody reads.
    expect(canOpenGuide({ published: false }, member)).toBe(false);
    expect(canOpenGuide({ published: false }, staff)).toBe(true);
  });
});

describe("describeGuide", () => {
  it("counts questions, not items", () => {
    // "9 items" includes the notes and the leader's asides, and answers a
    // question nobody asked.
    expect(describeGuide(items)).toBe("1 question");
    expect(describeGuide([...items, { id: "i5", kind: "QUESTION", body: "?", reference: null, position: 5 }])).toBe(
      "2 questions",
    );
  });

  it("calls a guide with no questions a handout", () => {
    expect(describeGuide(items.filter((i) => i.kind !== "QUESTION"))).toBe("Notes");
  });
});
