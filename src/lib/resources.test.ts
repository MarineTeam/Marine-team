import { describe, it, expect } from "vitest";
import {
  capacityWarning,
  conflictMessage,
  conflictsWith,
  describeResource,
  inTimeOrder,
  onDay,
  overlaps,
  spanIsValid,
  type Booking,
  type ResourceRow,
} from "./resources";

const at = (hour: number, minute = 0) => new Date(Date.UTC(2026, 8, 20, hour, minute));
const booking = (over: Partial<Booking> = {}): Booking => ({
  id: "b1", resourceId: "hall", title: "Messy Church", eventId: null,
  startsAt: at(10), endsAt: at(12), ...over,
});

const hall: ResourceRow = { id: "hall", name: "Main hall", kind: "ROOM", capacity: 80, active: true };

describe("spanIsValid", () => {
  it("wants a span the right way round with some duration", () => {
    expect(spanIsValid({ startsAt: at(10), endsAt: at(11) })).toBe(true);
    expect(spanIsValid({ startsAt: at(11), endsAt: at(10) })).toBe(false);
    expect(spanIsValid({ startsAt: at(10), endsAt: at(10) })).toBe(false);
    expect(spanIsValid({ startsAt: new Date("nonsense"), endsAt: at(10) })).toBe(false);
  });
});

describe("overlaps", () => {
  it("finds a real clash", () => {
    expect(overlaps({ startsAt: at(10), endsAt: at(12) }, { startsAt: at(11), endsAt: at(13) })).toBe(true);
  });

  it("lets back-to-back bookings alone — the decision the feature turns on", () => {
    // A checker that calls 10–11 and 11–12 a conflict gets switched off.
    expect(overlaps({ startsAt: at(10), endsAt: at(11) }, { startsAt: at(11), endsAt: at(12) })).toBe(false);
    expect(overlaps({ startsAt: at(11), endsAt: at(12) }, { startsAt: at(10), endsAt: at(11) })).toBe(false);
  });

  it("catches one booking wholly inside another", () => {
    expect(overlaps({ startsAt: at(10), endsAt: at(14) }, { startsAt: at(11), endsAt: at(12) })).toBe(true);
    expect(overlaps({ startsAt: at(11), endsAt: at(12) }, { startsAt: at(10), endsAt: at(14) })).toBe(true);
  });

  it("is not fooled by a one-minute overlap", () => {
    expect(overlaps({ startsAt: at(10), endsAt: at(11, 1) }, { startsAt: at(11), endsAt: at(12) })).toBe(true);
  });
});

describe("conflictsWith", () => {
  const existing = [booking(), booking({ id: "b2", resourceId: "kitchen", startsAt: at(10), endsAt: at(12) })];

  it("only clashes with the same resource", () => {
    expect(conflictsWith({ resourceId: "hall", startsAt: at(11), endsAt: at(13) }, existing).map((b) => b.id))
      .toEqual(["b1"]);
    expect(conflictsWith({ resourceId: "vestry", startsAt: at(11), endsAt: at(13) }, existing)).toEqual([]);
  });

  it("returns what it clashed with, not just that it did", () => {
    const [clash] = conflictsWith({ resourceId: "hall", startsAt: at(11), endsAt: at(13) }, existing);
    expect(clash.title).toBe("Messy Church");
  });

  it("doesn't clash a booking with itself when it is being edited", () => {
    expect(conflictsWith({ resourceId: "hall", startsAt: at(10), endsAt: at(12) }, existing, "b1")).toEqual([]);
  });

  it("says something a person can act on", () => {
    const clashes = conflictsWith({ resourceId: "hall", startsAt: at(11), endsAt: at(13) }, existing);
    expect(conflictMessage(clashes, "Main hall")).toBe("Main hall is already booked for Messy Church, 10:00–12:00.");
    expect(conflictMessage([], "Main hall")).toBe("");
  });

  it("counts the rest when there are several", () => {
    const many = [booking(), booking({ id: "b3", startsAt: at(11), endsAt: at(14) })];
    const clashes = conflictsWith({ resourceId: "hall", startsAt: at(11), endsAt: at(12) }, many);
    expect(conflictMessage(clashes, "Main hall")).toContain("and 1 other");
  });
});

describe("capacityWarning", () => {
  it("warns but never refuses", () => {
    // Two soft numbers. Refusing on them is how people stop recording either.
    expect(capacityWarning(hall, 120)).toContain("holds 80");
    expect(capacityWarning(hall, 80)).toBeNull();
    expect(capacityWarning(hall, null)).toBeNull();
    expect(capacityWarning({ ...hall, capacity: null }, 500)).toBeNull();
  });
});

describe("inTimeOrder and onDay", () => {
  it("reads a day in order", () => {
    const rows = [booking({ id: "late", startsAt: at(14), endsAt: at(15) }), booking({ id: "early" })];
    expect(inTimeOrder(rows).map((b) => b.id)).toEqual(["early", "late"]);
  });

  it("finds what is on that day, including something spanning midnight", () => {
    const overnight = booking({
      id: "night",
      startsAt: new Date(Date.UTC(2026, 8, 19, 22)),
      endsAt: new Date(Date.UTC(2026, 8, 20, 2)),
    });
    const day = new Date(Date.UTC(2026, 8, 20, 12));
    expect(onDay([booking(), overnight], day).map((b) => b.id)).toEqual(["night", "b1"]);
  });

  it("leaves out a booking that merely ends as the day starts", () => {
    const before = booking({
      id: "yesterday",
      startsAt: new Date(Date.UTC(2026, 8, 19, 20)),
      endsAt: new Date(Date.UTC(2026, 8, 20, 0)),
    });
    expect(onDay([before], new Date(Date.UTC(2026, 8, 20, 12)))).toEqual([]);
  });
});

describe("describeResource", () => {
  it("says what it is and how big, without fuss for an ordinary room", () => {
    expect(describeResource(hall)).toBe("Main hall · holds 80");
    expect(describeResource({ id: "bus", name: "Minibus", kind: "VEHICLE", capacity: 16, active: true }))
      .toBe("Minibus · vehicle · holds 16");
    expect(describeResource({ id: "p", name: "Projector", kind: "EQUIPMENT", capacity: null, active: true }))
      .toBe("Projector · equipment");
  });
});
