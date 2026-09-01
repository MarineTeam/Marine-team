import { describe, expect, it } from "vitest";
import {
  eventWhen,
  placesLeft,
  promotable,
  registrationMessage,
  registrationState,
  seatsTaken,
} from "./events";

/**
 * The number, not the form.
 *
 * An event with sixty places and sixty-one people wanting them has to give the
 * sixty-first a straight answer. Everything that decides what that answer is
 * lives here, driven without a database, so the rules are pinned in one place
 * and the transaction that enforces them has something to be checked against.
 */

const going = (guests: number) => ({ guests, status: "GOING" });
const waiting = (guests: number) => ({ guests, status: "WAITLIST" });

const base = {
  registration: true,
  capacity: 10 as number | null,
  waitlist: true,
  opensAt: null as Date | null,
  closesAt: null as Date | null,
  startsAt: new Date("2026-10-10T10:00:00Z"),
  endsAt: null as Date | null,
};
const before = new Date("2026-10-01T12:00:00Z");

describe("seatsTaken", () => {
  it("counts a guest as a place, because a guest sits somewhere", () => {
    expect(seatsTaken([going(0), going(2), going(1)])).toBe(6);
  });

  it("ignores the waiting list and the cancelled", () => {
    expect(seatsTaken([going(0), waiting(3), { guests: 5, status: "CANCELLED" }])).toBe(1);
  });

  it("is zero for nobody", () => {
    expect(seatsTaken([])).toBe(0);
  });
});

describe("placesLeft", () => {
  it("never goes negative, even when an organiser lowers the capacity below what is booked", () => {
    expect(placesLeft({ capacity: 10 }, 14)).toBe(0);
  });

  it("is null for an event with no limit", () => {
    expect(placesLeft({ capacity: null }, 400)).toBe(null);
  });
});

describe("registrationState", () => {
  it("offers sign-up when there is room and the window is open", () => {
    expect(registrationState(base, 4, before)).toBe("open");
  });

  it("says nothing about sign-up for an event that doesn't take it", () => {
    expect(registrationState({ ...base, registration: false }, 0, before)).toBe("off");
  });

  it("leads with the event being over, not with sign-up having closed", () => {
    // Both are true. Only one of them stops somebody waiting for it to reopen.
    const past = { ...base, closesAt: new Date("2026-09-01T00:00:00Z") };
    expect(registrationState(past, 0, new Date("2026-11-01T00:00:00Z"))).toBe("past");
  });

  it("counts an event as over only once it has finished, not once it has started", () => {
    const spanning = { ...base, endsAt: new Date("2026-10-12T10:00:00Z") };
    expect(registrationState(spanning, 0, new Date("2026-10-11T10:00:00Z"))).toBe("open");
  });

  it("distinguishes not open yet from closed", () => {
    expect(
      registrationState({ ...base, opensAt: new Date("2026-10-05T00:00:00Z") }, 0, before),
    ).toBe("not-open-yet");
    expect(
      registrationState({ ...base, closesAt: new Date("2026-09-30T00:00:00Z") }, 0, before),
    ).toBe("closed");
  });

  it("offers the waiting list when full, and refuses outright when there isn't one", () => {
    expect(registrationState(base, 10, before)).toBe("waitlist-only");
    expect(registrationState({ ...base, waitlist: false }, 10, before)).toBe("full");
  });

  it("stays open for an event with no capacity however many have signed up", () => {
    expect(registrationState({ ...base, capacity: null }, 5000, before)).toBe("open");
  });
});

describe("registrationMessage", () => {
  it("counts places down and gets the singular right", () => {
    expect(registrationMessage("open", 1)).toBe("1 place left.");
    expect(registrationMessage("open", 7)).toBe("7 places left.");
  });

  it("says nothing about a number an unlimited event doesn't have", () => {
    expect(registrationMessage("open", null)).toBe("");
  });
});

describe("promotable", () => {
  it("moves whoever fits, in the order they joined", () => {
    const queue = [waiting(0), waiting(0), waiting(0)];
    expect(promotable(queue, 2)).toEqual([queue[0], queue[1]]);
  });

  it("stops at the first party that doesn't fit rather than skipping over them", () => {
    // Two places free, a family of four at the front, a couple behind them.
    // Seating the couple would be passing over the family — the thing people
    // notice and rightly resent. Nobody moves.
    const family = waiting(3);
    const couple = waiting(1);
    expect(promotable([family, couple], 2)).toEqual([]);
  });

  it("moves the whole queue when there is no limit at all", () => {
    const queue = [waiting(9), waiting(0)];
    expect(promotable(queue, null)).toEqual(queue);
  });

  it("moves nobody when nothing freed up", () => {
    expect(promotable([waiting(0)], 0)).toEqual([]);
  });
});

describe("eventWhen", () => {
  const at = (iso: string) => new Date(iso);

  it("gives a day and a time", () => {
    expect(eventWhen({ startsAt: at("2026-10-10T09:30:00Z"), endsAt: null, allDay: false })).toContain(
      "Saturday, 10 October 2026",
    );
  });

  it("gives one day for an all-day event rather than a midnight time", () => {
    expect(eventWhen({ startsAt: at("2026-10-10T00:00:00Z"), endsAt: null, allDay: true })).toBe(
      "Saturday, 10 October 2026",
    );
  });

  it("runs two dates together for something spanning days", () => {
    const label = eventWhen({
      startsAt: at("2026-10-10T00:00:00Z"),
      endsAt: at("2026-10-12T00:00:00Z"),
      allDay: true,
    });
    expect(label).toContain("10 October 2026");
    expect(label).toContain("12 October 2026");
  });
});
