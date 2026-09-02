import { describe, it, expect } from "vitest";
import { askerName, canAskForCover, canTake, coverState, needsConfirming, takeMessage } from "./cover";

const NOW = new Date("2026-06-01T12:00:00Z");
const sunday = new Date("2026-06-07T00:00:00Z");
const lastSunday = new Date("2026-05-31T00:00:00Z");

const assignment = {
  userId: "alice",
  status: "ACCEPTED",
  coverWanted: false,
  plan: { serviceDate: sunday, published: true },
};

describe("canAskForCover", () => {
  it("lets whoever is on ask", () => {
    expect(canAskForCover(assignment, "alice", NOW)).toBe("ok");
  });

  it("lets somebody who hasn't answered yet ask", () => {
    // "I've been asked and I can't — does anyone else want it?" is a real
    // thing to say. Making them accept first to hand it on would be a step
    // that exists only to satisfy a state machine.
    expect(canAskForCover({ ...assignment, status: "INVITED" }, "alice", NOW)).toBe("ok");
  });

  it("refuses somebody else's slot", () => {
    expect(canAskForCover(assignment, "bob", NOW)).toBe("not-yours");
  });

  it("has nothing to cover once they've said no", () => {
    expect(canAskForCover({ ...assignment, status: "DECLINED" }, "alice", NOW)).toBe("declined");
  });

  it("refuses a second ask on the same slot", () => {
    expect(canAskForCover({ ...assignment, coverWanted: true }, "alice", NOW)).toBe("already-asking");
  });

  it("refuses a service that has been and gone", () => {
    expect(canAskForCover({ ...assignment, plan: { serviceDate: lastSunday, published: true } }, "alice", NOW)).toBe(
      "past",
    );
  });

  it("counts the whole of the service's own day as not yet past", () => {
    // Somebody realising at breakfast that they can't do the evening service
    // should still be able to ask.
    const today = new Date("2026-06-01T00:00:00Z");
    expect(canAskForCover({ ...assignment, plan: { serviceDate: today, published: true } }, "alice", NOW)).toBe("ok");
  });

  it("treats an undated plan as still to come", () => {
    // A plan drafted before the date is settled must not read as long ago,
    // which would hide every draft from the people it is being drafted for.
    expect(canAskForCover({ ...assignment, plan: { serviceDate: null, published: true } }, "alice", NOW)).toBe("ok");
  });

  it("refuses a plan nobody can see yet", () => {
    expect(canAskForCover({ ...assignment, plan: { serviceDate: sunday, published: false } }, "alice", NOW)).toBe(
      "unpublished",
    );
  });
});

describe("coverState", () => {
  const open = { ...assignment, coverWanted: true };
  const bob = { id: "bob", blockouts: [] };

  it("is open to somebody else on the team", () => {
    expect(coverState(open, bob, false, NOW)).toBe("open");
    expect(canTake("open")).toBe(true);
  });

  it("is not open when nobody asked", () => {
    expect(coverState(assignment, bob, false, NOW)).toBe("not-open");
    expect(canTake("not-open")).toBe(false);
  });

  it("says nothing to do about your own slot", () => {
    expect(coverState(open, { id: "alice", blockouts: [] }, false, NOW)).toBe("yours");
  });

  it("refuses somebody already on that service", () => {
    // The unique index would reject the write anyway; a caught constraint
    // error is not an explanation anybody can act on.
    expect(coverState(open, bob, true, NOW)).toBe("already-on");
    expect(canTake("already-on")).toBe(false);
  });

  it("warns, but does not refuse, somebody who said they were away", () => {
    // A rota that argues with the person offering to help is a rota nobody
    // helps with. It just must not let them do it without noticing.
    const away = {
      id: "bob",
      blockouts: [{ startDate: new Date("2026-06-06T00:00:00Z"), endDate: new Date("2026-06-08T00:00:00Z") }],
    };
    expect(coverState(open, away, false, NOW)).toBe("away");
    expect(canTake("away")).toBe(true);
    expect(needsConfirming("away")).toBe(true);
    expect(needsConfirming("open")).toBe(false);
  });

  it("refuses a service that has already happened", () => {
    expect(coverState({ ...open, plan: { serviceDate: lastSunday, published: true } }, bob, false, NOW)).toBe("past");
  });

  it("puts being already on ahead of being away", () => {
    // Both are true for somebody who blocked the day out and is on anyway;
    // only one of them is a refusal, and a warning they cannot act on is
    // worse than the reason they cannot.
    const away = {
      id: "bob",
      blockouts: [{ startDate: sunday, endDate: sunday }],
    };
    expect(coverState(open, away, true, NOW)).toBe("already-on");
  });
});

describe("takeMessage", () => {
  it("says something for every state, and nothing when it is simply open", () => {
    expect(takeMessage("open")).toBe("");
    for (const state of ["away", "yours", "not-open", "past", "already-on"] as const) {
      expect(takeMessage(state).length).toBeGreaterThan(0);
    }
  });
});

describe("askerName", () => {
  it("prefers the name they chose", () => {
    expect(askerName({ name: "Alice Member", displayName: "Ali" })).toBe("Ali");
    expect(askerName({ name: "Alice Member", displayName: null })).toBe("Alice Member");
  });

  it("never falls back to an email address", () => {
    // This list goes to everybody on the team; rota.ts's personName falls back
    // to the address, which is right for a rota-builder telling two Daves
    // apart and wrong here.
    expect(askerName({ name: null, displayName: null })).toBe("Someone on your team");
    expect(askerName({ name: "  ", displayName: "" })).toBe("Someone on your team");
  });
});
