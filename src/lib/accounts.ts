import { compareIsoDates, type IsoDate } from "@/lib/dates";

/**
 * Receipts and payments for a financial year — the rules, with no database
 * near them.
 *
 * Every piece of this has existed for a while: gifts by fund, Gift Aid claims
 * HMRC has settled, expenses with a paid date, transfers between funds, and a
 * restricted flag on each fund. Nothing assembled them. A church could see
 * what arrived, what it spent, and what was left in each fund, and still had
 * nothing to hand its annual meeting or an independent examiner.
 *
 * Four decisions run through this file, and three of them are inversions of
 * rules that hold elsewhere in the app.
 *
 *   1. **Cash, not commitment.** A payment counts on the day the money left,
 *      by `paidOn` — the exact opposite of the budget report next door, which
 *      counts by `incurredOn` because a budget answers "what did this year
 *      cost?". This answers "what moved through the bank?", and the two
 *      genuinely differ. An invoice approved in December and paid in January
 *      belongs to December's budget and to January's receipts and payments.
 *      Getting this backwards produces a statement that cannot be reconciled
 *      against a bank statement, which is the one thing it must do.
 *   2. **Approved and not yet paid is a liability, never a payment.** It
 *      appears on its own line, outside the receipts and payments columns. A
 *      statement that counted it would not add up against the bank, and one
 *      that omitted it entirely would hide what the church owes.
 *   3. **A transfer between funds is neither a receipt nor a payment.** It
 *      moves money between the columns and nets to zero across them. Counting
 *      one as income is how a church reports the same £10,000 twice.
 *   4. **Restricted and unrestricted are separate columns, and the
 *      restriction follows the money.** Including the Gift Aid: a claim is
 *      apportioned across funds in proportion to the gifts it was claimed on,
 *      because tax recovered on a restricted gift carries the restriction with
 *      it. A single "general income" line for Gift Aid would quietly move
 *      restricted money into the unrestricted column, which is the breach the
 *      restricted-fund rules exist to prevent.
 *
 * The financial year is **not** the tax year. Gift Aid runs on the tax year,
 * which is fixed by HMRC; the accounts run on whatever year the church
 * adopted, often 1 January and often not. Treating them as one is how a
 * statement ends up covering the wrong twelve months.
 */

export type FundInfo = { id: string; name: string; restricted: boolean };

export type GiftIn = { fundId: string; amount: number; givenAt: IsoDate };

export type PaymentOut = {
  fundId: string | null;
  categoryName: string;
  amount: number;
  /** Null until the money has actually left. */
  paidOn: IsoDate | null;
  /** When somebody agreed to it, which is when it became a liability. */
  approvedOn: IsoDate | null;
  status: "SUBMITTED" | "APPROVED" | "PAID" | "REJECTED";
};

export type TransferIn = {
  fromFundId: string;
  toFundId: string;
  amount: number;
  movedOn: IsoDate;
};

/** A Gift Aid claim HMRC has settled, with the gifts it was claimed on. */
export type TaxClaim = {
  claimTotal: number;
  settledOn: IsoDate | null;
  gifts: { fundId: string; amount: number }[];
};

export type Column = { restricted: number; unrestricted: number; total: number };

export type AccountLine = { name: string; amounts: Column };

export type ReceiptsAndPayments = {
  from: IsoDate;
  /** Inclusive, like every other span in this app. */
  to: IsoDate;
  label: string;
  opening: Column;
  receipts: AccountLine[];
  totalReceipts: Column;
  payments: AccountLine[];
  totalPayments: Column;
  /** Moves between funds. Zero in the total column by construction. */
  transfers: Column;
  closing: Column;
  /**
   * Agreed by the year end and not paid by it: owed, not spent.
   *
   * Judged on the dates rather than the row's current status, so a bill
   * approved in December and paid the following February is a liability at 31
   * December — which is what it was, whatever it looks like now.
   */
  owed: Column;
  /**
   * Whether the statement closes.
   *
   * The closing balance is worked out twice by different routes — once as
   * opening plus the year's movements, once from the whole history up to the
   * year end — and this says they agree. It catches a date-boundary mistake,
   * which is the way this sort of report usually goes wrong: an opening
   * balance taking the first day of the year and the receipts taking it too
   * counts that day twice, and every total still looks plausible. It is not a
   * check for missing data, and it cannot be.
   */
  reconciles: boolean;
};

const GIFT_AID_LINE = "Gift Aid recovered";
const UNRESTRICTED_PAYMENTS = "no fund named";

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
 * Whether two columns are the same figure, in every column.
 *
 * Exported because it is what `reconciles` means, and a comparison that only
 * looked at the total would call a statement reconciled while the restricted
 * and unrestricted columns were each wrong by the same amount in opposite
 * directions — the one error this report exists to make impossible.
 */
export function columnsMatch(a: Column, b: Column): boolean {
  return a.restricted === b.restricted && a.unrestricted === b.unrestricted && a.total === b.total;
}

/**
 * The financial year beginning in `year`, as an inclusive span.
 *
 * Inclusive at both ends to match every other span in this app, so the last
 * day of the year is in it. A half-open range would be defensible on its own
 * and a disaster mixed with the inclusive ones — a gift on 31 December would
 * fall into whichever function happened to look at it.
 */
export function financialYear(
  year: number,
  startMonth = 1,
  startDay = 1,
): { from: IsoDate; to: IsoDate; label: string } {
  const pad = (value: number) => String(value).padStart(2, "0");
  const from = `${year}-${pad(startMonth)}-${pad(startDay)}`;
  const end = new Date(Date.UTC(year + 1, startMonth - 1, startDay));
  end.setUTCDate(end.getUTCDate() - 1);
  const to = `${end.getUTCFullYear()}-${pad(end.getUTCMonth() + 1)}-${pad(end.getUTCDate())}`;
  // Named for both years when it straddles them, because "the 2026 accounts"
  // means different twelve months to two churches a mile apart.
  const label = startMonth === 1 && startDay === 1 ? `${year}` : `${year}–${year + 1}`;
  return { from, to, label };
}

const within = (date: IsoDate, from: IsoDate, to: IsoDate) =>
  compareIsoDates(date, from) >= 0 && compareIsoDates(date, to) <= 0;

const before = (date: IsoDate, from: IsoDate) => compareIsoDates(date, from) < 0;

const upTo = (date: IsoDate, to: IsoDate) => compareIsoDates(date, to) <= 0;

/**
 * Splits a total across weighted shares, exactly.
 *
 * Used to apportion a Gift Aid claim across the funds its gifts went to.
 * Floor each share and give the whole remainder to the largest, so the parts
 * add back to the total to the penny: a statement that loses 2p to rounding is
 * a statement somebody spends an evening on.
 */
export function apportion(total: number, weights: readonly number[]): number[] {
  const sum = weights.reduce((running, weight) => running + weight, 0);
  if (sum <= 0 || weights.length === 0) return weights.map(() => 0);

  const shares = weights.map((weight) => Math.floor((total * weight) / sum));
  const remainder = total - shares.reduce((running, share) => running + share, 0);

  let biggest = 0;
  for (let index = 1; index < weights.length; index += 1) {
    if (weights[index] > weights[biggest]) biggest = index;
  }
  shares[biggest] += remainder;
  return shares;
}

/** What a settled Gift Aid claim is worth to each column. */
function taxColumn(claim: TaxClaim, restricted: (fundId: string) => boolean): Column {
  const funds = claim.gifts.map((gift) => gift.fundId);
  const shares = apportion(claim.claimTotal, claim.gifts.map((gift) => gift.amount));

  let restrictedShare = 0;
  let unrestrictedShare = 0;
  for (let index = 0; index < funds.length; index += 1) {
    if (restricted(funds[index])) restrictedShare += shares[index];
    else unrestrictedShare += shares[index];
  }
  // A claim with no gifts attached cannot be apportioned, so it falls to the
  // unrestricted column rather than disappearing: a receipt the church
  // actually banked must appear somewhere.
  if (funds.length === 0) unrestrictedShare += claim.claimTotal;
  return column(restrictedShare, unrestrictedShare);
}

/**
 * The statement.
 *
 * Takes everything rather than querying, so the rules can be read and tested
 * without a database, and so what counts as a gift stays defined in
 * `giving.ts` rather than being decided again here.
 */
export function receiptsAndPayments(input: {
  from: IsoDate;
  to: IsoDate;
  label?: string;
  funds: readonly FundInfo[];
  gifts: readonly GiftIn[];
  payments: readonly PaymentOut[];
  transfers: readonly TransferIn[];
  claims: readonly TaxClaim[];
}): ReceiptsAndPayments {
  const { from, to } = input;
  const restrictedFunds = new Set(input.funds.filter((fund) => fund.restricted).map((fund) => fund.id));
  const names = new Map(input.funds.map((fund) => [fund.id, fund.name]));
  const isRestricted = (fundId: string | null) => fundId !== null && restrictedFunds.has(fundId);

  const giftColumn = (gift: GiftIn) =>
    isRestricted(gift.fundId) ? column(gift.amount, 0) : column(0, gift.amount);

  // Receipts, by fund, plus the tax recovered.
  const byFund = new Map<string, Column>();
  for (const gift of input.gifts) {
    if (!within(gift.givenAt, from, to)) continue;
    const name = names.get(gift.fundId) ?? "Unknown fund";
    byFund.set(name, add(byFund.get(name) ?? column(0, 0), giftColumn(gift)));
  }

  let tax = column(0, 0);
  for (const claim of input.claims) {
    // Dated by settlement, not submission: a claim HMRC has not paid is not a
    // receipt, however certain it looks.
    if (claim.settledOn && within(claim.settledOn, from, to)) {
      tax = add(tax, taxColumn(claim, (fundId) => restrictedFunds.has(fundId)));
    }
  }

  const receipts: AccountLine[] = [...byFund.entries()]
    .map(([name, amounts]) => ({ name, amounts }))
    .sort((a, b) => b.amounts.total - a.amounts.total || a.name.localeCompare(b.name));
  if (tax.total !== 0) receipts.push({ name: GIFT_AID_LINE, amounts: tax });

  // Payments, by category, on the day the money left.
  const byCategory = new Map<string, Column>();
  let owed = column(0, 0);
  for (const payment of input.payments) {
    const amounts = isRestricted(payment.fundId)
      ? column(payment.amount, 0)
      : column(0, payment.amount);

    // Owed at the year end: agreed by then and not paid by then. Written
    // against the dates rather than the current status, because a bill
    // approved in December and paid the following February was a liability on
    // 31 December whatever it looks like when the report is run — and a
    // statement of a past year has to say what was true then, not now.
    const agreedByThen = payment.approvedOn !== null && upTo(payment.approvedOn, to);
    const paidByThen = payment.paidOn !== null && upTo(payment.paidOn, to);
    if (payment.status !== "REJECTED" && agreedByThen && !paidByThen) {
      owed = add(owed, amounts);
    }

    if (payment.status !== "PAID" || !payment.paidOn) continue;
    if (!within(payment.paidOn, from, to)) continue;
    const name = payment.categoryName || UNRESTRICTED_PAYMENTS;
    byCategory.set(name, add(byCategory.get(name) ?? column(0, 0), amounts));
  }

  const payments: AccountLine[] = [...byCategory.entries()]
    .map(([name, amounts]) => ({ name, amounts }))
    .sort((a, b) => b.amounts.total - a.amounts.total || a.name.localeCompare(b.name));

  const totalReceipts = receipts.reduce((running, line) => add(running, line.amounts), column(0, 0));
  const totalPayments = payments.reduce((running, line) => add(running, line.amounts), column(0, 0));

  // Transfers move between columns and net to zero across them.
  let transfers = column(0, 0);
  for (const transfer of input.transfers) {
    if (!within(transfer.movedOn, from, to)) continue;
    const out = restrictedFunds.has(transfer.fromFundId)
      ? column(transfer.amount, 0)
      : column(0, transfer.amount);
    const into = restrictedFunds.has(transfer.toFundId)
      ? column(transfer.amount, 0)
      : column(0, transfer.amount);
    transfers = add(transfers, minus(into, out));
  }

  const opening = netAt(input, (date) => before(date, from), restrictedFunds, isRestricted);
  const closing = add(minus(add(opening, totalReceipts), totalPayments), transfers);
  const direct = netAt(input, (date) => upTo(date, to), restrictedFunds, isRestricted);

  return {
    from,
    to,
    label: input.label ?? `${from} to ${to}`,
    opening,
    receipts,
    totalReceipts,
    payments,
    totalPayments,
    transfers,
    closing,
    owed,
    reconciles: columnsMatch(closing, direct),
  };
}

/**
 * Net cash position over every row whose date passes `when`.
 *
 * Shared by the opening balance and by the independent closing figure, so the
 * two cannot drift apart on anything but their date test — which is precisely
 * what `reconciles` is there to compare.
 */
function netAt(
  input: {
    gifts: readonly GiftIn[];
    payments: readonly PaymentOut[];
    transfers: readonly TransferIn[];
    claims: readonly TaxClaim[];
  },
  when: (date: IsoDate) => boolean,
  restrictedFunds: ReadonlySet<string>,
  isRestricted: (fundId: string | null) => boolean,
): Column {
  let net = column(0, 0);

  for (const gift of input.gifts) {
    if (!when(gift.givenAt)) continue;
    net = add(net, isRestricted(gift.fundId) ? column(gift.amount, 0) : column(0, gift.amount));
  }

  for (const claim of input.claims) {
    if (!claim.settledOn || !when(claim.settledOn)) continue;
    net = add(net, taxColumn(claim, (fundId) => restrictedFunds.has(fundId)));
  }

  for (const payment of input.payments) {
    if (payment.status !== "PAID" || !payment.paidOn || !when(payment.paidOn)) continue;
    net = minus(net, isRestricted(payment.fundId) ? column(payment.amount, 0) : column(0, payment.amount));
  }

  for (const transfer of input.transfers) {
    if (!when(transfer.movedOn)) continue;
    const out = restrictedFunds.has(transfer.fromFundId)
      ? column(transfer.amount, 0)
      : column(0, transfer.amount);
    const into = restrictedFunds.has(transfer.toFundId)
      ? column(transfer.amount, 0)
      : column(0, transfer.amount);
    net = add(net, minus(into, out));
  }

  return net;
}

/**
 * The statement as a spreadsheet.
 *
 * An examiner asks for the figures in something they can open, and a church
 * that cannot produce one types them out again by hand, which is where the
 * transcription errors come from. Minor units are written as decimals here
 * because a spreadsheet is the one place pence-as-integers would be read
 * wrongly by everybody.
 */
export function toCsv(accounts: ReceiptsAndPayments): string {
  const cell = (value: string) => (/[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);
  const amount = (minor: number) => (minor / 100).toFixed(2);
  const row = (name: string, amounts: Column) =>
    [cell(name), amount(amounts.restricted), amount(amounts.unrestricted), amount(amounts.total)].join(",");

  const lines = [
    `Receipts and payments,${cell(accounts.label)}`,
    `${cell(accounts.from)} to ${cell(accounts.to)}`,
    "",
    "Line,Restricted,Unrestricted,Total",
    row("Opening balance", accounts.opening),
    "",
    "Receipts,,,",
    ...accounts.receipts.map((line) => row(line.name, line.amounts)),
    row("Total receipts", accounts.totalReceipts),
    "",
    "Payments,,,",
    ...accounts.payments.map((line) => row(line.name, line.amounts)),
    row("Total payments", accounts.totalPayments),
    "",
    row("Transfers between funds", accounts.transfers),
    row("Closing balance", accounts.closing),
    "",
    row("Agreed and not yet paid at the year end", accounts.owed),
  ];

  if (!accounts.reconciles) {
    // Said in the file itself, not only on the screen: the spreadsheet is what
    // gets emailed on, and a figure nobody can trust must not travel alone.
    lines.push("", "WARNING,The closing balance does not reconcile. Do not file this.");
  }

  return lines.join("\n");
}
