import { createHmac } from "node:crypto";
import { describe, it, expect } from "vitest";
import {
  byFund,
  counted,
  formatMoney,
  parseMoney,
  readCheckout,
  readRefund,
  statementFor,
  taxYearOf,
  taxYearRange,
  total,
  webhookIsAuthentic,
  type FundRow,
  type GiftRow,
} from "./giving";

const funds: FundRow[] = [
  { id: "f1", name: "General", taxDeductible: true },
  { id: "f2", name: "Building", taxDeductible: true },
  { id: "f3", name: "Leaving present", taxDeductible: false },
];

const gift = (over: Partial<GiftRow> = {}): GiftRow => ({
  id: "g", amount: 1000, currency: "GBP", fundId: "f1", status: "SETTLED", source: "ONLINE",
  givenAt: new Date("2026-05-01T10:00:00Z"), householdId: "h1", giverId: "p1", ...over,
});

describe("money is integers of minor units", () => {
  it("parses what somebody types", () => {
    expect(parseMoney("12.34")).toBe(1234);
    expect(parseMoney("£20")).toBe(2000);
    expect(parseMoney(" 1,000.50 ")).toBe(100050);
    expect(parseMoney("0.05")).toBe(5);
    expect(parseMoney("5.5")).toBe(550);
  });

  it("refuses what isn't money", () => {
    for (const bad of ["", "abc", "1.234", "-5", "1.2.3", "1e3"]) {
      expect(parseMoney(bad), bad).toBeNull();
    }
  });

  it("adds up exactly, where a float would not", () => {
    // 0.1 + 0.2 in pence is 30, and stays 30 however many times it is added.
    const pennies = Array.from({ length: 3 }, () => gift({ amount: 10 }));
    expect(total(pennies)).toBe(30);
    const many = Array.from({ length: 1000 }, () => gift({ amount: 1 }));
    expect(total(many)).toBe(1000);
  });

  it("formats for display only", () => {
    expect(formatMoney(1234, "GBP", "en-GB")).toBe("£12.34");
  });
});

describe("counted", () => {
  it("leaves a refund out of every total but keeps the row", () => {
    const gifts = [gift({ amount: 1000 }), gift({ amount: 500, status: "REFUNDED" })];
    expect(total(gifts)).toBe(1000);
    expect(counted(gifts)).toHaveLength(1);
    expect(gifts).toHaveLength(2);
  });
});

describe("byFund", () => {
  it("totals each fund, biggest first", () => {
    const gifts = [
      gift({ fundId: "f1", amount: 1000 }),
      gift({ fundId: "f2", amount: 5000 }),
      gift({ fundId: "f1", amount: 250 }),
    ];
    expect(byFund(gifts, funds)).toEqual([
      { fundId: "f2", fundName: "Building", amount: 5000, gifts: 1 },
      { fundId: "f1", fundName: "General", amount: 1250, gifts: 2 },
    ]);
  });

  it("names a fund it doesn't know rather than dropping the money", () => {
    expect(byFund([gift({ fundId: "gone" })], funds)[0].fundName).toBe("Unknown fund");
  });
});

describe("taxYearOf", () => {
  it("uses the UK year by default — 6 April to 5 April", () => {
    expect(taxYearOf(new Date("2026-04-05T12:00:00Z"))).toBe(2025);
    expect(taxYearOf(new Date("2026-04-06T00:00:00Z"))).toBe(2026);
    expect(taxYearOf(new Date("2026-12-31T23:00:00Z"))).toBe(2026);
  });

  it("takes a different year start, because most of the world has one", () => {
    expect(taxYearOf(new Date("2026-04-05T12:00:00Z"), 1, 1)).toBe(2026);
    expect(taxYearOf(new Date("2026-01-01T00:00:00Z"), 1, 1)).toBe(2026);
  });

  it("gives a range that meets the next one exactly", () => {
    const a = taxYearRange(2026);
    const b = taxYearRange(2027);
    expect(a.to.getTime()).toBe(b.from.getTime());
    expect(a.from.toISOString()).toBe("2026-04-06T00:00:00.000Z");
  });
});

describe("statementFor", () => {
  const base = { householdId: "h1", householdName: "The Bells", taxYear: 2026, funds };

  it("covers only that household, and only that year", () => {
    const statement = statementFor({
      ...base,
      gifts: [
        gift({ amount: 1000, givenAt: new Date("2026-05-01T00:00:00Z") }),
        gift({ amount: 2000, givenAt: new Date("2026-04-05T00:00:00Z") }), // last year
        gift({ amount: 4000, householdId: "h2" }), // somebody else
      ],
    });
    expect(statement.total).toBe(1000);
    expect(statement.lines).toHaveLength(1);
  });

  it("includes the first day of the year and excludes the first of the next", () => {
    const statement = statementFor({
      ...base,
      gifts: [
        gift({ amount: 100, givenAt: new Date("2026-04-06T00:00:00Z") }),
        gift({ amount: 200, givenAt: new Date("2027-04-06T00:00:00Z") }),
      ],
    });
    expect(statement.total).toBe(100);
  });

  it("leaves a refund out", () => {
    const statement = statementFor({
      ...base,
      gifts: [gift({ amount: 1000 }), gift({ amount: 9999, status: "REFUNDED" })],
    });
    expect(statement.total).toBe(1000);
  });

  it("excludes a fund that isn't claimable — and says how much, rather than hiding it", () => {
    // Somebody comparing this to their bank statement needs the difference to
    // be explicable.
    const statement = statementFor({
      ...base,
      gifts: [gift({ amount: 1000, fundId: "f1" }), gift({ amount: 750, fundId: "f3" })],
    });
    expect(statement.total).toBe(1000);
    expect(statement.excludedTotal).toBe(750);
    expect(statement.lines.map((line) => line.fundName)).toEqual(["General"]);
  });

  it("lists the lines oldest first, dated", () => {
    const statement = statementFor({
      ...base,
      gifts: [
        gift({ amount: 100, givenAt: new Date("2026-09-01T00:00:00Z") }),
        gift({ amount: 200, givenAt: new Date("2026-05-01T00:00:00Z") }),
      ],
    });
    expect(statement.lines.map((line) => line.date)).toEqual(["2026-05-01", "2026-09-01"]);
  });

  it("names the span in the household's own terms", () => {
    const statement = statementFor({ ...base, gifts: [] });
    expect([statement.from, statement.to]).toEqual(["2026-04-06", "2027-04-05"]);
    expect(statement.total).toBe(0);
  });
});

describe("webhookIsAuthentic", () => {
  const secret = "whsec_test";
  const body = '{"type":"checkout.session.completed"}';
  const now = new Date("2026-09-18T12:00:00Z");
  const sign = (timestamp: number, payload = body, key = secret) =>
    `t=${timestamp},v1=${createHmac("sha256", key).update(`${timestamp}.${payload}`).digest("hex")}`;

  it("accepts a fresh, correctly signed delivery", () => {
    const header = sign(Math.floor(now.getTime() / 1000));
    expect(webhookIsAuthentic({ body, header, secret, now })).toBe(true);
  });

  it("refuses a body that has been altered", () => {
    const header = sign(Math.floor(now.getTime() / 1000));
    expect(webhookIsAuthentic({ body: `${body} `, header, secret, now })).toBe(false);
  });

  it("refuses a signature that only starts right", () => {
    // A mutation that compared the first few characters survived every other
    // case here, because a signature from the wrong secret differs in its
    // first byte. This one shares all but the last.
    const timestamp = Math.floor(now.getTime() / 1000);
    const good = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
    const nearly = `${good.slice(0, -1)}${good.endsWith("a") ? "b" : "a"}`;
    expect(webhookIsAuthentic({ body, header: `t=${timestamp},v1=${nearly}`, secret, now })).toBe(false);
    // ...and one that is right but truncated.
    expect(webhookIsAuthentic({ body, header: `t=${timestamp},v1=${good.slice(0, 32)}`, secret, now })).toBe(false);
  });

  it("refuses a signature made with another secret", () => {
    const header = sign(Math.floor(now.getTime() / 1000), body, "whsec_other");
    expect(webhookIsAuthentic({ body, header, secret, now })).toBe(false);
  });

  it("refuses a delivery captured and replayed later", () => {
    const header = sign(Math.floor(now.getTime() / 1000) - 3600);
    expect(webhookIsAuthentic({ body, header, secret, now })).toBe(false);
  });

  it("accepts one signature among several, which is how a secret is rotated", () => {
    const timestamp = Math.floor(now.getTime() / 1000);
    const good = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
    const header = `t=${timestamp},v1=deadbeef,v1=${good}`;
    expect(webhookIsAuthentic({ body, header, secret, now })).toBe(true);
  });

  it("refuses a missing header, a missing secret, and nonsense", () => {
    expect(webhookIsAuthentic({ body, header: null, secret, now })).toBe(false);
    expect(webhookIsAuthentic({ body, header: sign(1), secret: "", now })).toBe(false);
    expect(webhookIsAuthentic({ body, header: "nonsense", secret, now })).toBe(false);
    expect(webhookIsAuthentic({ body, header: "t=abc,v1=def", secret, now })).toBe(false);
  });
});

describe("readCheckout", () => {
  const event = {
    type: "checkout.session.completed",
    data: {
      object: {
        id: "cs_test_123",
        amount_total: 2500,
        currency: "gbp",
        created: 1789000000,
        customer_details: { email: "ruth@example.test", name: "Ruth Bell" },
        metadata: { fund: "building", message: "For the roof" },
        payment_method_details: { card: { last4: "4242", brand: "visa", exp_month: 4 } },
      },
    },
  };

  it("keeps the handful of fields worth storing", () => {
    expect(readCheckout(event)).toEqual({
      externalId: "cs_test_123",
      amount: 2500,
      currency: "GBP",
      fundSlug: "building",
      email: "ruth@example.test",
      message: "For the roof",
      givenAt: new Date(1789000000 * 1000),
    });
  });

  it("keeps nothing about the card, even though the event carried it", () => {
    // A parser that keeps whatever it is given is how a last-four ends up in a
    // church database with nobody having decided to put it there.
    expect(JSON.stringify(readCheckout(event))).not.toMatch(/4242|visa|exp_month|last4/i);
  });

  it("ignores an event of another kind", () => {
    expect(readCheckout({ ...event, type: "customer.created" })).toBeNull();
  });

  it("refuses an amount that isn't a positive whole number of minor units", () => {
    const amount = (value: unknown) => ({ ...event, data: { object: { ...event.data.object, amount_total: value } } });
    expect(readCheckout(amount(0))).toBeNull();
    expect(readCheckout(amount(-100))).toBeNull();
    expect(readCheckout(amount(12.5))).toBeNull();
    expect(readCheckout(amount("2500"))).toBeNull();
  });

  it("copes with nothing at all", () => {
    expect(readCheckout(null)).toBeNull();
    expect(readCheckout("{}")).toBeNull();
    expect(readCheckout({ type: "checkout.session.completed" })).toBeNull();
  });
});

describe("readRefund", () => {
  it("finds the payment a refund belongs to", () => {
    expect(
      readRefund({ type: "charge.refunded", data: { object: { id: "ch_1", payment_intent: "pi_1" } } }),
    ).toBe("pi_1");
  });

  it("falls back to the object's own id", () => {
    expect(readRefund({ type: "charge.refunded", data: { object: { id: "ch_1" } } })).toBe("ch_1");
  });

  it("ignores anything else", () => {
    expect(readRefund({ type: "checkout.session.completed", data: { object: { id: "cs_1" } } })).toBeNull();
    expect(readRefund(null)).toBeNull();
  });
});
