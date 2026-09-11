import { describe, it, expect } from "vitest";
import {
  canSeeNames,
  NAMES_WITHHELD,
  visibleEvent,
  visibleEvents,
  visiblePeople,
  visibleSnapshot,
} from "./visibility";
import type { CalendarEvent, Person, Snapshot } from "./types";

const member = { signedIn: true };
const stranger = { signedIn: false };

const people: Person[] = [
  { id: "p1", displayName: "Ruth", normalizedName: "ruth" },
  { id: "p2", displayName: "Sam", normalizedName: "sam" },
];

const event: CalendarEvent = {
  id: "e1",
  scheduleId: "s1",
  date: "2026-09-13",
  endDate: null,
  allDay: true,
  startTime: null,
  endTime: null,
  title: null,
  notes: "Bring the bread",
  location: "Main hall",
  status: "CONFIRMED" as CalendarEvent["status"],
  people: [
    { personId: "p1", displayName: "Ruth", role: "Bread" },
    { personId: "p2", displayName: "Sam", role: "Cup" },
  ],
  updatedAt: "2026-09-01T00:00:00.000Z",
};

const snapshot: Snapshot = {
  schedules: [],
  people,
  events: [event],
  deleted: { scheduleIds: ["s0"], eventIds: ["e0"], personIds: ["p0"] },
  syncedAt: "2026-09-11T00:00:00.000Z",
  full: false,
  window: { from: "2026-07-13", to: "2027-09-11" },
};

describe("canSeeNames", () => {
  it("is anybody signed in, and nobody else", () => {
    expect(canSeeNames(member)).toBe(true);
    expect(canSeeNames(stranger)).toBe(false);
  });
});

describe("visibleEvent", () => {
  it("keeps everything for a member", () => {
    expect(visibleEvent(event, member)).toBe(event);
  });

  it("keeps the structure and drops the people for a stranger", () => {
    const seen = visibleEvent(event, stranger);
    expect(seen.people).toEqual([]);
    // The day, the notes and the place are the rota; the names are the people.
    expect(seen).toMatchObject({ date: "2026-09-13", notes: "Bring the bread", location: "Main hall" });
  });

  it("never leaves a name behind anywhere in the stripped shape", () => {
    expect(JSON.stringify(visibleEvent(event, stranger))).not.toMatch(/Ruth|Sam|p1|p2/);
  });

  it("does not mutate the event it was given", () => {
    visibleEvent(event, stranger);
    expect(event.people).toHaveLength(2);
  });
});

describe("visiblePeople", () => {
  it("is the list for a member and nothing for a stranger", () => {
    expect(visiblePeople(people, member)).toEqual(people);
    expect(visiblePeople(people, stranger)).toEqual([]);
  });

  it("hands a member a copy, not the array itself", () => {
    expect(visiblePeople(people, member)).not.toBe(people);
  });
});

describe("visibleSnapshot", () => {
  it("is untouched for a member", () => {
    expect(visibleSnapshot(snapshot, member)).toBe(snapshot);
  });

  it("carries no people, no names on events, and no person ids for a stranger", () => {
    const seen = visibleSnapshot(snapshot, stranger);
    expect(seen.people).toEqual([]);
    expect(seen.events.every((e) => e.people.length === 0)).toBe(true);
    expect(seen.deleted.personIds).toEqual([]);
    expect(JSON.stringify(seen)).not.toMatch(/Ruth|Sam|p0|p1|p2/);
  });

  it("keeps everything that isn't a person", () => {
    const seen = visibleSnapshot(snapshot, stranger);
    expect(seen.deleted.scheduleIds).toEqual(["s0"]);
    expect(seen.deleted.eventIds).toEqual(["e0"]);
    expect(seen.window).toEqual(snapshot.window);
    expect(seen.syncedAt).toBe(snapshot.syncedAt);
  });
});

describe("visibleEvents", () => {
  it("applies the rule to every event", () => {
    expect(visibleEvents([event, event], stranger).map((e) => e.people.length)).toEqual([0, 0]);
    expect(visibleEvents([event, event], member).map((e) => e.people.length)).toEqual([2, 2]);
  });
});

describe("NAMES_WITHHELD", () => {
  it("tells them what to do about it", () => {
    expect(NAMES_WITHHELD.toLowerCase()).toContain("sign in");
  });
});
