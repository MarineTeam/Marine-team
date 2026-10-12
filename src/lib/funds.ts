import { compareIsoDates, type IsoDate } from "@/lib/dates";

/**
 * What is left in each fund — the rules, with no database near them.
 *
 * The app recorded income per fund and expenditure per fund and never
 * subtracted one from the other. It held every number needed to answer "how
 * much of the building fund is left?" and could not answer it, which is the
 * question a church asks before it commits to a roofer.
 *
 * Three decisions run through this file.
 *
 *   1. **A restricted fund cannot be approved into deficit.** The
 *      load-bearing one. A restricted fund is money given for a stated
 *      purpose: in England and Wales that is a trust, and spending it on
 *      something else is a breach rather than an irregularity. Churches commit
 *      one not by dishonesty but by having a single bank account and no
 *      per-fund balance anywhere.
 *   2. **Recording is never refused; the decision is.** The same split as the
 *      budget overspend next door, and for a sharper reason. Refusing to write
 *      down a cost does not stop the money leaving, it stops the money being
 *      known about. But *approving* is a decision being taken now, and that is
 *      where a control belongs. So a cost against an empty restricted fund is
 *      recorded, shown, and not approvable until somebody either moves it to
 *      another fund or tops the fund up.
 *   3. **An unrestricted fund may go overdrawn, and is told so.** The general
 *      fund going negative is bad news, not a rule breach, and a church that
 *      cannot record bad news has no way of acting on it.
 */

export type FundRow = {
  id: string;
  name: string;
  restricted: boolean;
  /** What the money was given for. Required in practice when restricted. */
  description: string | null;
  active: boolean;
};

export type FundGift = { fundId: string; amount: number; givenAt: IsoDate };

/**
 * Only the three states that mean something to a balance. An expense with no
 * fund is not this file's business — it belongs to a category budget instead.
 */
export type FundExpense = {
  fundId: string | null;
  amount: number;
  status: "SUBMITTED" | "APPROVED" | "PAID" | "REJECTED";
  incurredOn: IsoDate;
};

export type Transfer = {
  fromFundId: string;
  toFundId: string;
  amount: number;
  movedOn: IsoDate;
};

export type FundBalance = {
  fundId: string;
  name: string;
  restricted: boolean;
  /** Settled gifts into the fund. */
  given: number;
  /** Moved in from another fund, and out to one. */
  movedIn: number;
  movedOut: number;
  /** Actually left the bank against this fund. */
  spent: number;
  /** Approved against this fund and not yet paid. */
  committed: number;
  /** Entered against this fund and not yet approved by anybody. */
  awaiting: number;
  /** Given and moved in, less what has gone out. What is in the fund now. */
  balance: number;
  /**
   * The balance once the approved-but-unpaid bills land. The figure a decision
   * is actually taken against: committing twice over the same money is the
   * mistake a single balance invites.
   */
  available: number;
  /** True when `available` is below zero. Reported for any fund. */
  overdrawn: boolean;
};

export type Verdict = { ok: true } | { ok: false; reason: string };

/**
 * What is in one fund, and what is left once commitments land.
 *
 * `balance` counts money that has moved. `available` also subtracts what has
 * been approved and not yet paid, and is the one every decision is taken
 * against — a church reading only `balance` commits the same money twice, the
 * second time quite innocently, three weeks later.
 *
 * `awaiting` is reported and subtracted from neither: nobody has agreed to it
 * yet, so treating it as spent would block a fund on the strength of a claim
 * that may well be turned down.
 */
export function balanceOf(input: {
  fund: FundRow;
  gifts: readonly FundGift[];
  expenses: readonly FundExpense[];
  transfers: readonly Transfer[];
}): FundBalance {
  const { fund } = input;

  let given = 0;
  for (const gift of input.gifts) {
    if (gift.fundId === fund.id) given += gift.amount;
  }

  let movedIn = 0;
  let movedOut = 0;
  for (const transfer of input.transfers) {
    if (transfer.toFundId === fund.id) movedIn += transfer.amount;
    // Not `else`: a transfer to and from the same fund is refused when it is
    // written, but one already in the data must not silently inflate a fund.
    if (transfer.fromFundId === fund.id) movedOut += transfer.amount;
  }

  let spent = 0;
  let committed = 0;
  let awaiting = 0;
  for (const expense of input.expenses) {
    if (expense.fundId !== fund.id) continue;
    if (expense.status === "PAID") spent += expense.amount;
    else if (expense.status === "APPROVED") committed += expense.amount;
    else if (expense.status === "SUBMITTED") awaiting += expense.amount;
    // REJECTED touches no figure, and is kept so the refusal is on record.
  }

  const balance = given + movedIn - movedOut - spent;
  const available = balance - committed;

  return {
    fundId: fund.id,
    name: fund.name,
    restricted: fund.restricted,
    given,
    movedIn,
    movedOut,
    spent,
    committed,
    awaiting,
    balance,
    available,
    overdrawn: available < 0,
  };
}

/** Every fund's balance, the restricted ones first, then emptiest. */
export function balances(input: {
  funds: readonly FundRow[];
  gifts: readonly FundGift[];
  expenses: readonly FundExpense[];
  transfers: readonly Transfer[];
}): FundBalance[] {
  return input.funds
    .map((fund) => balanceOf({ ...input, fund }))
    .sort((a, b) => {
      // Restricted funds first because they are the ones with a rule attached;
      // within each group, the tightest first, since that is where a decision
      // is about to go wrong.
      if (a.restricted !== b.restricted) return a.restricted ? -1 : 1;
      return a.available - b.available || a.name.localeCompare(b.name);
    });
}

/**
 * Whether a cost may be *approved* against a fund.
 *
 * The refusal that gives the restricted flag its teeth. It fires on approval
 * and not on recording, because recording a cost is writing down something
 * that happened and approving it is a decision being taken now — and a control
 * that stops the writing down only means the church's own books are the last
 * place the truth appears.
 *
 * `available` rather than `balance`: two bills approved against the same
 * remaining money is the overspend this is meant to prevent, and it is never
 * noticed at the time.
 */
export function mayApproveAgainst(
  balance: FundBalance | null,
  amount: number,
  money: (minor: number) => string,
): Verdict {
  // No fund named: the cost is against a category budget only, which is
  // reported rather than refused. Not this file's business.
  if (!balance) return { ok: true };
  if (!balance.restricted) return { ok: true };
  if (amount <= balance.available) return { ok: true };

  const short = amount - balance.available;
  return {
    ok: false,
    reason:
      `${balance.name} is restricted and has ${money(Math.max(0, balance.available))} left, ` +
      `which is ${money(short)} short. Money given for one purpose can't be spent on another: ` +
      `move the cost to another fund, or top this one up and approve it then.`,
  };
}

/**
 * Whether a fund is coherently set up.
 *
 * A restricted fund with no stated purpose cannot be enforced by anybody —
 * there is no way to tell whether a cost is within purpose, which makes the
 * restriction a label rather than a rule. Asked for at the point the flag is
 * set, where somebody still knows the answer.
 */
export function checkFund(input: { restricted: boolean; description: string | null }): Verdict {
  if (input.restricted && !input.description?.trim()) {
    return {
      ok: false,
      reason:
        "Say what the money was given for. A restricted fund with no stated purpose can't be " +
        "enforced, because nothing says which costs are within it.",
    };
  }
  return { ok: true };
}

/**
 * Whether money may be moved between two funds.
 *
 * Transfers exist because without them a church whose trustees have released
 * part of a designated fund has no way to say so, and will mis-file the costs
 * against the general fund instead — a worse record than a transfer with a
 * reason against it.
 *
 * Moving money *out* of a restricted fund is the thing that needs explaining
 * years later, so the authority is required rather than optional, exactly as a
 * rejected claim must say why.
 */
export function checkTransfer(input: {
  from: FundBalance | null;
  toFundId: string;
  amount: number;
  authority: string;
  money: (minor: number) => string;
}): Verdict {
  if (!input.from) return { ok: false, reason: "Not found" };
  if (!Number.isInteger(input.amount) || input.amount <= 0) {
    return { ok: false, reason: "An amount is a whole number of pence, and more than nothing." };
  }
  if (input.from.fundId === input.toFundId) {
    return { ok: false, reason: "That's the same fund at both ends." };
  }
  if (!input.authority.trim()) {
    return {
      ok: false,
      reason:
        "Say what permits this — a trustee minute, a donor's agreement. Moving money between " +
        "funds is the entry somebody has to explain years later.",
    };
  }
  // Refused for a restricted source only, and for the same reason the
  // restriction exists: moving out money that was never there would claim the
  // donor's gift twice. An unrestricted source may be taken negative — with
  // one bank account a transfer only reallocates claims on the same pot, and
  // refusing it would stop a church recording a decision its trustees actually
  // took. That it goes negative is reported, as an overdrawn fund always is.
  if (input.from.restricted && input.amount > input.from.available) {
    return {
      ok: false,
      reason:
        `${input.from.name} is restricted and only has ${input.money(Math.max(0, input.from.available))} ` +
        `left once agreed bills are counted, so there isn't ${input.money(input.amount)} to move.`,
    };
  }
  return { ok: true };
}

/**
 * What to say about a fund in trouble, or null when there is nothing to say.
 *
 * Two different sentences, because they are two different problems: a
 * restricted fund in deficit is a breach to be put right, and the general fund
 * in deficit is bad news to act on.
 */
export function overdrawnNote(
  balance: FundBalance,
  money: (minor: number) => string,
): string | null {
  if (!balance.overdrawn) return null;
  const short = money(-balance.available);
  return balance.restricted
    ? `${balance.name} is restricted and ${short} overcommitted. Money given for one purpose has been committed to another — put it right before it is paid.`
    : `${balance.name} is ${short} overcommitted once the agreed bills land.`;
}

/** Gifts, expenses and transfers inside a span, by the date each happened. */
export function inSpan<T>(rows: readonly T[], at: (row: T) => IsoDate, from: IsoDate, to: IsoDate): T[] {
  return rows.filter(
    (row) => compareIsoDates(at(row), from) >= 0 && compareIsoDates(at(row), to) <= 0,
  );
}

/**
 * A fund balance as it may be shown to anybody.
 *
 * Built field by field rather than by deleting from the full one, so a figure
 * added later is private until somebody decides otherwise. What is left in a
 * restricted appeal is the sort of thing a church puts on a noticeboard; what
 * it has approved and not yet paid is not.
 */
export function publicBalance(balance: FundBalance) {
  return { name: balance.name, restricted: balance.restricted, balance: balance.balance };
}
