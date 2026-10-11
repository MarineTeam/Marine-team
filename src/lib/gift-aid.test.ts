import { describe, it, expect } from "vitest";
import {
  assess,
  BACK_CLAIM_YEARS,
  blockedSummary,
  claimDeadline,
  claimSchedule,
  claimValue,
  coversGift,
  declarationFor,
  declarationIsComplete,
  expiringSoon,
  isTooOld,
  needsWrittenConfirmation,
  summariseClaim,
  type ClaimableGift,
  type Declaration,
} from "./gift-aid";

const TODAY = "2026-10-11";

const declaration = (over: Partial<Declaration> = {}): Declaration => ({
  id: "d1",
  personId: "p1",
  madeOn: "2026-01-01",
  coversPast: true,
  withdrawnOn: null,
  firstName: "Ruth",
  lastName: "Bell",
  houseNumber: "14",
  postcode: "AB1 2CD",
  how: "PAPER",
  ...over,
});

const gift = (over: Partial<ClaimableGift> = {}): ClaimableGift => ({
  id: "g1",
  amount: 10000,
  givenAt: "2026-06-01",
  fundId: "f1",
  giverId: "p1",
  giftAidClaimId: null,
  status: "SETTLED",
  ...over,
});

const base = { declarations: [declaration()], eligibleFundIds: ["f1"], today: TODAY };

describe("coversGift", () => {
  it("covers a gift given after it was made", () => {
    expect(coversGift(declaration(), "2026-06-01")).toBe(true);
  });

  it("covers one given the same day it was signed", () => {
    // Somebody signs the form on Sunday morning and gives that morning. The
    // alternative is arguing with the paper in front of you.
    expect(coversGift(declaration({ madeOn: "2026-06-01" }), "2026-06-01")).toBe(true);
  });

  it("reaches back four years with the standard wording", () => {
    expect(coversGift(declaration({ madeOn: "2026-01-01" }), "2022-01-01")).toBe(true);
    expect(coversGift(declaration({ madeOn: "2026-01-01" }), "2021-12-31")).toBe(false);
  });

  it("reaches back not at all without it", () => {
    const forwardOnly = declaration({ coversPast: false, madeOn: "2026-01-01" });
    expect(coversGift(forwardOnly, "2025-12-31")).toBe(false);
    expect(coversGift(forwardOnly, "2026-01-01")).toBe(true);
  });

  it("stops covering gifts given after a withdrawal", () => {
    const withdrawn = declaration({ withdrawnOn: "2026-05-01" });
    expect(coversGift(withdrawn, "2026-06-01")).toBe(false);
  });

  it("still covers gifts given BEFORE the withdrawal — the rule most easily got wrong", () => {
    // A withdrawal is a statement about the future, not a claim that the donor
    // never paid tax. Treating it as retroactive means repaying claims that
    // were correct when made.
    const withdrawn = declaration({ madeOn: "2024-01-01", withdrawnOn: "2026-05-01" });
    expect(coversGift(withdrawn, "2026-04-30")).toBe(true);
    expect(coversGift(withdrawn, "2026-05-01")).toBe(true);
    expect(coversGift(withdrawn, "2026-05-02")).toBe(false);
  });

  it("copes with a declaration made on 29 February", () => {
    // Four years before 2024-02-29 is 2020-02-29, which exists; before
    // 2028-02-29 is 2024-02-29, which also does. The clamp matters when it
    // doesn't — tested via a non-leap target below.
    expect(coversGift(declaration({ madeOn: "2024-02-29" }), "2020-02-29")).toBe(true);
    expect(coversGift(declaration({ madeOn: "2025-02-28" }), "2021-02-28")).toBe(true);
  });
});

describe("declarationFor", () => {
  it("finds the one that covers the day", () => {
    expect(declarationFor([declaration()], "p1", "2026-06-01")?.id).toBe("d1");
  });

  it("ignores another person's", () => {
    expect(declarationFor([declaration({ personId: "p2" })], "p1", "2026-06-01")).toBeNull();
  });

  it("cites the most recently made of several that cover it", () => {
    // A church that re-papers its declarations has people with three on file.
    const old = declaration({ id: "old", madeOn: "2020-01-01" });
    const fresh = declaration({ id: "fresh", madeOn: "2025-01-01" });
    expect(declarationFor([old, fresh], "p1", "2026-06-01")?.id).toBe("fresh");
  });

  it("falls back to an older one when the newest doesn't cover the day", () => {
    const old = declaration({ id: "old", madeOn: "2020-01-01" });
    const forwardOnly = declaration({ id: "new", madeOn: "2026-07-01", coversPast: false });
    expect(declarationFor([old, forwardOnly], "p1", "2026-06-01")?.id).toBe("old");
  });

  it("has nothing to say with none on file", () => {
    expect(declarationFor([], "p1", "2026-06-01")).toBeNull();
  });
});

describe("claimValue", () => {
  it("adds 25% to a donation", () => {
    expect(claimValue(10000)).toBe(2500);
    expect(claimValue(2000)).toBe(500);
  });

  it("rounds down, never up", () => {
    // 25% of 3p is 0.75p. Rounding up claims money that is not owed.
    expect(claimValue(3)).toBe(0);
    expect(claimValue(7)).toBe(1);
    expect(claimValue(10)).toBe(2);
  });

  it("is computed on a total, so pennies do not leak", () => {
    // Per-gift rounding on a hundred £0.07 gifts loses 75p against HMRC's own
    // arithmetic on the total.
    const perGift = Array.from({ length: 100 }, () => claimValue(7)).reduce((a, b) => a + b, 0);
    expect(claimValue(700)).toBe(175);
    expect(perGift).toBe(100);
    expect(claimValue(700)).toBeGreaterThan(perGift);
  });

  it("is nothing on nothing", () => {
    expect(claimValue(0)).toBe(0);
  });
});

describe("isTooOld / claimDeadline", () => {
  it("writes off a gift past the deadline", () => {
    expect(isTooOld("2022-01-01", TODAY)).toBe(true);
  });

  it("keeps one just inside it", () => {
    expect(isTooOld("2022-10-11", TODAY)).toBe(false);
    expect(isTooOld("2022-10-10", TODAY)).toBe(true);
  });

  it("gives a deadline four years on", () => {
    expect(claimDeadline("2026-06-01")).toBe("2030-06-01");
    expect(BACK_CLAIM_YEARS).toBe(4);
  });
});

describe("assess", () => {
  it("passes a gift with a declaration, an eligible fund and no claim", () => {
    const [row] = assess({ ...base, gifts: [gift()] });
    expect(row.claimable).toBe(true);
    expect(row.declaration?.id).toBe("d1");
  });

  it("blocks a gift nobody is named on, however eligible the fund", () => {
    // HMRC claims against a person. Reported rather than dropped, because
    // somebody usually knows who put the envelope in.
    const [row] = assess({ ...base, gifts: [gift({ giverId: null })] });
    expect(row).toMatchObject({ claimable: false, reason: "no-giver" });
  });

  it("blocks a gift from somebody with no declaration", () => {
    const [row] = assess({ ...base, gifts: [gift({ giverId: "stranger" })] });
    expect(row.reason).toBe("no-declaration");
  });

  it("blocks a gift to an ineligible fund", () => {
    const [row] = assess({ ...base, gifts: [gift({ fundId: "leaving-present" })] });
    expect(row.reason).toBe("fund-not-eligible");
  });

  it("blocks one already on a claim — the double-claim guard", () => {
    const [row] = assess({ ...base, gifts: [gift({ giftAidClaimId: "c1" })] });
    expect(row.reason).toBe("already-claimed");
  });

  it("blocks a refund", () => {
    const [row] = assess({ ...base, gifts: [gift({ status: "REFUNDED" })] });
    expect(row.reason).toBe("refunded");
  });

  it("blocks one past the deadline", () => {
    const [row] = assess({ ...base, gifts: [gift({ givenAt: "2020-01-01" })] });
    expect(row.reason).toBe("too-old");
  });

  it("blocks a gift given after the donor withdrew", () => {
    const withdrawn = [declaration({ withdrawnOn: "2026-05-01" })];
    const [row] = assess({ ...base, declarations: withdrawn, gifts: [gift({ givenAt: "2026-06-01" })] });
    expect(row.reason).toBe("no-declaration");
  });

  it("still passes one given before they withdrew", () => {
    const withdrawn = [declaration({ madeOn: "2024-01-01", withdrawnOn: "2026-05-01" })];
    const [row] = assess({ ...base, declarations: withdrawn, gifts: [gift({ givenAt: "2026-04-01" })] });
    expect(row.claimable).toBe(true);
  });

  it("reports a refund before anything else about it", () => {
    // A refunded gift with no giver and a dead fund is still just refunded —
    // the others are not worth chasing.
    const [row] = assess({
      ...base,
      gifts: [gift({ status: "REFUNDED", giverId: null, fundId: "nope" })],
    });
    expect(row.reason).toBe("refunded");
  });

  it("prefers the more useful reason when a gift has two", () => {
    // "Nobody is named" is actionable; "no declaration" for an unnamed gift is
    // not even a question anybody can answer.
    const [row] = assess({ ...base, gifts: [gift({ giverId: null })] });
    expect(row.reason).toBe("no-giver");
  });

  it("keeps every gift, blocked or not", () => {
    const rows = assess({ ...base, gifts: [gift(), gift({ id: "g2", giverId: null })] });
    expect(rows).toHaveLength(2);
  });
});

describe("summariseClaim", () => {
  it("totals only the claimable ones", () => {
    const rows = assess({
      ...base,
      gifts: [gift({ amount: 10000 }), gift({ id: "g2", amount: 5000, giverId: null })],
    });
    expect(summariseClaim(rows)).toEqual({ giftCount: 1, donationTotal: 10000, claimTotal: 2500 });
  });

  it("is zero on nothing claimable", () => {
    const rows = assess({ ...base, gifts: [gift({ giverId: null })] });
    expect(summariseClaim(rows)).toEqual({ giftCount: 0, donationTotal: 0, claimTotal: 0 });
  });
});

describe("blockedSummary", () => {
  it("orders by what it is worth, not by how many", () => {
    // Forty £2 collections above one £5,000 gift sends somebody after the
    // wrong thing.
    const gifts = [
      ...Array.from({ length: 40 }, (_, i) => gift({ id: `small${i}`, amount: 200, fundId: "nope" })),
      gift({ id: "big", amount: 500000, giverId: "stranger" }),
    ];
    const summary = blockedSummary(assess({ ...base, gifts }));
    expect(summary[0].reason).toBe("no-declaration");
    expect(summary[0].worth).toBe(125000);
  });

  it("says which reasons anybody can do something about", () => {
    const summary = blockedSummary(
      assess({ ...base, gifts: [gift({ giverId: null }), gift({ id: "g2", fundId: "nope" })] }),
    );
    expect(summary.find((row) => row.reason === "no-giver")?.fixable).toBe(true);
    expect(summary.find((row) => row.reason === "fund-not-eligible")?.fixable).toBe(false);
  });

  it("is empty when everything can be claimed", () => {
    expect(blockedSummary(assess({ ...base, gifts: [gift()] }))).toEqual([]);
  });
});

describe("expiringSoon", () => {
  it("names claimable money running out of time, soonest first", () => {
    const gifts = [
      gift({ id: "later", givenAt: "2024-01-01" }),
      gift({ id: "soon", givenAt: "2022-12-01" }),
    ];
    const rows = expiringSoon(assess({ ...base, gifts }), TODAY, 365);
    expect(rows.map((row) => row.giftId)).toEqual(["soon"]);
    expect(rows[0].deadline).toBe("2026-12-01");
  });

  it("leaves out what has years to run", () => {
    expect(expiringSoon(assess({ ...base, gifts: [gift({ givenAt: "2026-06-01" })] }), TODAY)).toEqual([]);
  });

  it("leaves out what cannot be claimed at all", () => {
    // A gift with no declaration is not expiring, it is blocked.
    const rows = expiringSoon(
      assess({ ...base, gifts: [gift({ givenAt: "2022-12-01", giverId: "stranger" })] }),
      TODAY,
      365,
    );
    expect(rows).toEqual([]);
  });
});

describe("claimSchedule", () => {
  it("aggregates one line per donor, as HMRC's spreadsheet wants", () => {
    const rows = assess({
      ...base,
      gifts: [
        gift({ id: "a", amount: 10000, givenAt: "2026-03-01" }),
        gift({ id: "b", amount: 2550, givenAt: "2026-06-01" }),
      ],
    });
    const schedule = claimSchedule(rows);
    expect(schedule).toHaveLength(1);
    expect(schedule[0]).toMatchObject({
      firstName: "Ruth",
      lastName: "Bell",
      houseNumber: "14",
      postcode: "AB1 2CD",
      amount: "125.50",
      // The last gift in the span, which is the date HMRC takes.
      donationDate: "2026-06-01",
    });
  });

  it("formats money from pence at the last moment, keeping the pence exact", () => {
    const rows = assess({ ...base, gifts: [gift({ amount: 1 }), gift({ id: "g2", amount: 2 })] });
    expect(claimSchedule(rows)[0].amount).toBe("0.03");
  });

  it("gives each donor their own line, surname order", () => {
    const declarations = [
      declaration({ id: "d1", personId: "p1", lastName: "Young", firstName: "Ann" }),
      declaration({ id: "d2", personId: "p2", lastName: "Adams", firstName: "Bob" }),
    ];
    const rows = assess({
      ...base,
      declarations,
      gifts: [gift({ giverId: "p1" }), gift({ id: "g2", giverId: "p2" })],
    });
    expect(claimSchedule(rows).map((row) => row.lastName)).toEqual(["Adams", "Young"]);
  });

  it("leaves blocked gifts out of the schedule entirely", () => {
    const rows = assess({ ...base, gifts: [gift({ giverId: null })] });
    expect(claimSchedule(rows)).toEqual([]);
  });

  it("refuses a blocked row even when it arrives with a declaration attached", () => {
    // `assess` never produces this — it nulls the declaration on anything
    // blocked — so a mutation dropping the `claimable` guard survived every
    // test that went through `assess`. But `claimSchedule` is exported on its
    // own, and "claimable rows only" is its contract, not a side effect of how
    // its usual caller happens to build the array.
    const handBuilt = [
      {
        gift: gift({ giftAidClaimId: "already-sent" }),
        claimable: false as const,
        reason: "already-claimed" as const,
        declaration: declaration(),
      },
    ];
    expect(claimSchedule(handBuilt)).toEqual([]);
  });
});

describe("declarationIsComplete", () => {
  const good = { firstName: "Ruth", lastName: "Bell", houseNumber: "14", postcode: "AB1 2CD" };

  it("accepts one with everything HMRC needs", () => {
    expect(declarationIsComplete(good).ok).toBe(true);
  });

  it("names everything missing at once, not the first", () => {
    const result = declarationIsComplete({ firstName: "", lastName: "", houseNumber: "", postcode: "" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.missing).toHaveLength(4);
  });

  it("treats whitespace as missing", () => {
    expect(declarationIsComplete({ ...good, postcode: "   " }).ok).toBe(false);
  });

  it("accepts a postcode that isn't a standard UK one", () => {
    // BFPO, Gibraltar and overseas donors are real. A strict pattern refuses
    // genuine declarations, and HMRC will object far more cheaply than this
    // app guessing.
    expect(declarationIsComplete({ ...good, postcode: "BFPO 1234" }).ok).toBe(true);
  });
});

describe("needsWrittenConfirmation", () => {
  it("finds the verbal ones still owed a letter", () => {
    const rows = [
      declaration({ id: "v", how: "VERBAL" }),
      declaration({ id: "p", how: "PAPER" }),
    ];
    expect(needsWrittenConfirmation(rows).map((row) => row.id)).toEqual(["v"]);
  });

  it("leaves out one that has since been withdrawn", () => {
    const rows = [declaration({ how: "VERBAL", withdrawnOn: "2026-05-01" })];
    expect(needsWrittenConfirmation(rows)).toEqual([]);
  });
});
