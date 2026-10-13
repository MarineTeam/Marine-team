import { describe, it, expect } from "vitest";
import {
  assetsAndLiabilities,
  debtorsAt,
  heldAt,
  toCsv,
  type Column,
  type HoldingRow,
  type StatementLine,
  type TaxClaimRow,
} from "@/lib/holdings";

const column = (restricted: number, unrestricted: number): Column => ({
  restricted,
  unrestricted,
  total: restricted + unrestricted,
});

const RESTRICTED = new Set(["building"]);
const restricted = (fundId: string | null) => fundId !== null && RESTRICTED.has(fundId);

let next = 0;
const holding = (over: Partial<HoldingRow> = {}): HoldingRow => ({
  id: `h${next++}`,
  name: "The hall",
  kind: "ASSET",
  amount: 500_000_00,
  asAt: "2026-12-31",
  fundId: null,
  ...over,
});

const claim = (over: Partial<TaxClaimRow> = {}): TaxClaimRow => ({
  claimTotal: 250_00,
  submittedOn: "2026-11-01",
  settledOn: null,
  ...over,
});

const run = (over: {
  asAt?: string;
  cash?: Column;
  creditors?: Column;
  claims?: TaxClaimRow[];
  holdings?: HoldingRow[];
} = {}) =>
  assetsAndLiabilities({
    asAt: over.asAt ?? "2026-12-31",
    cash: over.cash ?? column(2_000_00, 8_000_00),
    creditors: over.creditors ?? column(0, 0),
    claims: over.claims ?? [],
    holdings: over.holdings ?? [],
    restrictedFunds: RESTRICTED,
  });

const line = (lines: readonly StatementLine[], name: string) => lines.find((row) => row.name === name);

describe("what HMRC owed at a year end", () => {
  it("counts a claim submitted and not settled", () => {
    expect(debtorsAt([claim()], "2026-12-31")).toBe(250_00);
  });

  it("counts nothing for a claim nobody has sent", () => {
    // HMRC owes nothing until it has been asked.
    expect(debtorsAt([claim({ submittedOn: null })], "2026-12-31")).toBe(0);
  });

  it("counts nothing once it has been paid", () => {
    expect(debtorsAt([claim({ settledOn: "2026-12-01" })], "2026-12-31")).toBe(0);
  });

  it("still counts it when it was paid after the year end", () => {
    // Submitted in November and paid the following March is a debtor at 31
    // December, whatever the row looks like when the report is run.
    expect(debtorsAt([claim({ settledOn: "2027-03-01" })], "2026-12-31")).toBe(250_00);
  });

  it("counts nothing for a claim submitted after the year end", () => {
    expect(debtorsAt([claim({ submittedOn: "2027-01-05" })], "2026-12-31")).toBe(0);
  });

  it("counts one submitted on the year end itself", () => {
    expect(debtorsAt([claim({ submittedOn: "2026-12-31" })], "2026-12-31")).toBe(250_00);
  });

  it("counts nothing for one settled on the year end itself", () => {
    expect(debtorsAt([claim({ settledOn: "2026-12-31" })], "2026-12-31")).toBe(0);
  });

  it("adds several together", () => {
    expect(debtorsAt([claim(), claim({ claimTotal: 100_00 })], "2026-12-31")).toBe(350_00);
  });
});

describe("hand-entered items at a year end", () => {
  it("uses the figure entered for that year end", () => {
    const got = heldAt([holding({ amount: 500_000_00 })], "2026-12-31", restricted);
    expect(got.assets[0].amounts.total).toBe(500_000_00);
    expect(got.assets[0].carriedFrom).toBeNull();
  });

  it("carries the most recent figure forward, and says from when", () => {
    // A valuation that is silently four years old is how a balance sheet goes
    // quietly wrong.
    const got = heldAt([holding({ asAt: "2022-12-31" })], "2026-12-31", restricted);
    expect(got.assets[0].amounts.total).toBe(500_000_00);
    expect(got.assets[0].carriedFrom).toBe("2022-12-31");
  });

  it("prefers this year's figure over an older one, whichever order they arrive in", () => {
    // Not a hypothetical: nothing orders these rows, and a mutation test
    // found the version of this that only tried oldest-first — where simply
    // taking the last one seen gives the right answer by luck.
    for (const rows of [
      [holding({ asAt: "2022-12-31", amount: 400_000_00 }), holding({ amount: 500_000_00 })],
      [holding({ amount: 500_000_00 }), holding({ asAt: "2022-12-31", amount: 400_000_00 })],
    ]) {
      const got = heldAt(rows, "2026-12-31", restricted);
      expect(got.assets).toHaveLength(1);
      expect(got.assets[0].amounts.total).toBe(500_000_00);
      expect(got.assets[0].carriedFrom).toBeNull();
    }
  });

  it("ignores a figure dated after the year end", () => {
    // Next year's valuation is not evidence about this year.
    const got = heldAt(
      [holding({ asAt: "2022-12-31", amount: 400_000_00 }), holding({ asAt: "2027-12-31", amount: 999_000_00 })],
      "2026-12-31",
      restricted,
    );
    expect(got.assets[0].amounts.total).toBe(400_000_00);
    expect(got.assets[0].carriedFrom).toBe("2022-12-31");
  });

  it("leaves out an item that did not exist yet", () => {
    const got = heldAt([holding({ asAt: "2027-12-31" })], "2026-12-31", restricted);
    expect(got.assets).toEqual([]);
  });

  it("separates liabilities from assets", () => {
    const got = heldAt(
      [holding(), holding({ name: "Mortgage", kind: "LIABILITY", amount: 120_000_00 })],
      "2026-12-31",
      restricted,
    );
    expect(got.assets.map((row) => row.name)).toEqual(["The hall"]);
    expect(got.liabilities.map((row) => row.name)).toEqual(["Mortgage"]);
  });

  it("puts an item attached to a restricted fund in the restricted column", () => {
    const got = heldAt([holding({ fundId: "building" })], "2026-12-31", restricted);
    expect(got.assets[0].amounts).toEqual({
      restricted: 500_000_00,
      unrestricted: 0,
      total: 500_000_00,
    });
  });

  it("treats an item attached to no fund as unrestricted", () => {
    // The hall belongs to the church, not to the appeal that built it.
    const got = heldAt([holding({ fundId: null })], "2026-12-31", restricted);
    expect(got.assets[0].amounts.unrestricted).toBe(500_000_00);
  });

  it("lists the biggest first", () => {
    const got = heldAt(
      [holding({ name: "Chairs", amount: 2_000_00 }), holding({ name: "The hall" })],
      "2026-12-31",
      restricted,
    );
    expect(got.assets.map((row) => row.name)).toEqual(["The hall", "Chairs"]);
  });
});

describe("the statement", () => {
  it("takes cash from the receipts and payments account rather than recomputing it", () => {
    // The one figure the two statements share must not be worked out twice.
    const statement = run({ cash: column(2_000_00, 8_000_00) });
    expect(line(statement.assets, "Cash at bank and in hand")!.amounts).toEqual({
      restricted: 2_000_00,
      unrestricted: 8_000_00,
      total: 10_000_00,
    });
  });

  it("lists cash first, because it is the figure anybody checks", () => {
    const statement = run({ holdings: [holding()] });
    expect(statement.assets[0].name).toBe("Cash at bank and in hand");
  });

  it("includes what HMRC owes as an asset", () => {
    const statement = run({ claims: [claim()] });
    expect(line(statement.assets, "Gift Aid claimed and not yet received")!.amounts.total).toBe(250_00);
  });

  it("leaves the Gift Aid line out when nothing is owed", () => {
    expect(line(run().assets, "Gift Aid claimed and not yet received")).toBeUndefined();
  });

  it("includes what the church owes as a liability", () => {
    const statement = run({ creditors: column(400_00, 300_00) });
    expect(line(statement.liabilities, "Agreed and not yet paid")!.amounts.total).toBe(700_00);
  });

  it("leaves the creditors line out when nothing is owed", () => {
    expect(line(run().liabilities, "Agreed and not yet paid")).toBeUndefined();
  });

  it("totals assets and liabilities separately, by column", () => {
    const statement = run({
      cash: column(2_000_00, 8_000_00),
      creditors: column(400_00, 300_00),
      holdings: [holding(), holding({ name: "Mortgage", kind: "LIABILITY", amount: 120_000_00 })],
    });
    expect(statement.totalAssets).toEqual({
      restricted: 2_000_00,
      unrestricted: 508_000_00,
      total: 510_000_00,
    });
    expect(statement.totalLiabilities.total).toBe(120_700_00);
  });

  it("gives net assets as what is held less what is owed", () => {
    const statement = run({
      cash: column(2_000_00, 8_000_00),
      creditors: column(400_00, 300_00),
    });
    expect(statement.netAssets).toEqual({
      restricted: 1_600_00,
      unrestricted: 7_700_00,
      total: 9_300_00,
    });
  });

  it("can report negative net assets, which is a fact", () => {
    const statement = run({
      cash: column(0, 1_000_00),
      holdings: [holding({ name: "Mortgage", kind: "LIABILITY", amount: 50_000_00 })],
    });
    expect(statement.netAssets.total).toBe(-49_000_00);
  });

  it("names every line that is carried forward", () => {
    const statement = run({
      holdings: [
        holding({ asAt: "2022-12-31" }),
        holding({ name: "Mortgage", kind: "LIABILITY", amount: 120_000_00, asAt: "2021-12-31" }),
        holding({ name: "Chairs", amount: 2_000_00 }),
      ],
    });
    expect(statement.stale.map((row) => row.name).sort()).toEqual(["Mortgage", "The hall"]);
  });

  it("reports nothing stale when every figure is this year's", () => {
    expect(run({ holdings: [holding()] }).stale).toEqual([]);
  });

  it("never calls cash or the derived lines stale", () => {
    // They come from this year's transactions by construction.
    const statement = run({ claims: [claim()], creditors: column(0, 700_00) });
    expect(statement.stale).toEqual([]);
  });
});

describe("as a spreadsheet", () => {
  const statement = () =>
    run({
      cash: column(2_000_00, 8_000_00),
      creditors: column(0, 700_00),
      holdings: [holding({ name: "The hall, and its land", asAt: "2022-12-31" })],
    });

  it("writes money as decimals, not pence", () => {
    expect(toCsv(statement())).toContain("8000.00");
  });

  it("quotes a name containing a comma", () => {
    expect(toCsv(statement())).toContain('"The hall, and its land"');
  });

  it("says in the file where a carried-forward figure came from", () => {
    // The spreadsheet is what gets emailed to the examiner.
    expect(toCsv(statement())).toContain("carried forward from 2022-12-31");
  });

  it("leaves the note empty for a figure entered this year", () => {
    const csv = toCsv(run({ cash: column(0, 10_000_00) }));
    expect(csv).toContain("Cash at bank and in hand,0.00,10000.00,10000.00,");
    expect(csv).not.toContain("carried forward");
  });

  it("gives the columns in a fixed order, with the note last", () => {
    expect(toCsv(statement())).toContain("Line,Restricted,Unrestricted,Total,Note");
  });

  it("ends with net assets", () => {
    expect(toCsv(statement()).trim().split("\n").pop()).toMatch(/^Net assets,/);
  });
});
