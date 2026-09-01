import { describe, expect, it } from "vitest";
import { audienceLabel, planDelivery, progressOf, summariseSkips, type Candidate } from "./broadcast";

/**
 * The number on the screen has to be the number that goes out.
 *
 * A church with 400 members does not have 400 addresses it may write to, and
 * certainly not 400 numbers it may text. If the difference isn't shown before
 * sending, "I told everyone" is false and nobody finds out until a family
 * turns up to a cancelled service.
 */

const phone = (raw: string | null) => (raw && raw.startsWith("+") ? raw : null);

const person = (over: Partial<Candidate> & { userId: string | null }): Candidate => ({
  name: "Somebody",
  email: "a@example.org",
  phone: "+447700900123",
  smsOptIn: true,
  broadcastEmails: true,
  hasPushDevice: true,
  ...over,
});

describe("planDelivery", () => {
  it("reaches somebody on every channel they're set up for", () => {
    const plan = planDelivery([person({ userId: "u1" })], ["EMAIL", "SMS", "PUSH"], phone);
    expect(plan.reachable).toHaveLength(3);
    expect(plan.peopleReached).toBe(1);
    expect(plan.peopleMissed).toBe(0);
    expect(plan.perChannel).toEqual({ EMAIL: 1, SMS: 1, PUSH: 1 });
  });

  it("won't text somebody who never agreed to be texted", () => {
    // A text costs the church money and the recipient their attention, and
    // sending one uninvited is illegal in most places.
    const plan = planDelivery([person({ userId: "u1", smsOptIn: false })], ["SMS"], phone);
    expect(plan.reachable).toHaveLength(0);
    expect(plan.unreachable[0].reason).toBe("no-sms-consent");
  });

  it("emails by default, and stops for somebody who turned announcements off", () => {
    expect(planDelivery([person({ userId: "u1" })], ["EMAIL"], phone).reachable).toHaveLength(1);
    const off = planDelivery([person({ userId: "u1", broadcastEmails: false })], ["EMAIL"], phone);
    expect(off.reachable).toHaveLength(0);
    expect(off.unreachable[0].reason).toBe("unsubscribed");
  });

  it("skips a number it can't make sense of rather than sending it anyway", () => {
    const plan = planDelivery([person({ userId: "u1", phone: "ask Ruth" })], ["SMS"], phone);
    expect(plan.unreachable[0].reason).toBe("no-phone");
  });

  it("can't push to somebody with no account or no device", () => {
    const noAccount = planDelivery([person({ userId: null })], ["PUSH"], phone);
    expect(noAccount.unreachable[0].reason).toBe("no-push");
    const noDevice = planDelivery([person({ userId: "u1", hasPushDevice: false })], ["PUSH"], phone);
    expect(noDevice.unreachable[0].reason).toBe("no-push");
  });

  it("still emails somebody with no account — an event's sign-ups are full of them", () => {
    const plan = planDelivery([person({ userId: null, email: "visitor@example.org" })], ["EMAIL"], phone);
    expect(plan.reachable[0].address).toBe("visitor@example.org");
    expect(plan.peopleReached).toBe(1);
  });

  it("writes to somebody once even when they're in the audience twice", () => {
    // In the small group *and* signed up to the event is the common case.
    const twice = [person({ userId: "u1" }), person({ userId: "u1" })];
    expect(planDelivery(twice, ["EMAIL"], phone).reachable).toHaveLength(1);
  });

  it("dedupes account-less people by address, since they have no id to match on", () => {
    const twice = [
      person({ userId: null, email: "v@example.org" }),
      person({ userId: null, email: "V@example.org" }),
    ];
    expect(planDelivery(twice, ["EMAIL"], phone).reachable).toHaveLength(1);
  });

  it("counts somebody reached if any one channel works", () => {
    const plan = planDelivery(
      [person({ userId: "u1", smsOptIn: false, hasPushDevice: false })],
      ["EMAIL", "SMS", "PUSH"],
      phone,
    );
    expect(plan.peopleReached).toBe(1);
    expect(plan.peopleMissed).toBe(0);
    expect(plan.unreachable).toHaveLength(2);
  });

  it("counts somebody missed when nothing works — the number that matters", () => {
    const plan = planDelivery(
      [person({ userId: "u1", email: null, smsOptIn: false, hasPushDevice: false })],
      ["EMAIL", "SMS", "PUSH"],
      phone,
    );
    expect(plan.peopleReached).toBe(0);
    expect(plan.peopleMissed).toBe(1);
  });
});

describe("summariseSkips", () => {
  it("says why, commonest first", () => {
    const summary = summariseSkips([
      { name: "a", channel: "SMS", reason: "no-phone" },
      { name: "b", channel: "SMS", reason: "no-phone" },
      { name: "c", channel: "EMAIL", reason: "unsubscribed" },
    ]);
    expect(summary).toBe("2 no mobile number, 1 turned off announcement emails");
  });

  it("is empty when everybody is reachable", () => {
    expect(summariseSkips([])).toBe("");
  });
});

describe("audienceLabel", () => {
  it("still reads sensibly after the group it named is gone", () => {
    expect(audienceLabel("SMALL_GROUP", null)).toBe("A small group");
    expect(audienceLabel("SMALL_GROUP", "Tuesday, north side")).toBe("Small group: Tuesday, north side");
    expect(audienceLabel("EVERYONE", null)).toBe("Everyone");
  });
});

describe("progressOf", () => {
  it("counts anything not still pending as done", () => {
    expect(progressOf({ PENDING: 4, SENT: 10, FAILED: 1, SKIPPED: 5 })).toEqual({
      total: 20,
      done: 16,
      finished: false,
    });
  });

  it("is finished only when nothing is pending, failures included", () => {
    expect(progressOf({ PENDING: 0, SENT: 10, FAILED: 3, SKIPPED: 0 }).finished).toBe(true);
  });
});
