import { describe, expect, it } from "vitest";
import { mergeSnapshot, type CachedCalendar } from "./offline-calendar";
import type { CalendarEvent, Person, Schedule, Snapshot } from "./schedules/types";

/**
 * The merge is the whole of the incremental sync.
 *
 * Everything else in offline-calendar.ts is a fetch and a cache write; this is
 * the part that decides what a device believes about next Sunday after a week
 * of deltas, and the two rules it enforces that nothing in the payload states
 * — a withdrawn schedule taking its events, and the window sliding — are the
 * ones that would rot quietly.
 */

function schedule(id: string, extra: Partial<Schedule> = {}): Schedule {
  return {
    id,
    slug: id,
    name: id,
    description: null,
    icon: "calendar",
    color: "blue",
    enabled: true,
    displayOrder: 0,
    sourceType: "WEB",
    lastSyncedAt: null,
    lastSyncStatus: null,
    updatedAt: "2026-09-01T00:00:00.000Z",
    ...extra,
  };
}

function person(id: string, displayName = id): Person {
  return { id, displayName, normalizedName: displayName.toLowerCase() };
}

function event(id: string, date: string, scheduleId = "breaking-bread", extra: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id,
    scheduleId,
    date,
    endDate: null,
    allDay: true,
    startTime: null,
    endTime: null,
    title: null,
    notes: null,
    location: null,
    status: "CONFIRMED",
    people: [],
    updatedAt: "2026-09-01T00:00:00.000Z",
    ...extra,
  };
}

function delta(over: Partial<Snapshot> = {}): Snapshot {
  return {
    schedules: [],
    people: [],
    events: [],
    deleted: { scheduleIds: [], eventIds: [], personIds: [] },
    syncedAt: "2026-09-08T00:00:00.000Z",
    full: false,
    window: { from: "2026-07-01", to: "2027-09-01" },
    ...over,
  };
}

const base: CachedCalendar = {
  schedules: [schedule("breaking-bread"), schedule("cleaning", { displayOrder: 2 })],
  people: [person("p1", "Cindy"), person("p2", "Devin")],
  events: [
    event("e1", "2026-09-06"),
    event("e2", "2026-09-13"),
    event("e3", "2026-09-05", "cleaning"),
  ],
  syncedAt: "2026-09-01T00:00:00.000Z",
  window: { from: "2026-07-01", to: "2027-09-01" },
};

describe("mergeSnapshot", () => {
  it("replaces everything when the server says the snapshot is full", () => {
    const merged = mergeSnapshot(
      base,
      delta({ full: true, schedules: [schedule("cleaning")], events: [event("e9", "2026-10-04", "cleaning")] }),
    );
    expect(merged.schedules.map((row) => row.id)).toEqual(["cleaning"]);
    expect(merged.events.map((row) => row.id)).toEqual(["e9"]);
    expect(merged.people).toEqual([]);
  });

  it("takes the delta whole when the device holds nothing yet", () => {
    const merged = mergeSnapshot(null, delta({ events: [event("e9", "2026-10-04")] }));
    expect(merged.events.map((row) => row.id)).toEqual(["e9"]);
  });

  it("updates an event in place rather than duplicating it", () => {
    const merged = mergeSnapshot(base, delta({ events: [event("e2", "2026-09-13", "breaking-bread", { location: "Hall" })] }));
    expect(merged.events.filter((row) => row.id === "e2")).toHaveLength(1);
    expect(merged.events.find((row) => row.id === "e2")?.location).toBe("Hall");
    // And leaves the ones it said nothing about alone.
    expect(merged.events.map((row) => row.id)).toEqual(["e3", "e1", "e2"]);
  });

  it("drops what the server reports as deleted", () => {
    const merged = mergeSnapshot(
      base,
      delta({ deleted: { scheduleIds: [], eventIds: ["e1"], personIds: ["p2"] } }),
    );
    expect(merged.events.map((row) => row.id)).toEqual(["e3", "e2"]);
    expect(merged.people.map((row) => row.id)).toEqual(["p1"]);
  });

  it("drops a withdrawn schedule's events, which the server never lists", () => {
    // Disabling a schedule doesn't touch one event row, so their updatedAt
    // never moves and no delta will ever mention them. If the client doesn't
    // do this, somebody turns up for a rota that was withdrawn.
    const merged = mergeSnapshot(
      base,
      delta({ deleted: { scheduleIds: ["cleaning"], eventIds: [], personIds: [] } }),
    );
    expect(merged.schedules.map((row) => row.id)).toEqual(["breaking-bread"]);
    expect(merged.events.map((row) => row.id)).toEqual(["e1", "e2"]);
  });

  it("prunes days that have fallen out behind the window", () => {
    const merged = mergeSnapshot(base, delta({ window: { from: "2026-09-10", to: "2027-09-01" } }));
    expect(merged.events.map((row) => row.id)).toEqual(["e2"]);
  });

  it("keeps a multi-day event until the day it ends", () => {
    const camp = event("e4", "2026-09-01", "breaking-bread", { endDate: "2026-09-12" });
    const merged = mergeSnapshot(
      { ...base, events: [camp] },
      delta({ window: { from: "2026-09-10", to: "2027-09-01" } }),
    );
    expect(merged.events.map((row) => row.id)).toEqual(["e4"]);
  });

  it("prunes days beyond the far edge too", () => {
    const merged = mergeSnapshot(base, delta({ window: { from: "2026-07-01", to: "2026-09-10" } }));
    expect(merged.events.map((row) => row.id)).toEqual(["e3", "e1"]);
  });

  it("sorts a new schedule into its place rather than appending it", () => {
    const merged = mergeSnapshot(base, delta({ schedules: [schedule("welcome", { displayOrder: 1 })] }));
    expect(merged.schedules.map((row) => row.id)).toEqual(["breaking-bread", "welcome", "cleaning"]);
  });

  it("carries the server's timestamp forward, so the next sync asks from there", () => {
    expect(mergeSnapshot(base, delta()).syncedAt).toBe("2026-09-08T00:00:00.000Z");
  });

  it("leaves the device's copy untouched", () => {
    const before = JSON.stringify(base);
    mergeSnapshot(base, delta({ deleted: { scheduleIds: ["cleaning"], eventIds: ["e1"], personIds: [] } }));
    expect(JSON.stringify(base)).toBe(before);
  });
});
