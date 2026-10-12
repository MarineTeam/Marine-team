import { describe, it, expect } from "vitest";
import {
  checkPledge,
  countsToward,
  describeProgress,
  expectedBy,
  fallingBehind,
  instalmentsDue,
  progressOf,
  publicSummary,
  receivedFrom,
  receivedTotal,
  summarise,
  totalInstalments,
  visiblePledges,
  type Campaign,
  type GiftForCampaign,
  type PledgeRow,
} from "./pledges";

const TODAY = "2026-10-12";

const campaign = (over: Partial<Campaign> = {}): Campaign => ({
  id: "c1",
  name: "The roof",
  fundId: "roof",
  target: 40_000_00,
  startsOn: "2026-01-01",
  endsOn: "2027-12-31",
  closed: false,
  ...over,
});

const pledge = (over: Partial<PledgeRow> = {}): PledgeRow => ({
  id: "p1",
  campaignId: "c1",
  householdId: "h1",
  personId: null,
  amount: 1200_00,
  schedule: "MONTHLY",
  startsOn: "2026-01-01",
  endsOn: "2026-12-01",
  status: "ACTIVE",
  nameMayBeShown: false,
  ...over,
});

const gift = (over: Partial<GiftForCampaign> = {}): GiftForCampaign => ({
  amount: 100_00,
  fundId: "roof",
  givenAt: "2026-06-01",
  householdId: "h1",
  giverId: null,
  status: "SETTLED",
  ...over,
});

describe("countsToward", () => {
  it("counts a settled gift to the fund inside the dates", () => {
    expect(countsToward(gift(), campaign())).toBe(true);
  });

  it("ignores another fund", () => {
    expect(countsToward(gift({ fundId: "general" }), campaign())).toBe(false);
  });

  it("ignores a refund", () => {
    // The money went back. An appeal total that counts it disagrees with the
    // bank.
    expect(countsToward(gift({ status: "REFUNDED" }), campaign())).toBe(false);
  });

  it("ignores one given before the campaign opened or after it closed", () => {
    expect(countsToward(gift({ givenAt: "2025-12-31" }), campaign())).toBe(false);
    expect(countsToward(gift({ givenAt: "2028-01-01" }), campaign())).toBe(false);
  });

  it("counts the first and last day", () => {
    expect(countsToward(gift({ givenAt: "2026-01-01" }), campaign())).toBe(true);
    expect(countsToward(gift({ givenAt: "2027-12-31" }), campaign())).toBe(true);
  });

  it("has no end for an open-ended appeal", () => {
    expect(countsToward(gift({ givenAt: "2099-01-01" }), campaign({ endsOn: null }))).toBe(true);
  });
});

describe("receivedTotal and receivedFrom", () => {
  const gifts = [
    gift({ amount: 500_00, householdId: "h1" }),
    gift({ amount: 300_00, householdId: "h2" }),
    gift({ amount: 999_00, householdId: "h3", fundId: "general" }),
  ];

  it("counts everybody's money, pledged or not", () => {
    // Most people give to an appeal without ever filling in a card.
    expect(receivedTotal(gifts, campaign())).toBe(800_00);
  });

  it("attributes to a household", () => {
    expect(receivedFrom(gifts, campaign(), { householdId: "h1", personId: null })).toBe(500_00);
  });

  it("falls back to the person when there is no household", () => {
    const personal = [gift({ amount: 250_00, householdId: null, giverId: "p9" })];
    expect(receivedFrom(personal, campaign(), { householdId: null, personId: "p9" })).toBe(250_00);
  });

  it("gives nothing to a pledge attached to nobody", () => {
    expect(receivedFrom(gifts, campaign(), { householdId: null, personId: null })).toBe(0);
  });
});

describe("instalmentsDue", () => {
  it("counts an instalment due on its date, not after it", () => {
    // A treasurer asking "has March been paid?" in March wants March counted.
    const monthly = pledge({ startsOn: "2026-01-01", endsOn: "2026-12-01" });
    expect(instalmentsDue(monthly, "2026-03-15")).toBe(3);
    expect(instalmentsDue(monthly, "2026-01-01")).toBe(1);
  });

  it("is nothing before the pledge starts", () => {
    expect(instalmentsDue(pledge({ startsOn: "2027-01-01" }), TODAY)).toBe(0);
  });

  it("stops at the number the pledge actually contains", () => {
    // Otherwise a finished promise accrues phantom arrears for ever.
    const monthly = pledge({ startsOn: "2026-01-01", endsOn: "2026-12-01" });
    expect(instalmentsDue(monthly, "2030-01-01")).toBe(12);
  });

  it("handles a one-off", () => {
    const once = pledge({ schedule: "ONE_OFF", endsOn: null, startsOn: "2026-06-01" });
    expect(instalmentsDue(once, "2026-05-31")).toBe(0);
    expect(instalmentsDue(once, "2026-06-01")).toBe(1);
    expect(instalmentsDue(once, "2030-01-01")).toBe(1);
  });

  it("handles weekly", () => {
    const weekly = pledge({ schedule: "WEEKLY", startsOn: "2026-01-01", endsOn: "2026-03-05" });
    expect(instalmentsDue(weekly, "2026-01-01")).toBe(1);
    expect(instalmentsDue(weekly, "2026-01-08")).toBe(2);
    expect(instalmentsDue(weekly, "2026-01-14")).toBe(2);
  });

  it("handles quarterly and annual", () => {
    const quarterly = pledge({ schedule: "QUARTERLY", startsOn: "2026-01-01", endsOn: "2026-10-01" });
    expect(instalmentsDue(quarterly, "2026-01-15")).toBe(1);
    expect(instalmentsDue(quarterly, "2026-04-01")).toBe(2);
    const annual = pledge({ schedule: "ANNUAL", startsOn: "2026-01-01", endsOn: "2028-01-01" });
    expect(instalmentsDue(annual, "2026-06-01")).toBe(1);
    expect(instalmentsDue(annual, "2027-01-01")).toBe(2);
  });

  it("keeps counting on an open-ended promise", () => {
    const open = pledge({ endsOn: null, startsOn: "2026-01-01" });
    expect(instalmentsDue(open, "2027-01-01")).toBe(13);
  });
});

describe("totalInstalments", () => {
  it("is one for a one-off", () => {
    expect(totalInstalments(pledge({ schedule: "ONE_OFF", endsOn: null }))).toBe(1);
  });

  it("counts both ends of a monthly span", () => {
    expect(totalInstalments(pledge({ startsOn: "2026-01-01", endsOn: "2026-12-01" }))).toBe(12);
  });

  it("is unknown without an end date", () => {
    // "£20 a month until the roof is done" is a real thing somebody says.
    expect(totalInstalments(pledge({ endsOn: null }))).toBeNull();
  });
});

describe("expectedBy", () => {
  const monthly = pledge({ amount: 1200_00, startsOn: "2026-01-01", endsOn: "2026-12-01" });

  it("builds up over the schedule", () => {
    expect(expectedBy(monthly, "2026-01-15")).toBe(100_00);
    expect(expectedBy(monthly, "2026-06-15")).toBe(600_00);
  });

  it("never exceeds the whole promise", () => {
    expect(expectedBy(monthly, "2026-12-31")).toBe(1200_00);
    expect(expectedBy(monthly, "2030-01-01")).toBe(1200_00);
  });

  it("is nothing before it starts", () => {
    expect(expectedBy(monthly, "2025-12-31")).toBe(0);
  });

  it("lets the last instalment absorb the rounding", () => {
    // 1000 over 3 is 333.33; the giver should not look 1p short at the end.
    const awkward = pledge({ amount: 1000, schedule: "MONTHLY", startsOn: "2026-01-01", endsOn: "2026-03-01" });
    expect(expectedBy(awkward, "2026-01-15")).toBe(333);
    expect(expectedBy(awkward, "2026-03-15")).toBe(1000);
  });

  it("expects the whole thing on an open-ended promise", () => {
    expect(expectedBy(pledge({ endsOn: null }), "2026-06-01")).toBe(1200_00);
  });
});

describe("progressOf", () => {
  it("reports what arrived against what was promised", () => {
    const row = progressOf(pledge({ amount: 1000_00 }), 400_00, "2026-06-15");
    expect(row).toMatchObject({ pledged: 1000_00, received: 400_00, fulfilled: false });
  });

  it("does not discard generosity", () => {
    // Somebody who promised £500 and gave £700 has given £700.
    const row = progressOf(pledge({ amount: 500_00 }), 700_00, TODAY);
    expect(row.received).toBe(700_00);
    expect(row.fraction).toBe(1);
    expect(row.fulfilled).toBe(true);
  });

  it("says how far ahead or behind the schedule they are", () => {
    const monthly = pledge({ amount: 1200_00, startsOn: "2026-01-01", endsOn: "2026-12-01" });
    expect(progressOf(monthly, 600_00, "2026-06-15").aheadBy).toBe(0);
    expect(progressOf(monthly, 100_00, "2026-06-15").aheadBy).toBe(-500_00);
    expect(progressOf(monthly, 900_00, "2026-06-15").aheadBy).toBe(300_00);
  });

  it("copes with a nought pledge rather than dividing by it", () => {
    expect(progressOf(pledge({ amount: 0 }), 0, TODAY).fraction).toBe(0);
  });
});

describe("summarise", () => {
  const gifts = [
    gift({ amount: 500_00, householdId: "h1" }),
    gift({ amount: 300_00, householdId: "nobody-pledged" }),
  ];
  const pledges = [pledge({ id: "p1", householdId: "h1", amount: 1200_00 })];

  it("keeps target, pledged and received as three separate numbers", () => {
    // The whole feature turns on this. One figure gets read as money in the
    // bank, and a church signs a contract it cannot pay for.
    const summary = summarise({ campaign: campaign(), pledges, gifts, today: TODAY });
    expect(summary.target).toBe(40_000_00);
    expect(summary.pledged).toBe(1200_00);
    expect(summary.received).toBe(800_00);
  });

  it("counts money from people who never pledged", () => {
    const summary = summarise({ campaign: campaign(), pledges, gifts, today: TODAY });
    expect(summary.received).toBe(800_00);
    expect(summary.receivedFromPledgers).toBe(500_00);
  });

  it("reports what is still promised but not arrived", () => {
    const summary = summarise({ campaign: campaign(), pledges, gifts, today: TODAY });
    expect(summary.outstanding).toBe(700_00);
  });

  it("never reports a negative debt when pledgers gave extra", () => {
    const generous = [gift({ amount: 5000_00, householdId: "h1" })];
    const summary = summarise({ campaign: campaign(), pledges, gifts: generous, today: TODAY });
    expect(summary.outstanding).toBe(0);
  });

  it("leaves a cancelled pledge out of the promised total", () => {
    const withCancelled = [...pledges, pledge({ id: "p2", householdId: "h2", status: "CANCELLED", amount: 9999_00 })];
    const summary = summarise({ campaign: campaign(), pledges: withCancelled, gifts, today: TODAY });
    expect(summary.pledged).toBe(1200_00);
    expect(summary.pledgeCount).toBe(1);
  });

  it("measures against the target, capped", () => {
    const summary = summarise({
      campaign: campaign({ target: 400_00 }),
      pledges,
      gifts,
      today: TODAY,
    });
    expect(summary.fractionOfTarget).toBe(1);
  });

  it("has no fraction when the campaign names no figure", () => {
    const summary = summarise({ campaign: campaign({ target: null }), pledges, gifts, today: TODAY });
    expect(summary.fractionOfTarget).toBeNull();
  });
});

describe("describeProgress", () => {
  const money = (pence: number) => `£${(pence / 100).toFixed(0)}`;

  it("says received and promised in one breath", () => {
    // Harder to misquote than a single large number on a tile.
    const summary = summarise({
      campaign: campaign(),
      pledges: [pledge({ amount: 1200_00 })],
      gifts: [gift({ amount: 500_00 })],
      today: TODAY,
    });
    expect(describeProgress(summary, money)).toBe(
      "£500 received, £1200 promised, of £40000 asked for.",
    );
  });

  it("leaves out what the campaign does not have", () => {
    const summary = summarise({
      campaign: campaign({ target: null }),
      pledges: [],
      gifts: [gift({ amount: 500_00 })],
      today: TODAY,
    });
    expect(describeProgress(summary, money)).toBe("£500 received.");
  });
});

describe("fallingBehind", () => {
  const monthly = (over: Partial<PledgeRow> = {}) =>
    pledge({ amount: 1200_00, startsOn: "2026-01-01", endsOn: "2026-12-01", ...over });

  it("names who is behind the schedule, furthest first", () => {
    const rows = fallingBehind(
      [
        { pledge: monthly({ id: "a" }), received: 100_00 },
        { pledge: monthly({ id: "b" }), received: 500_00 },
      ],
      "2026-06-15",
    );
    expect(rows.map((row) => row.pledge.id)).toEqual(["a", "b"]);
    expect(rows[0].behindBy).toBe(500_00);
  });

  it("leaves out anybody keeping up or ahead", () => {
    expect(fallingBehind([{ pledge: monthly(), received: 600_00 }], "2026-06-15")).toEqual([]);
    expect(fallingBehind([{ pledge: monthly(), received: 900_00 }], "2026-06-15")).toEqual([]);
  });

  it("ignores a penny of rounding", () => {
    expect(fallingBehind([{ pledge: monthly(), received: 599_99 }], "2026-06-15")).toEqual([]);
  });

  it("leaves cancelled and fulfilled pledges alone", () => {
    const rows = fallingBehind(
      [
        { pledge: monthly({ status: "CANCELLED" }), received: 0 },
        { pledge: monthly({ status: "FULFILLED" }), received: 0 },
      ],
      "2026-06-15",
    );
    expect(rows).toEqual([]);
  });

  it("changes nobody's status — it only reports", () => {
    // Somebody three weeks late may have been in hospital.
    const row = monthly();
    fallingBehind([{ pledge: row, received: 0 }], "2026-06-15");
    expect(row.status).toBe("ACTIVE");
  });
});

describe("checkPledge", () => {
  const good = { amount: 1200_00, schedule: "MONTHLY" as const, startsOn: "2026-01-01", endsOn: "2026-12-01" };

  it("accepts an ordinary promise", () => {
    expect(checkPledge(good).ok).toBe(true);
  });

  it("accepts a recurring one with no end", () => {
    expect(checkPledge({ ...good, endsOn: null }).ok).toBe(true);
  });

  it("refuses nought, and fractions of a penny", () => {
    expect(checkPledge({ ...good, amount: 0 }).ok).toBe(false);
    expect(checkPledge({ ...good, amount: -500 }).ok).toBe(false);
    expect(checkPledge({ ...good, amount: 12.5 }).ok).toBe(false);
  });

  it("refuses one that ends before it starts", () => {
    expect(checkPledge({ ...good, endsOn: "2025-01-01" }).ok).toBe(false);
  });

  it("refuses an end date on a one-off", () => {
    expect(checkPledge({ ...good, schedule: "ONE_OFF" }).ok).toBe(false);
  });
});

describe("visiblePledges", () => {
  const rows = [
    pledge({ id: "mine", householdId: "h1" }),
    pledge({ id: "theirs", householdId: "h2" }),
    pledge({ id: "personal", householdId: null, personId: "p9" }),
  ];

  it("gives the office the list", () => {
    expect(visiblePledges(rows, { manages: true, householdId: null, personId: null })).toHaveLength(3);
  });

  it("gives a member their own and nothing else", () => {
    // An array of at most one, not a flag: a page cannot total what it was
    // never handed.
    const mine = visiblePledges(rows, { manages: false, householdId: "h1", personId: null });
    expect(mine.map((row) => row.id)).toEqual(["mine"]);
  });

  it("matches on the person when they have no household", () => {
    const mine = visiblePledges(rows, { manages: false, householdId: null, personId: "p9" });
    expect(mine.map((row) => row.id)).toEqual(["personal"]);
  });

  it("gives a stranger nothing", () => {
    expect(visiblePledges(rows, { manages: false, householdId: null, personId: null })).toEqual([]);
  });
});

describe("publicSummary", () => {
  it("keeps the church-wide figures and drops the rest", () => {
    const summary = summarise({
      campaign: campaign(),
      pledges: [pledge({ amount: 1200_00 })],
      gifts: [gift({ amount: 500_00 })],
      today: TODAY,
    });
    const shown = publicSummary(summary);
    expect(shown).toEqual({ target: 40_000_00, received: 500_00, fractionOfTarget: 0.0125 });
  });

  it("never carries what was promised, or who promised it", () => {
    const summary = summarise({
      campaign: campaign(),
      pledges: [pledge({ amount: 1200_00 })],
      gifts: [gift({ amount: 500_00 })],
      today: TODAY,
    });
    const serialised = JSON.stringify(publicSummary(summary));
    expect(serialised).not.toContain("pledged");
    expect(serialised).not.toContain("outstanding");
    expect(serialised).not.toContain("pledgeCount");
  });
});
