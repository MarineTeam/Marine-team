import { describe, it, expect } from "vitest";
import {
  apportion,
  columnsMatch,
  type AccountLine,
  financialYear,
  receiptsAndPayments,
  toCsv,
  type FundInfo,
  type GiftIn,
  type PaymentOut,
  type TaxClaim,
  type TransferIn,
} from "@/lib/accounts";

const FUNDS: FundInfo[] = [
  { id: "building", name: "Building fund", restricted: true },
  { id: "general", name: "General fund", restricted: false },
  { id: "mission", name: "Mission fund", restricted: true },
];

const gift = (over: Partial<GiftIn> = {}): GiftIn => ({
  fundId: "general",
  amount: 100_00,
  givenAt: "2026-06-01",
  ...over,
});

const paid = (over: Partial<PaymentOut> = {}): PaymentOut => ({
  fundId: null,
  categoryName: "Utilities",
  amount: 40_00,
  paidOn: "2026-06-10",
  approvedOn: "2026-06-05",
  status: "PAID",
  ...over,
});

const moved = (over: Partial<TransferIn> = {}): TransferIn => ({
  fromFundId: "general",
  toFundId: "building",
  amount: 50_00,
  movedOn: "2026-06-20",
  ...over,
});

const claim = (over: Partial<TaxClaim> = {}): TaxClaim => ({
  claimTotal: 25_00,
  settledOn: "2026-07-01",
  gifts: [{ fundId: "general", amount: 100_00 }],
  ...over,
});

const run = (input: {
  gifts?: GiftIn[];
  payments?: PaymentOut[];
  transfers?: TransferIn[];
  claims?: TaxClaim[];
  from?: string;
  to?: string;
}) =>
  receiptsAndPayments({
    from: input.from ?? "2026-01-01",
    to: input.to ?? "2026-12-31",
    funds: FUNDS,
    gifts: input.gifts ?? [],
    payments: input.payments ?? [],
    transfers: input.transfers ?? [],
    claims: input.claims ?? [],
  });

const line = (lines: readonly AccountLine[], name: string) => lines.find((row) => row.name === name);

describe("the financial year", () => {
  it("runs a calendar year when it starts on 1 January", () => {
    expect(financialYear(2026)).toEqual({ from: "2026-01-01", to: "2026-12-31", label: "2026" });
  });

  it("ends the day before the next one starts", () => {
    // Inclusive at both ends, like every other span here. Off by one and a
    // gift on the last day of the year falls into neither.
    expect(financialYear(2026, 9, 1)).toMatchObject({ from: "2026-09-01", to: "2027-08-31" });
  });

  it("names a straddling year for both of them", () => {
    // "The 2026 accounts" means different twelve months to two churches a
    // mile apart.
    expect(financialYear(2026, 9, 1).label).toBe("2026–2027");
    expect(financialYear(2026, 4, 6)).toMatchObject({ from: "2026-04-06", to: "2027-04-05" });
  });

  it("pads single-digit months and days", () => {
    expect(financialYear(2026, 4, 6).from).toBe("2026-04-06");
  });

  it("handles a leap year's end correctly", () => {
    expect(financialYear(2027, 3, 1).to).toBe("2028-02-29");
  });
});

describe("cash, not commitment", () => {
  it("counts a payment on the day the money left", () => {
    const accounts = run({ payments: [paid({ paidOn: "2026-06-10" })] });
    expect(accounts.totalPayments.total).toBe(40_00);
  });

  it("leaves out a payment made after the year end, however old the cost", () => {
    // The inverse of the budget report, which counts by the date incurred. An
    // invoice approved in December and paid in January belongs to December's
    // budget and to January's receipts and payments.
    const accounts = run({ payments: [paid({ approvedOn: "2026-12-20", paidOn: "2027-01-15" })] });
    expect(accounts.totalPayments.total).toBe(0);
  });

  it("counts nothing that nobody has paid", () => {
    const accounts = run({ payments: [paid({ status: "APPROVED", paidOn: null })] });
    expect(accounts.totalPayments.total).toBe(0);
  });

  it("counts nothing awaiting approval", () => {
    const accounts = run({ payments: [paid({ status: "SUBMITTED", paidOn: null, approvedOn: null })] });
    expect(accounts.totalPayments.total).toBe(0);
    expect(accounts.owed.total).toBe(0);
  });

  it("counts nothing that was turned down", () => {
    const accounts = run({ payments: [paid({ status: "REJECTED", paidOn: null })] });
    expect(accounts.totalPayments.total).toBe(0);
    expect(accounts.owed.total).toBe(0);
  });
});

describe("owed is not spent", () => {
  it("lists what was agreed and not paid, outside the payment columns", () => {
    const accounts = run({ payments: [paid({ status: "APPROVED", paidOn: null })] });
    expect(accounts.owed.total).toBe(40_00);
    expect(accounts.totalPayments.total).toBe(0);
  });

  it("still calls it owed at the year end when it was paid the February after", () => {
    // A statement of a past year has to say what was true then, not now.
    const accounts = run({ payments: [paid({ approvedOn: "2026-12-20", paidOn: "2027-02-01" })] });
    expect(accounts.owed.total).toBe(40_00);
  });

  it("does not call it owed once it was paid inside the year", () => {
    const accounts = run({ payments: [paid({ approvedOn: "2026-06-05", paidOn: "2026-06-10" })] });
    expect(accounts.owed.total).toBe(0);
    expect(accounts.totalPayments.total).toBe(40_00);
  });

  it("does not call it owed when it was only agreed after the year end", () => {
    const accounts = run({ payments: [paid({ status: "APPROVED", approvedOn: "2027-03-01", paidOn: null })] });
    expect(accounts.owed.total).toBe(0);
  });

  it("keeps a restricted liability in the restricted column", () => {
    const accounts = run({ payments: [paid({ status: "APPROVED", paidOn: null, fundId: "building" })] });
    expect(accounts.owed).toEqual({ restricted: 40_00, unrestricted: 0, total: 40_00 });
  });
});

describe("restricted and unrestricted are separate columns", () => {
  it("puts a gift to a restricted fund in the restricted column", () => {
    const accounts = run({ gifts: [gift({ fundId: "building", amount: 500_00 })] });
    expect(accounts.totalReceipts).toEqual({ restricted: 500_00, unrestricted: 0, total: 500_00 });
  });

  it("puts a gift to an ordinary fund in the unrestricted column", () => {
    const accounts = run({ gifts: [gift({ amount: 500_00 })] });
    expect(accounts.totalReceipts).toEqual({ restricted: 0, unrestricted: 500_00, total: 500_00 });
  });

  it("decides a payment's column by the fund it came out of", () => {
    const accounts = run({ payments: [paid({ fundId: "building", amount: 30_00 })] });
    expect(accounts.totalPayments).toEqual({ restricted: 30_00, unrestricted: 0, total: 30_00 });
  });

  it("treats a payment against no fund as unrestricted", () => {
    // The electricity bill answers to a category budget, not an appeal.
    const accounts = run({ payments: [paid({ fundId: null, amount: 30_00 })] });
    expect(accounts.totalPayments.unrestricted).toBe(30_00);
    expect(accounts.totalPayments.restricted).toBe(0);
  });

  it("lists receipts by fund, biggest first", () => {
    const accounts = run({
      gifts: [gift({ amount: 100_00 }), gift({ fundId: "building", amount: 900_00 }), gift({ fundId: "mission", amount: 500_00 })],
    });
    expect(accounts.receipts.map((row) => row.name)).toEqual(["Building fund", "Mission fund", "General fund"]);
  });

  it("lists payments by category, biggest first", () => {
    const accounts = run({
      payments: [paid({ categoryName: "Utilities", amount: 10_00 }), paid({ categoryName: "Mission giving", amount: 80_00 })],
    });
    expect(accounts.payments.map((row) => row.name)).toEqual(["Mission giving", "Utilities"]);
  });

  it("adds several gifts to one fund into a single line", () => {
    const accounts = run({ gifts: [gift({ amount: 10_00 }), gift({ amount: 25_00 })] });
    expect(accounts.receipts).toHaveLength(1);
    expect(accounts.receipts[0].amounts.total).toBe(35_00);
  });
});

describe("a transfer is neither a receipt nor a payment", () => {
  it("never appears as income", () => {
    // Counting one is how a church reports the same £10,000 twice.
    const accounts = run({ transfers: [moved({ amount: 10_000_00 })] });
    expect(accounts.totalReceipts.total).toBe(0);
    expect(accounts.totalPayments.total).toBe(0);
  });

  it("nets to zero across the columns", () => {
    const accounts = run({ transfers: [moved({ amount: 50_00 })] });
    expect(accounts.transfers.total).toBe(0);
  });

  it("moves the money from one column to the other", () => {
    const accounts = run({ transfers: [moved({ fromFundId: "general", toFundId: "building", amount: 50_00 })] });
    expect(accounts.transfers.restricted).toBe(50_00);
    expect(accounts.transfers.unrestricted).toBe(-50_00);
  });

  it("shows nothing at all between two funds on the same side", () => {
    const accounts = run({ transfers: [moved({ fromFundId: "building", toFundId: "mission", amount: 50_00 })] });
    expect(accounts.transfers).toEqual({ restricted: 0, unrestricted: 0, total: 0 });
  });

  it("ignores a transfer outside the year", () => {
    const accounts = run({ transfers: [moved({ movedOn: "2025-06-20" })] });
    expect(accounts.transfers.restricted).toBe(0);
  });
});

describe("Gift Aid recovered", () => {
  it("counts on the day HMRC settled it, not when it was claimed", () => {
    const accounts = run({ claims: [claim({ settledOn: "2026-07-01" })] });
    expect(line(accounts.receipts, "Gift Aid recovered")?.amounts.total).toBe(25_00);
  });

  it("counts nothing for a claim HMRC has not paid", () => {
    // However certain it looks.
    const accounts = run({ claims: [claim({ settledOn: null })] });
    expect(line(accounts.receipts, "Gift Aid recovered")).toBeUndefined();
    expect(accounts.totalReceipts.total).toBe(0);
  });

  it("follows the restriction on the gifts it was claimed on", () => {
    // Tax recovered on a restricted gift carries the restriction with it. One
    // general-income line would quietly move restricted money across.
    const accounts = run({
      claims: [claim({ claimTotal: 100_00, gifts: [{ fundId: "building", amount: 400_00 }] })],
    });
    expect(line(accounts.receipts, "Gift Aid recovered")?.amounts).toEqual({
      restricted: 100_00,
      unrestricted: 0,
      total: 100_00,
    });
  });

  it("splits a claim across funds in proportion to the gifts", () => {
    const accounts = run({
      claims: [
        claim({
          claimTotal: 100_00,
          gifts: [
            { fundId: "building", amount: 300_00 },
            { fundId: "general", amount: 100_00 },
          ],
        }),
      ],
    });
    expect(line(accounts.receipts, "Gift Aid recovered")?.amounts).toEqual({
      restricted: 75_00,
      unrestricted: 25_00,
      total: 100_00,
    });
  });

  it("loses no penny to rounding, however awkward the split", () => {
    const accounts = run({
      claims: [
        claim({
          claimTotal: 10_00,
          gifts: [
            { fundId: "building", amount: 1 },
            { fundId: "general", amount: 1 },
            { fundId: "mission", amount: 1 },
          ],
        }),
      ],
    });
    expect(line(accounts.receipts, "Gift Aid recovered")?.amounts.total).toBe(10_00);
  });

  it("still banks a claim with no gifts attached", () => {
    // A receipt the church actually banked has to appear somewhere.
    const accounts = run({ claims: [claim({ claimTotal: 30_00, gifts: [] })] });
    expect(line(accounts.receipts, "Gift Aid recovered")?.amounts).toEqual({
      restricted: 0,
      unrestricted: 30_00,
      total: 30_00,
    });
  });
});

describe("apportioning a total", () => {
  it("splits evenly when the weights are even", () => {
    expect(apportion(100, [1, 1])).toEqual([50, 50]);
  });

  it("gives the remainder to the largest share, not the first", () => {
    expect(apportion(10, [1, 8, 1])).toEqual([1, 8, 1]);
    expect(apportion(100, [1, 2])).toEqual([33, 67]);
  });

  it("always adds back to the total", () => {
    for (const weights of [[1, 1, 1], [7, 11, 13], [1], [5, 5, 5, 5, 5, 5, 5]]) {
      const shares = apportion(1_000, weights);
      expect(shares.reduce((sum, share) => sum + share, 0)).toBe(1_000);
    }
  });

  it("gives nothing away when there is nothing to weigh", () => {
    expect(apportion(100, [])).toEqual([]);
    expect(apportion(100, [0, 0])).toEqual([0, 0]);
  });
});

describe("the opening balance and the span", () => {
  it("carries everything before the year into the opening balance", () => {
    const accounts = run({ gifts: [gift({ givenAt: "2025-06-01", amount: 700_00 })] });
    expect(accounts.opening.unrestricted).toBe(700_00);
    expect(accounts.totalReceipts.total).toBe(0);
  });

  it("counts the first day of the year once, in receipts and not in the opening", () => {
    // Taking it at both ends counts it twice and every total still looks
    // plausible, which is why `reconciles` exists.
    const accounts = run({ gifts: [gift({ givenAt: "2026-01-01" })] });
    expect(accounts.opening.total).toBe(0);
    expect(accounts.totalReceipts.total).toBe(100_00);
    expect(accounts.reconciles).toBe(true);
  });

  it("counts the last day of the year, and still closes", () => {
    // Both the year's movements and the independent closing figure have to
    // take the last day, or the statement silently stops balancing on 31
    // December — a date every church's accounts land on.
    const accounts = run({
      gifts: [gift({ givenAt: "2026-12-31" })],
      payments: [paid({ approvedOn: "2026-12-30", paidOn: "2026-12-31", amount: 20_00 })],
      transfers: [moved({ movedOn: "2026-12-31" })],
      claims: [claim({ settledOn: "2026-12-31" })],
    });
    expect(accounts.totalReceipts.total).toBe(125_00);
    expect(accounts.totalPayments.total).toBe(20_00);
    expect(accounts.closing.total).toBe(105_00);
    expect(accounts.reconciles).toBe(true);
  });

  it("ignores everything after the year end", () => {
    const accounts = run({ gifts: [gift({ givenAt: "2027-01-01" })] });
    expect(accounts.totalReceipts.total).toBe(0);
    expect(accounts.closing.total).toBe(0);
  });

  it("subtracts what was already spent from the opening balance", () => {
    const accounts = run({
      gifts: [gift({ givenAt: "2025-06-01", amount: 700_00 })],
      payments: [paid({ approvedOn: "2025-06-05", paidOn: "2025-06-10", amount: 200_00 })],
    });
    expect(accounts.opening.unrestricted).toBe(500_00);
  });
});

describe("the statement closes", () => {
  it("adds up: opening plus receipts less payments plus transfers", () => {
    const accounts = run({
      gifts: [gift({ givenAt: "2025-01-01", amount: 1_000_00 }), gift({ amount: 400_00 }), gift({ fundId: "building", amount: 600_00 })],
      payments: [paid({ amount: 150_00 }), paid({ fundId: "building", amount: 50_00, categoryName: "Repairs" })],
      transfers: [moved({ amount: 100_00 })],
      claims: [claim({ claimTotal: 100_00 })],
    });
    expect(accounts.opening.total).toBe(1_000_00);
    expect(accounts.totalReceipts.total).toBe(1_100_00);
    expect(accounts.totalPayments.total).toBe(200_00);
    expect(accounts.closing.total).toBe(1_900_00);
    expect(accounts.reconciles).toBe(true);
  });

  it("closes per column, not only in total", () => {
    const accounts = run({
      gifts: [gift({ fundId: "building", amount: 600_00 }), gift({ amount: 400_00 })],
      transfers: [moved({ amount: 100_00 })],
    });
    expect(accounts.closing.restricted).toBe(700_00);
    expect(accounts.closing.unrestricted).toBe(300_00);
    expect(accounts.reconciles).toBe(true);
  });

  it("reconciles when nothing has ever happened", () => {
    const accounts = run({});
    expect(accounts.closing).toEqual({ restricted: 0, unrestricted: 0, total: 0 });
    expect(accounts.reconciles).toBe(true);
  });

  it("leaves a liability out of the closing balance", () => {
    // The money has not left, so it is still in the closing balance — and
    // separately disclosed as owed.
    const accounts = run({
      gifts: [gift({ amount: 500_00 })],
      payments: [paid({ status: "APPROVED", paidOn: null, amount: 200_00 })],
    });
    expect(accounts.closing.total).toBe(500_00);
    expect(accounts.owed.total).toBe(200_00);
  });
});

describe("as a spreadsheet", () => {
  const accounts = () =>
    run({
      gifts: [gift({ amount: 400_00 }), gift({ fundId: "building", amount: 600_00 })],
      payments: [paid({ amount: 150_00, categoryName: "Utilities, heat and light" })],
    });

  it("writes money as decimals, not pence", () => {
    // A spreadsheet is the one place integers-as-pence get read wrongly by
    // everybody.
    expect(toCsv(accounts())).toContain("400.00");
  });

  it("quotes a line whose name contains a comma", () => {
    expect(toCsv(accounts())).toContain('"Utilities, heat and light"');
  });

  it("gives the three columns in a fixed order", () => {
    expect(toCsv(accounts())).toContain("Line,Restricted,Unrestricted,Total");
  });

  it("includes the opening and closing balances and what is owed", () => {
    const csv = toCsv(accounts());
    expect(csv).toContain("Opening balance");
    expect(csv).toContain("Closing balance");
    expect(csv).toContain("Agreed and not yet paid at the year end");
  });

  it("says in the file itself when the statement does not reconcile", () => {
    // The spreadsheet is what gets emailed on, so a figure nobody can trust
    // must not travel alone.
    const broken = { ...accounts(), reconciles: false };
    expect(toCsv(broken)).toMatch(/does not reconcile\. Do not file this/);
  });

  it("says nothing of the sort when it does reconcile", () => {
    expect(toCsv(accounts())).not.toMatch(/reconcile/);
  });
});

describe("what reconciling means", () => {
  it("agrees when every column agrees", () => {
    expect(columnsMatch({ restricted: 1, unrestricted: 2, total: 3 }, { restricted: 1, unrestricted: 2, total: 3 })).toBe(true);
  });

  it("refuses two columns wrong by the same amount in opposite directions", () => {
    // The one error this report exists to make impossible: a comparison on
    // the total alone would call this reconciled, while restricted money sat
    // in the unrestricted column.
    expect(columnsMatch({ restricted: 500, unrestricted: 0, total: 500 }, { restricted: 0, unrestricted: 500, total: 500 })).toBe(false);
  });

  it("refuses a difference in the restricted column alone", () => {
    expect(columnsMatch({ restricted: 1, unrestricted: 0, total: 1 }, { restricted: 2, unrestricted: 0, total: 2 })).toBe(false);
  });

  it("refuses a difference in the unrestricted column alone", () => {
    expect(columnsMatch({ restricted: 0, unrestricted: 1, total: 1 }, { restricted: 0, unrestricted: 2, total: 2 })).toBe(false);
  });

  it("refuses a total that does not match its own parts", () => {
    expect(columnsMatch({ restricted: 1, unrestricted: 1, total: 2 }, { restricted: 1, unrestricted: 1, total: 3 })).toBe(false);
  });
});
