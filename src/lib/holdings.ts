import type { HoldingKind } from "@prisma/client";
import { compareIsoDates, type IsoDate } from "@/lib/dates";

/**
 * The statement of assets and liabilities — the rules, with no database near
 * them.
 *
 * A receipts-and-payments charity files two statements, not one. The receipts
 * and payments account says what moved through the bank over the year; this
 * says what the church holds and owes at the end of it, and an examiner asks
 * for both. Shipping the first alone was half a filing.
 *
 * Most of it is already derivable from what the app records, and the point of
 * this file is that those parts are *not* retyped:
 *
 *   - **Cash** is the closing balance the receipts and payments account
 *     already works out. Taken rather than recomputed, so the two statements
 *     cannot disagree about the one figure they share.
 *   - **What the church owes** is the expenses approved by the year end and
 *     not paid by it, which that account already separates out as owed.
 *   - **What is owed to the church** is the Gift Aid claims submitted by the
 *     year end and not settled by it. A claim nobody has sent is not a debtor:
 *     HMRC owes nothing until it has been asked.
 *
 * What is left is the building, the minibus and the loan, which no transaction
 * in this app implies and which somebody types in. Those carry a year end of
 * their own, and when a year has no figure for an item the most recent one is
 * used **and labelled with where it came from**. A valuation that is silently
 * four years old is how a balance sheet goes quietly wrong; one that says
 * "carried forward from 2022" is a prompt to go and check.
 */

export type Column = { restricted: number; unrestricted: number; total: number };

export type HoldingRow = {
  id: string;
  name: string;
  kind: HoldingKind;
  amount: number;
  asAt: IsoDate;
  fundId: string | null;
};

export type TaxClaimRow = {
  claimTotal: number;
  submittedOn: IsoDate | null;
  settledOn: IsoDate | null;
};

export type StatementLine = {
  name: string;
  amounts: Column;
  /**
   * Null when the figure was entered for this year end. Otherwise the year end
   * it was carried forward from, which is the whole reason this field exists.
   */
  carriedFrom: IsoDate | null;
};

export type AssetsAndLiabilities = {
  asAt: IsoDate;
  assets: StatementLine[];
  liabilities: StatementLine[];
  totalAssets: Column;
  totalLiabilities: Column;
  /** Assets less liabilities, which is what the church is worth on paper. */
  netAssets: Column;
  /** The lines using a figure from an earlier year end, worth saying out loud. */
  stale: StatementLine[];
};

const CASH = "Cash at bank and in hand";
const DEBTORS = "Gift Aid claimed and not yet received";
const CREDITORS = "Agreed and not yet paid";

function column(restricted: number, unrestricted: number): Column {
  return { restricted, unrestricted, total: restricted + unrestricted };
}

function add(a: Column, b: Column): Column {
  return column(a.restricted + b.restricted, a.unrestricted + b.unrestricted);
}

function minus(a: Column, b: Column): Column {
  return column(a.restricted - b.restricted, a.unrestricted - b.unrestricted);
}

/**
 * What HMRC owed at a year end.
 *
 * Submitted by then and not settled by then — judged on the dates rather than
 * the row's current state, so a claim submitted in November and paid the
 * following March is a debtor at 31 December. The same discipline the
 * creditors figure uses, and for the same reason: a statement of a past year
 * has to say what was true then.
 */
export function debtorsAt(claims: readonly TaxClaimRow[], asAt: IsoDate): number {
  let owed = 0;
  for (const claim of claims) {
    const asked = claim.submittedOn !== null && compareIsoDates(claim.submittedOn, asAt) <= 0;
    const paid = claim.settledOn !== null && compareIsoDates(claim.settledOn, asAt) <= 0;
    if (asked && !paid) owed += claim.claimTotal;
  }
  return owed;
}

/**
 * The figure for each hand-entered item at a year end, carrying forward.
 *
 * One line per item name, taking its latest figure dated on or before the year
 * end. An item whose latest figure is from an earlier year is still reported —
 * the church still owns the hall — but the line says where the number came
 * from. An item with nothing on or before the date does not appear at all: it
 * had not been bought yet.
 */
export function heldAt(
  holdings: readonly HoldingRow[],
  asAt: IsoDate,
  restricted: (fundId: string | null) => boolean,
): { assets: StatementLine[]; liabilities: StatementLine[] } {
  const latest = new Map<string, HoldingRow>();
  for (const holding of holdings) {
    if (compareIsoDates(holding.asAt, asAt) > 0) continue;
    const best = latest.get(holding.name);
    // Strictly later wins, so a tie keeps the first seen rather than flapping.
    if (!best || compareIsoDates(holding.asAt, best.asAt) > 0) latest.set(holding.name, holding);
  }

  const assets: StatementLine[] = [];
  const liabilities: StatementLine[] = [];

  for (const holding of latest.values()) {
    const line: StatementLine = {
      name: holding.name,
      amounts: restricted(holding.fundId)
        ? column(holding.amount, 0)
        : column(0, holding.amount),
      carriedFrom: holding.asAt === asAt ? null : holding.asAt,
    };
    (holding.kind === "ASSET" ? assets : liabilities).push(line);
  }

  const biggestFirst = (a: StatementLine, b: StatementLine) =>
    b.amounts.total - a.amounts.total || a.name.localeCompare(b.name);
  return { assets: assets.sort(biggestFirst), liabilities: liabilities.sort(biggestFirst) };
}

/**
 * The statement.
 *
 * `cash` and `creditors` come from the receipts and payments account rather
 * than being worked out again here, so the two statements cannot disagree
 * about a figure they share — which is the failure an examiner spots first and
 * the church cannot explain.
 */
export function assetsAndLiabilities(input: {
  asAt: IsoDate;
  /** The closing balance from the receipts and payments account. */
  cash: Column;
  /** The approved-and-unpaid figure from that same account. */
  creditors: Column;
  claims: readonly TaxClaimRow[];
  holdings: readonly HoldingRow[];
  restrictedFunds: ReadonlySet<string>;
}): AssetsAndLiabilities {
  const restricted = (fundId: string | null) => fundId !== null && input.restrictedFunds.has(fundId);
  const entered = heldAt(input.holdings, input.asAt, restricted);

  // Gift Aid recovered follows the restriction of the gifts it was claimed on,
  // but a claim row does not carry them: apportioning it would mean reading
  // every gift again, and a debtor sitting in the unrestricted column is the
  // safer error — it understates restricted funds rather than overstating
  // them, which is the direction that cannot cause a breach.
  const debtors = debtorsAt(input.claims, input.asAt);

  const assets: StatementLine[] = [{ name: CASH, amounts: input.cash, carriedFrom: null }];
  if (debtors !== 0) {
    assets.push({ name: DEBTORS, amounts: column(0, debtors), carriedFrom: null });
  }
  assets.push(...entered.assets);

  const liabilities: StatementLine[] = [];
  if (input.creditors.total !== 0) {
    liabilities.push({ name: CREDITORS, amounts: input.creditors, carriedFrom: null });
  }
  liabilities.push(...entered.liabilities);

  const totalAssets = assets.reduce((running, line) => add(running, line.amounts), column(0, 0));
  const totalLiabilities = liabilities.reduce(
    (running, line) => add(running, line.amounts),
    column(0, 0),
  );

  return {
    asAt: input.asAt,
    assets,
    liabilities,
    totalAssets,
    totalLiabilities,
    netAssets: minus(totalAssets, totalLiabilities),
    stale: [...assets, ...liabilities].filter((line) => line.carriedFrom !== null),
  };
}

/**
 * The statement as a spreadsheet, to sit beside the other one.
 *
 * A carried-forward figure says so in the file as well as on the screen. The
 * spreadsheet is what gets emailed to the examiner, and a four-year-old
 * valuation travelling without that note is the thing they would have asked
 * about.
 */
export function toCsv(statement: AssetsAndLiabilities): string {
  const cell = (value: string) => (/[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);
  const amount = (minor: number) => (minor / 100).toFixed(2);
  const row = (line: StatementLine) =>
    [
      cell(line.name),
      amount(line.amounts.restricted),
      amount(line.amounts.unrestricted),
      amount(line.amounts.total),
      line.carriedFrom ? cell(`carried forward from ${line.carriedFrom}`) : "",
    ].join(",");
  const total = (name: string, amounts: Column) =>
    [cell(name), amount(amounts.restricted), amount(amounts.unrestricted), amount(amounts.total), ""].join(",");

  return [
    `Assets and liabilities,${cell(statement.asAt)}`,
    "",
    "Line,Restricted,Unrestricted,Total,Note",
    "Assets,,,,",
    ...statement.assets.map(row),
    total("Total assets", statement.totalAssets),
    "",
    "Liabilities,,,,",
    ...statement.liabilities.map(row),
    total("Total liabilities", statement.totalLiabilities),
    "",
    total("Net assets", statement.netAssets),
  ].join("\n");
}
