import { describe, it, expect } from "vitest";
import {
  balanceOf,
  balances,
  checkFund,
  checkTransfer,
  inSpan,
  mayApproveAgainst,
  overdrawnNote,
  publicBalance,
  type FundBalance,
  type FundExpense,
  type FundGift,
  type FundRow,
  type Transfer,
} from "@/lib/funds";

const money = (minor: number) =>
  new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 }).format(
    minor / 100,
  );

const fund = (over: Partial<FundRow> = {}): FundRow => ({
  id: "building",
  name: "Building fund",
  restricted: true,
  description: "The roof",
  active: true,
  ...over,
});

const gift = (over: Partial<FundGift> = {}): FundGift => ({
  fundId: "building",
  amount: 100_00,
  givenAt: "2026-06-01",
  ...over,
});

const cost = (over: Partial<FundExpense> = {}): FundExpense => ({
  fundId: "building",
  amount: 50_00,
  status: "PAID",
  incurredOn: "2026-06-02",
  ...over,
});

const move = (over: Partial<Transfer> = {}): Transfer => ({
  fromFundId: "general",
  toFundId: "building",
  amount: 20_00,
  movedOn: "2026-06-03",
  ...over,
});

const of = (input: {
  fund?: FundRow;
  gifts?: FundGift[];
  expenses?: FundExpense[];
  transfers?: Transfer[];
}) =>
  balanceOf({
    fund: input.fund ?? fund(),
    gifts: input.gifts ?? [],
    expenses: input.expenses ?? [],
    transfers: input.transfers ?? [],
  });

describe("what is in a fund", () => {
  it("adds up settled gifts to that fund only", () => {
    const balance = of({ gifts: [gift(), gift({ amount: 25_00 }), gift({ fundId: "general", amount: 999_00 })] });
    expect(balance.given).toBe(125_00);
  });

  it("subtracts what has been paid out of it", () => {
    expect(of({ gifts: [gift()], expenses: [cost()] }).balance).toBe(50_00);
  });

  it("ignores an expense filed against another fund", () => {
    const balance = of({ gifts: [gift()], expenses: [cost({ fundId: "general", amount: 90_00 })] });
    expect(balance.balance).toBe(100_00);
  });

  it("ignores an expense filed against no fund at all", () => {
    // Those belong to a category budget; counting them here would charge the
    // building fund for the electricity bill.
    const balance = of({ gifts: [gift()], expenses: [cost({ fundId: null, amount: 90_00 })] });
    expect(balance.balance).toBe(100_00);
  });

  it("counts money moved in and money moved out", () => {
    const balance = of({
      gifts: [gift()],
      transfers: [move(), move({ fromFundId: "building", toFundId: "general", amount: 5_00 })],
    });
    expect(balance.movedIn).toBe(20_00);
    expect(balance.movedOut).toBe(5_00);
    expect(balance.balance).toBe(115_00);
  });

  it("does not let a fund inflate itself with a transfer to itself", () => {
    // Refused when written, but one already in the data must not count twice.
    const balance = of({ transfers: [move({ fromFundId: "building", toFundId: "building", amount: 40_00 })] });
    expect(balance.movedIn).toBe(40_00);
    expect(balance.movedOut).toBe(40_00);
    expect(balance.balance).toBe(0);
  });

  it("keeps a rejected claim out of every figure", () => {
    const balance = of({ gifts: [gift()], expenses: [cost({ status: "REJECTED", amount: 80_00 })] });
    expect(balance.balance).toBe(100_00);
    expect(balance.available).toBe(100_00);
    expect(balance.awaiting).toBe(0);
    expect(balance.committed).toBe(0);
  });
});

describe("balance and available are not the same number", () => {
  it("leaves an approved-not-paid bill in the balance but out of available", () => {
    // The money is still in the account and already promised away.
    const balance = of({ gifts: [gift()], expenses: [cost({ status: "APPROVED", amount: 30_00 })] });
    expect(balance.balance).toBe(100_00);
    expect(balance.committed).toBe(30_00);
    expect(balance.available).toBe(70_00);
  });

  it("reports what is awaiting approval and subtracts it from neither", () => {
    // Nobody has agreed to it, so blocking the fund on it would hold the fund
    // hostage to a claim that may well be turned down.
    const balance = of({ gifts: [gift()], expenses: [cost({ status: "SUBMITTED", amount: 90_00 })] });
    expect(balance.awaiting).toBe(90_00);
    expect(balance.balance).toBe(100_00);
    expect(balance.available).toBe(100_00);
  });

  it("calls a fund overdrawn on available, not on balance", () => {
    const balance = of({ gifts: [gift()], expenses: [cost({ status: "APPROVED", amount: 150_00 })] });
    expect(balance.balance).toBe(100_00);
    expect(balance.available).toBe(-50_00);
    expect(balance.overdrawn).toBe(true);
  });

  it("is not overdrawn when it comes out exactly level", () => {
    const balance = of({ gifts: [gift()], expenses: [cost({ status: "APPROVED", amount: 100_00 })] });
    expect(balance.available).toBe(0);
    expect(balance.overdrawn).toBe(false);
  });
});

describe("approving against a restricted fund", () => {
  const full = (over: Partial<FundBalance> = {}): FundBalance => ({
    ...of({ gifts: [gift()] }),
    ...over,
  });

  it("allows what the fund can cover", () => {
    expect(mayApproveAgainst(full(), 100_00, money).ok).toBe(true);
  });

  it("refuses a penny more than it can cover", () => {
    expect(mayApproveAgainst(full(), 100_01, money).ok).toBe(false);
  });

  it("says how short it is, not just no", () => {
    const verdict = mayApproveAgainst(full(), 150_00, money);
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    // Anchored, and negatives ruled out: "-£50 short" contains "£50 short",
    // so the loose assertion this replaces passed on the subtraction the
    // wrong way round. A mutation test found it.
    expect(verdict.reason).toMatch(/which is £50 short/);
    expect(verdict.reason).toMatch(/has £100 left/);
    expect(verdict.reason).not.toContain("-£");
  });

  it("offers the two ways out rather than leaving somebody stuck", () => {
    const verdict = mayApproveAgainst(full(), 150_00, money);
    if (verdict.ok) throw new Error("expected a refusal");
    expect(verdict.reason).toMatch(/move the cost to another fund/i);
    expect(verdict.reason).toMatch(/top this one up/i);
  });

  it("counts a second bill against what the first already took", () => {
    // Two bills approved against the same remaining money is the overspend
    // this exists to prevent, and nobody notices it at the time.
    const balance = of({ gifts: [gift()], expenses: [cost({ status: "APPROVED", amount: 60_00 })] });
    expect(mayApproveAgainst(balance, 60_00, money).ok).toBe(false);
    expect(mayApproveAgainst(balance, 40_00, money).ok).toBe(true);
  });

  it("never refuses against an unrestricted fund, even overdrawn", () => {
    // The general fund going negative is bad news, not a rule breach, and a
    // church that cannot record bad news cannot act on it.
    const balance = of({ fund: fund({ restricted: false }), expenses: [cost({ status: "APPROVED" })] });
    expect(balance.overdrawn).toBe(true);
    expect(mayApproveAgainst(balance, 5_000_00, money).ok).toBe(true);
  });

  it("never refuses when no fund was named", () => {
    expect(mayApproveAgainst(null, 5_000_00, money).ok).toBe(true);
  });

  it("does not quote a negative figure as what is left", () => {
    const balance = of({ expenses: [cost({ status: "APPROVED", amount: 40_00 })] });
    const verdict = mayApproveAgainst(balance, 10_00, money);
    if (verdict.ok) throw new Error("expected a refusal");
    expect(verdict.reason).toContain("£0 left");
    expect(verdict.reason).not.toContain("-£40 left");
  });
});

describe("a restricted fund has to say what for", () => {
  it("refuses the flag without a stated purpose", () => {
    expect(checkFund({ restricted: true, description: null }).ok).toBe(false);
    expect(checkFund({ restricted: true, description: "   " }).ok).toBe(false);
  });

  it("explains that the restriction would be unenforceable", () => {
    const verdict = checkFund({ restricted: true, description: "" });
    if (verdict.ok) throw new Error("expected a refusal");
    expect(verdict.reason).toMatch(/can't be enforced/i);
  });

  it("asks nothing of an unrestricted fund", () => {
    expect(checkFund({ restricted: false, description: null }).ok).toBe(true);
  });

  it("accepts a restricted fund that says what for", () => {
    expect(checkFund({ restricted: true, description: "The roof" }).ok).toBe(true);
  });
});

describe("moving money between funds", () => {
  const from = of({ gifts: [gift()] });
  const good = { from, toFundId: "general", amount: 50_00, authority: "Trustees, 4 March", money };

  it("allows a move the fund can cover, with an authority", () => {
    expect(checkTransfer(good).ok).toBe(true);
  });

  it("requires an authority, and says why", () => {
    const verdict = checkTransfer({ ...good, authority: "   " });
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.reason).toMatch(/trustee minute/i);
  });

  it("refuses more than a restricted fund has, counting agreed bills", () => {
    const tight = of({ gifts: [gift()], expenses: [cost({ status: "APPROVED", amount: 70_00 })] });
    const verdict = checkTransfer({ ...good, from: tight, amount: 50_00 });
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.reason).toMatch(/only has £30 left/);
    expect(verdict.reason).not.toContain("-£");
  });

  it("allows exactly what the fund has, leaving it at nothing", () => {
    // Releasing a whole restricted balance is an ordinary thing for trustees
    // to decide, and an off-by-one here would refuse it.
    const verdict = checkTransfer({ ...good, amount: 100_00 });
    expect(verdict.ok).toBe(true);
    expect(checkTransfer({ ...good, amount: 100_01 }).ok).toBe(false);
  });

  it("allows an unrestricted fund to be taken negative", () => {
    // With one bank account a transfer only reallocates claims on the same
    // pot, and refusing it would stop a church recording a decision its
    // trustees actually took. Only the restriction is a rule.
    const overdrawn = of({
      fund: fund({ restricted: false, name: "General fund" }),
      expenses: [cost({ status: "APPROVED", amount: 90_00 })],
    });
    expect(overdrawn.overdrawn).toBe(true);
    expect(checkTransfer({ ...good, from: overdrawn, amount: 500_00 }).ok).toBe(true);
  });

  it("still refuses a restricted fund that is already overdrawn", () => {
    const overdrawn = of({ expenses: [cost({ status: "APPROVED", amount: 90_00 })] });
    const verdict = checkTransfer({ ...good, from: overdrawn, amount: 10_00 });
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.reason).toMatch(/only has £0 left/);
  });

  it("refuses the same fund at both ends", () => {
    const verdict = checkTransfer({ ...good, toFundId: "building" });
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.reason).toMatch(/same fund/i);
  });

  it("refuses an amount that is not whole pence, or is nothing", () => {
    expect(checkTransfer({ ...good, amount: 0 }).ok).toBe(false);
    expect(checkTransfer({ ...good, amount: -5_00 }).ok).toBe(false);
    expect(checkTransfer({ ...good, amount: 10.5 }).ok).toBe(false);
  });

  it("refuses a fund it cannot find", () => {
    expect(checkTransfer({ ...good, from: null }).ok).toBe(false);
  });

  it("checks the amount before the authority, so a nonsense amount says so", () => {
    const verdict = checkTransfer({ ...good, amount: 0, authority: "" });
    if (verdict.ok) throw new Error("expected a refusal");
    expect(verdict.reason).toMatch(/whole number of pence/i);
  });
});

describe("what to say about a fund in trouble", () => {
  it("says nothing about a healthy fund", () => {
    expect(overdrawnNote(of({ gifts: [gift()] }), money)).toBeNull();
  });

  it("calls a restricted deficit what it is", () => {
    const balance = of({ gifts: [gift()], expenses: [cost({ status: "APPROVED", amount: 150_00 })] });
    const note = overdrawnNote(balance, money)!;
    expect(note).toContain("£50");
    expect(note).toMatch(/restricted/i);
    expect(note).toMatch(/given for one purpose has been committed to another/i);
  });

  it("uses the milder sentence for the general fund", () => {
    const balance = of({
      fund: fund({ restricted: false, name: "General fund" }),
      expenses: [cost({ status: "APPROVED", amount: 40_00 })],
    });
    const note = overdrawnNote(balance, money)!;
    expect(note).toContain("£40");
    expect(note).not.toMatch(/breach|given for one purpose/i);
  });
});

describe("ordering the funds", () => {
  const all = (funds: FundRow[], expenses: FundExpense[] = []) =>
    balances({ funds, gifts: [gift(), gift({ fundId: "general" }), gift({ fundId: "mission" })], expenses, transfers: [] });

  it("puts restricted funds first, because they are the ones with a rule", () => {
    const got = all([
      fund({ id: "general", name: "General", restricted: false }),
      fund({ id: "mission", name: "Mission", restricted: true }),
    ]);
    expect(got.map((b) => b.fundId)).toEqual(["mission", "general"]);
  });

  it("puts the tightest fund first within each group", () => {
    const got = all(
      [
        fund({ id: "building", name: "Building", restricted: true }),
        fund({ id: "mission", name: "Mission", restricted: true }),
      ],
      [cost({ fundId: "mission", status: "APPROVED", amount: 90_00 })],
    );
    expect(got.map((b) => b.fundId)).toEqual(["mission", "building"]);
  });

  it("falls back to the name so the order is stable", () => {
    const got = all([
      fund({ id: "b", name: "Zebra", restricted: false }),
      fund({ id: "a", name: "Aardvark", restricted: false }),
    ]);
    expect(got.map((b) => b.name)).toEqual(["Aardvark", "Zebra"]);
  });
});

describe("spans", () => {
  it("keeps both ends of the span", () => {
    const rows = [gift({ givenAt: "2026-01-01" }), gift({ givenAt: "2026-12-31" }), gift({ givenAt: "2027-01-01" })];
    const got = inSpan(rows, (row) => row.givenAt, "2026-01-01", "2026-12-31");
    expect(got.map((row) => row.givenAt)).toEqual(["2026-01-01", "2026-12-31"]);
  });
});

describe("what may be shown to anybody", () => {
  it("gives the appeal total and nothing about commitments", () => {
    const balance = of({ gifts: [gift()], expenses: [cost({ status: "APPROVED", amount: 30_00 })] });
    const shown = publicBalance(balance);
    expect(shown).toEqual({ name: "Building fund", restricted: true, balance: 100_00 });
    expect(Object.keys(shown)).not.toContain("committed");
    expect(Object.keys(shown)).not.toContain("available");
  });
});
