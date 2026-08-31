import { describe, expect, it } from "vitest";

import {
  coversDay,
  daysWithEvents,
  describeParticipants,
  eventsOnDay,
  filterEvents,
  groupByDay,
  involvesPerson,
  nextEventForPerson,
  pastEvents,
  peopleInEvents,
  resolveSelectedPerson,
  sortEvents,
  upcomingEvents,
  visibleSchedules,
} from "./logic";
import type { CalendarEvent, Schedule } from "./types";

/**
 * The behaviour behind the home screen. All of it is pure, so the same
 * functions produce the same answer whether the data came from the network or
 * from the offline cache -- which is what makes the offline experience
 * identical rather than merely similar.
 */

const TODAY = "2026-07-15";

function schedule(overrides: Partial<Schedule> = {}): Schedule {
  return {
    id: "sched-regular",
    slug: "regular",
    name: "Regular Calendar",
    description: null,
    icon: "\u{1F4C5}",
    color: "sky",
    enabled: true,
    displayOrder: 0,
    sourceType: "WEB",
    lastSyncedAt: null,
    lastSyncStatus: null,
    updatedAt: "2026-07-01T00:00:00.000Z",
    ...overrides,
  };
}

let sequence = 0;
function event(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  sequence += 1;
  return {
    id: `event-${String(sequence).padStart(3, "0")}`,
    scheduleId: "sched-regular",
    date: TODAY,
    endDate: null,
    allDay: true,
    startTime: null,
    endTime: null,
    title: null,
    notes: null,
    location: null,
    status: "CONFIRMED",
    people: [],
    updatedAt: "2026-07-01T00:00:00.000Z",
    ...overrides,
  };
}

function person(id: string, displayName: string) {
  return { personId: id, displayName, role: null };
}

const DEVIN = person("p-devin", "Devin");
const CINDY = person("p-cindy", "Cindy");
const JOHN = person("p-john", "John");

describe("involvesPerson", () => {
  it("matches on the person id, not the name", () => {
    const subject = event({ people: [DEVIN, CINDY] });
    expect(involvesPerson(subject, "p-devin")).toBe(true);
    expect(involvesPerson(subject, "p-john")).toBe(false);
  });
});

describe("filterEvents", () => {
  const events = [
    event({ id: "a", scheduleId: "sched-bread", people: [DEVIN] }),
    event({ id: "b", scheduleId: "sched-regular", people: [CINDY] }),
    event({ id: "c", scheduleId: "sched-bread", people: [DEVIN, CINDY] }),
    event({ id: "d", scheduleId: "sched-bread", people: [DEVIN], status: "CANCELLED" }),
  ];

  it("returns everything when no filter is given", () => {
    // Cancelled events are hidden by default.
    expect(filterEvents(events).map((e) => e.id)).toEqual(["a", "b", "c"]);
  });

  it("filters by person", () => {
    expect(filterEvents(events, { personId: "p-devin" }).map((e) => e.id)).toEqual(["a", "c"]);
  });

  it("filters by schedule", () => {
    expect(filterEvents(events, { scheduleIds: ["sched-regular"] }).map((e) => e.id)).toEqual(["b"]);
  });

  it("treats an empty schedule list as 'all'", () => {
    expect(filterEvents(events, { scheduleIds: [] })).toHaveLength(3);
  });

  it("combines person and schedule filters", () => {
    const result = filterEvents(events, { personId: "p-devin", scheduleIds: ["sched-bread"] });
    expect(result.map((e) => e.id)).toEqual(["a", "c"]);
  });

  it("can include cancelled events", () => {
    expect(filterEvents(events, { hideCancelled: false })).toHaveLength(4);
  });
});

describe("sortEvents", () => {
  it("sorts by date, then time, with all-day first", () => {
    const events = [
      event({ id: "later", date: "2026-07-20" }),
      event({ id: "timed", date: "2026-07-15", allDay: false, startTime: "19:00" }),
      event({ id: "allday", date: "2026-07-15" }),
      event({ id: "early", date: "2026-07-15", allDay: false, startTime: "08:00" }),
    ];

    expect(sortEvents(events).map((e) => e.id)).toEqual(["allday", "early", "timed", "later"]);
  });

  it("is stable and deterministic for identical dates", () => {
    const events = [
      event({ id: "b", scheduleId: "s2" }),
      event({ id: "a", scheduleId: "s1" }),
    ];
    expect(sortEvents(events).map((e) => e.id)).toEqual(sortEvents([...events].reverse()).map((e) => e.id));
  });
});

describe("eventsOnDay", () => {
  const events = [
    event({ id: "today-devin", date: TODAY, people: [DEVIN, CINDY] }),
    event({ id: "today-john", date: TODAY, people: [JOHN] }),
    event({ id: "tomorrow", date: "2026-07-16", people: [DEVIN] }),
    event({ id: "yesterday", date: "2026-07-14", people: [DEVIN] }),
  ];

  it("returns only that day", () => {
    expect(eventsOnDay(events, TODAY).map((e) => e.id)).toEqual(["today-devin", "today-john"]);
  });

  it("scopes to a person", () => {
    expect(eventsOnDay(events, TODAY, { personId: "p-devin" }).map((e) => e.id)).toEqual([
      "today-devin",
    ]);
  });

  it("returns an empty array when nothing matches", () => {
    expect(eventsOnDay(events, "2026-12-25")).toEqual([]);
  });

  it("includes a multi-day event that spans the day", () => {
    const spanning = event({ id: "camp", date: "2026-07-13", endDate: "2026-07-18" });
    expect(eventsOnDay([spanning], TODAY).map((e) => e.id)).toEqual(["camp"]);
  });
});

describe("coversDay", () => {
  it("matches the start date", () => {
    expect(coversDay(event({ date: TODAY }), TODAY)).toBe(true);
  });

  it("matches any day inside a span, inclusive", () => {
    const camp = event({ date: "2026-07-13", endDate: "2026-07-18" });
    expect(coversDay(camp, "2026-07-13")).toBe(true);
    expect(coversDay(camp, "2026-07-15")).toBe(true);
    expect(coversDay(camp, "2026-07-18")).toBe(true);
    expect(coversDay(camp, "2026-07-19")).toBe(false);
  });
});

describe("upcomingEvents", () => {
  const events = [
    event({ id: "past", date: "2026-07-10", people: [DEVIN] }),
    event({ id: "today", date: TODAY, people: [DEVIN] }),
    event({ id: "soon", date: "2026-07-19", people: [DEVIN] }),
    event({ id: "later", date: "2026-08-02", people: [CINDY] }),
    event({ id: "far", date: "2027-07-19", people: [DEVIN] }),
  ];

  it("excludes today by default, since Today has its own section", () => {
    expect(upcomingEvents(events, TODAY).map((e) => e.id)).toEqual(["soon", "later"]);
  });

  it("can include today", () => {
    expect(upcomingEvents(events, TODAY, { includeToday: true }).map((e) => e.id)).toEqual([
      "today",
      "soon",
      "later",
    ]);
  });

  it("never includes past events", () => {
    expect(upcomingEvents(events, TODAY).some((e) => e.id === "past")).toBe(false);
  });

  it("respects the horizon", () => {
    expect(upcomingEvents(events, TODAY, { horizonDays: 7 }).map((e) => e.id)).toEqual(["soon"]);
  });

  it("respects the limit", () => {
    expect(upcomingEvents(events, TODAY, { limit: 1 }).map((e) => e.id)).toEqual(["soon"]);
  });

  it("filters by person", () => {
    expect(upcomingEvents(events, TODAY, { personId: "p-cindy" }).map((e) => e.id)).toEqual([
      "later",
    ]);
  });

  it("returns an empty array when a person has nothing coming up", () => {
    expect(upcomingEvents(events, TODAY, { personId: "p-nobody" })).toEqual([]);
  });

  it("keeps an in-progress multi-day event when today is included", () => {
    const camp = event({ id: "camp", date: "2026-07-13", endDate: "2026-07-18" });
    expect(upcomingEvents([camp], TODAY, { includeToday: true }).map((e) => e.id)).toEqual(["camp"]);
  });
});

describe("pastEvents", () => {
  const events = [
    event({ id: "old", date: "2026-06-01", people: [DEVIN] }),
    event({ id: "recent", date: "2026-07-10", people: [DEVIN] }),
    event({ id: "today", date: TODAY, people: [DEVIN] }),
    event({ id: "future", date: "2026-08-01", people: [DEVIN] }),
  ];

  it("returns past events most recent first", () => {
    expect(pastEvents(events, TODAY).map((e) => e.id)).toEqual(["recent", "old"]);
  });

  it("does not treat today as past", () => {
    expect(pastEvents(events, TODAY).some((e) => e.id === "today")).toBe(false);
  });

  it("filters by person", () => {
    expect(pastEvents(events, TODAY, { personId: "p-cindy" })).toEqual([]);
  });
});

describe("nextEventForPerson", () => {
  it("returns the soonest event, including today", () => {
    const events = [
      event({ id: "today", date: TODAY, people: [DEVIN] }),
      event({ id: "later", date: "2026-08-01", people: [DEVIN] }),
    ];
    expect(nextEventForPerson(events, "p-devin", TODAY)?.id).toBe("today");
  });

  it("returns null when there is nothing", () => {
    expect(nextEventForPerson([], "p-devin", TODAY)).toBeNull();
  });
});

describe("groupByDay", () => {
  it("buckets events into ordered days", () => {
    const events = [
      event({ id: "b", date: "2026-07-20" }),
      event({ id: "a1", date: "2026-07-15" }),
      event({ id: "a2", date: "2026-07-15" }),
    ];

    const groups = groupByDay(events);
    expect(groups.map((group) => group.date)).toEqual(["2026-07-15", "2026-07-20"]);
    expect(groups[0].events).toHaveLength(2);
  });

  it("returns an empty array for no events", () => {
    expect(groupByDay([])).toEqual([]);
  });
});

describe("daysWithEvents", () => {
  it("includes every day of a multi-day event", () => {
    const camp = event({ date: "2026-07-13", endDate: "2026-07-15" });
    const days = daysWithEvents([camp]);
    expect([...days].sort()).toEqual(["2026-07-13", "2026-07-14", "2026-07-15"]);
  });
});

describe("peopleInEvents", () => {
  it("dedupes by id and sorts by name", () => {
    const events = [event({ people: [DEVIN, CINDY] }), event({ people: [DEVIN, JOHN] })];
    expect(peopleInEvents(events).map((p) => p.displayName)).toEqual(["Cindy", "Devin", "John"]);
  });
});

describe("describeParticipants", () => {
  it("phrases the participant list naturally", () => {
    expect(describeParticipants(event({ people: [] }))).toBe("No one assigned");
    expect(describeParticipants(event({ people: [DEVIN] }))).toBe("Devin");
    expect(describeParticipants(event({ people: [DEVIN, CINDY] }))).toBe("Devin & Cindy");
    expect(describeParticipants(event({ people: [DEVIN, CINDY, JOHN] }))).toBe(
      "Devin, Cindy & John",
    );
  });

  it("preserves the order people were listed in", () => {
    // Not alphabetized: on a bread-and-cup rota the order says who does what,
    // so "Cindy & Devin" and "Devin & Cindy" are different statements.
    expect(describeParticipants(event({ people: [CINDY, DEVIN] }))).toBe("Cindy & Devin");
    expect(describeParticipants(event({ people: [DEVIN, CINDY] }))).toBe("Devin & Cindy");
  });
});

describe("event ordering does not disturb participant order", () => {
  it("keeps each event's people in their given order after sorting", () => {
    const events = [
      event({ id: "b", date: "2026-07-20", people: [CINDY, DEVIN] }),
      event({ id: "a", date: "2026-07-16", people: [JOHN, CINDY] }),
    ];

    const sorted = sortEvents(events);
    expect(sorted.map((e) => e.id)).toEqual(["a", "b"]);
    expect(sorted[0].people.map((p) => p.displayName)).toEqual(["John", "Cindy"]);
    expect(sorted[1].people.map((p) => p.displayName)).toEqual(["Cindy", "Devin"]);
  });
});

describe("visibleSchedules", () => {
  it("hides disabled schedules and sorts by display order", () => {
    const schedules = [
      schedule({ id: "c", name: "Smarties", displayOrder: 2 }),
      schedule({ id: "a", name: "Regular", displayOrder: 0 }),
      schedule({ id: "x", name: "Old", displayOrder: 1, enabled: false }),
      schedule({ id: "b", name: "Breakbread", displayOrder: 1 }),
    ];

    expect(visibleSchedules(schedules).map((s) => s.id)).toEqual(["a", "b", "c"]);
  });
});

describe("resolveSelectedPerson", () => {
  const people = [
    { id: "p-devin", displayName: "Devin" },
    { id: "p-cindy", displayName: "Cindy" },
  ];

  it("matches on id first", () => {
    expect(resolveSelectedPerson(people, { id: "p-cindy" })?.id).toBe("p-cindy");
  });

  it("falls back to the name when the id has changed", () => {
    // The stored id is stale, e.g. the person row was recreated by a sync.
    expect(resolveSelectedPerson(people, { id: "gone", displayName: "Devin" })?.id).toBe("p-devin");
  });

  it("matches the name case-insensitively", () => {
    expect(resolveSelectedPerson(people, { displayName: "  DEVIN " })?.id).toBe("p-devin");
  });

  it("returns null when nothing matches", () => {
    expect(resolveSelectedPerson(people, { id: "gone", displayName: "Nobody" })).toBeNull();
    expect(resolveSelectedPerson(people, null)).toBeNull();
  });
});

describe("multiple schedules together", () => {
  const schedules = [
    schedule({ id: "s-regular", name: "Regular Calendar", displayOrder: 0 }),
    schedule({ id: "s-bread", name: "Breakbread", displayOrder: 1 }),
    schedule({ id: "s-smarties", name: "Smarties", displayOrder: 2 }),
    schedule({ id: "s-senior", name: "Senior Visit", displayOrder: 3 }),
  ];

  const events = [
    event({ id: "r1", scheduleId: "s-regular", date: TODAY, people: [DEVIN] }),
    event({ id: "b1", scheduleId: "s-bread", date: TODAY, people: [DEVIN, CINDY] }),
    event({ id: "sm1", scheduleId: "s-smarties", date: "2026-07-19", people: [CINDY] }),
    event({ id: "sv1", scheduleId: "s-senior", date: "2026-07-25", people: [DEVIN, JOHN] }),
  ];

  it("shows one person their duties across every schedule", () => {
    expect(eventsOnDay(events, TODAY, { personId: "p-devin" }).map((e) => e.id)).toEqual([
      "b1",
      "r1",
    ]);
    expect(upcomingEvents(events, TODAY, { personId: "p-devin" }).map((e) => e.id)).toEqual(["sv1"]);
  });

  it("narrows to selected schedules", () => {
    const result = upcomingEvents(events, TODAY, {
      scheduleIds: ["s-smarties"],
      includeToday: true,
    });
    expect(result.map((e) => e.id)).toEqual(["sm1"]);
  });

  it("combines a person and a schedule filter", () => {
    const result = upcomingEvents(events, TODAY, {
      personId: "p-cindy",
      scheduleIds: ["s-smarties"],
      includeToday: true,
    });
    expect(result.map((e) => e.id)).toEqual(["sm1"]);
  });

  it("keeps the schedules in the order an admin arranged", () => {
    expect(visibleSchedules(schedules).map((s) => s.name)).toEqual([
      "Regular Calendar",
      "Breakbread",
      "Smarties",
      "Senior Visit",
    ]);
  });
});
