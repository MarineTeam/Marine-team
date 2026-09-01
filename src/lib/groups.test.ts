import { describe, expect, it } from "vitest";
import {
  activeMembers,
  canLead,
  canSeeAddress,
  joinMessage,
  joinState,
  presentGroup,
  standingIn,
  type GroupRow,
  type GroupViewer,
  type MemberRow,
} from "./groups";

/**
 * One rule matters more than everything else here: a group that meets in
 * somebody's living room must never publish where they live. An address that
 * has been on the open internet stays somewhere for good, so the check that
 * keeps it off is pinned harder than anything else in this file.
 */

const group: GroupRow = {
  id: "g1",
  slug: "tuesday-north",
  name: "Tuesday, north side",
  description: "Bible study and far too much cake.",
  meetsWhen: "Tuesdays, 7.30pm",
  area: "North side",
  address: "14 Rowan Close, Aylesbury HP20 1AB",
  published: true,
  openToJoin: true,
  capacity: 10,
};

const member = (userId: string, over: Partial<MemberRow> = {}): MemberRow & { displayName: string } => ({
  userId,
  role: "MEMBER",
  status: "ACTIVE",
  displayName: userId,
  ...over,
});

const leader = member("ruth", { role: "LEADER" });
const regular = member("devin");
const asked = member("stranger", { status: "REQUESTED" });
const members = [leader, regular, asked];

const visitor: GroupViewer = { userId: null, manages: false };
const outsider: GroupViewer = { userId: "nobody", manages: false };
const requester: GroupViewer = { userId: "stranger", manages: false };
const inside: GroupViewer = { userId: "devin", manages: false };
const leaderView: GroupViewer = { userId: "ruth", manages: false };
const staff: GroupViewer = { userId: "admin", manages: true };

describe("standingIn", () => {
  it("tells the four ways somebody can stand to a group", () => {
    expect(standingIn(members, visitor)).toBe("none");
    expect(standingIn(members, outsider)).toBe("none");
    expect(standingIn(members, requester)).toBe("requested");
    expect(standingIn(members, inside)).toBe("member");
    expect(standingIn(members, leaderView)).toBe("leader");
  });

  it("remembers somebody who was turned down", () => {
    expect(standingIn([member("no", { status: "DECLINED" })], { userId: "no", manages: false })).toBe(
      "declined",
    );
  });
});

describe("canSeeAddress", () => {
  it("gives it to people who are actually in the group", () => {
    expect(canSeeAddress("member", inside)).toBe(true);
    expect(canSeeAddress("leader", leaderView)).toBe(true);
  });

  it("withholds it from a visitor and from a stranger with an account", () => {
    expect(canSeeAddress("none", visitor)).toBe(false);
    expect(canSeeAddress("none", outsider)).toBe(false);
  });

  it("withholds it from somebody who has only asked to join", () => {
    // The request is unanswered. Honouring it would mean anyone with an
    // account could learn where a leader lives by pressing a button.
    expect(canSeeAddress("requested", requester)).toBe(false);
  });

  it("withholds it from somebody who was turned down", () => {
    expect(canSeeAddress("declined", { userId: "no", manages: false })).toBe(false);
  });
});

describe("presentGroup", () => {
  it("leaves the address out entirely rather than sending null", () => {
    // Absent, not null: a page that forgets to check has nothing to print.
    const shown = presentGroup(group, members, outsider);
    expect("address" in shown).toBe(false);
    expect(JSON.stringify(shown)).not.toContain("Rowan Close");
  });

  it("still gives the district, which is what somebody is choosing between", () => {
    expect(presentGroup(group, members, outsider).area).toBe("North side");
  });

  it("gives the address to a member, a leader and whoever keeps the list", () => {
    for (const viewer of [inside, leaderView, staff]) {
      expect(presentGroup(group, members, viewer).address).toBe(group.address);
    }
  });

  it("doesn't hand the address to somebody who has only asked", () => {
    expect(presentGroup(group, members, requester).address).toBeUndefined();
  });

  it("names the leaders, because somebody has to be asked", () => {
    expect(presentGroup(group, members, visitor).leaders).toEqual(["ruth"]);
  });

  it("counts only people actually in it", () => {
    expect(presentGroup(group, members, visitor).memberCount).toBe(2);
  });
});

describe("activeMembers", () => {
  it("leaves out requests and refusals", () => {
    expect(activeMembers(members).map((m) => m.userId)).toEqual(["ruth", "devin"]);
  });
});

describe("joinState", () => {
  it("offers to a signed-in stranger", () => {
    expect(joinState(group, members, outsider)).toBe("open");
  });

  it("asks a visitor to sign in rather than pretending they can join", () => {
    expect(joinState(group, members, visitor)).toBe("signed-out");
  });

  it("says so when the answer is already yes, or already asked", () => {
    expect(joinState(group, members, inside)).toBe("already");
    expect(joinState(group, members, requester)).toBe("waiting");
  });

  it("says full rather than hiding a full group", () => {
    // The question is "can I come". "Not this one, it's full" answers it.
    const packed = [leader, regular, member("a"), member("b")];
    expect(joinState({ ...group, capacity: 4 }, packed, outsider)).toBe("full");
  });

  it("counts only active members towards the capacity", () => {
    const nearlyFull = [leader, regular, asked, member("x", { status: "DECLINED" })];
    expect(joinState({ ...group, capacity: 3 }, nearlyFull, outsider)).toBe("open");
  });

  it("respects a group that has closed its doors even with room", () => {
    expect(joinState({ ...group, openToJoin: false }, members, outsider)).toBe("closed");
  });

  it("has a sentence for every state", () => {
    const states = ["open", "full", "closed", "already", "waiting", "signed-out"] as const;
    for (const state of states) {
      expect(typeof joinMessage(state)).toBe("string");
    }
    expect(joinMessage("full")).toContain("full");
  });
});

describe("canLead", () => {
  it("is the group's own leader, and whoever keeps the list", () => {
    expect(canLead("leader", leaderView)).toBe(true);
    expect(canLead("none", staff)).toBe(true);
    expect(canLead("member", inside)).toBe(false);
    expect(canLead("requested", requester)).toBe(false);
  });
});
