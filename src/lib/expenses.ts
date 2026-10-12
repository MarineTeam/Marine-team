import type { ExpenseStatus } from "@prisma/client";
import { compareIsoDates, type IsoDate } from "@/lib/dates";

/**
 * Money going out — the rules, with no database near them.
 *
 * Giving, Gift Aid and campaigns made the income side of a treasurer's job
 * good. None of it says where a penny went. A church could see what arrived
 * and not what it spent, which is half an answer to the only question the
 * annual meeting actually asks.
 *
 * Four decisions run through this file.
 *
 *   1. **Nobody approves their own claim.** The load-bearing one, and the
 *      reason this file exists rather than a few columns. A volunteer who can
 *      wave through their own reimbursement is a fraud route of the kind found
 *      years later by an auditor rather than next week by a colleague. It is a
 *      refusal, not a warning, and it holds even for the treasurer.
 *   2. **Approved is not paid.** A budget answers "what have we committed?"
 *      and a bank statement answers "what has left?". Reporting one as the
 *      other means either double-spending or believing the church is poorer
 *      than it is. Both figures travel together, always.
 *   3. **A rejection says why.** A claim refused with nothing written is one
 *      the claimant asks about in the car park, and the person who refused it
 *      cannot remember.
 *   4. **Over budget is reported, never refused.** A boiler fails in February
 *      whatever the budget said. Refusing the entry does not stop the money
 *      going out; it stops the money being recorded.
 */

export type ExpenseRow = {
  id: string;
  categoryId: string;
  amount: number;
  status: ExpenseStatus;
  incurredOn: IsoDate;
  claimantId: string | null;
  approvedById: string | null;
  paidOn: IsoDate | null;
  /// The fund it comes out of, where a church earmarks that way. Null means
  /// the cost answers to a category budget only.
  fundId: string | null;
};

export type CategoryRow = {
  id: string;
  name: string;
  annualBudget: number | null;
  active: boolean;
};

export type Approver = { id: string; manages: boolean };

export type Verdict = { ok: true } | { ok: false; reason: string };

/**
 * Whether somebody may approve a claim.
 *
 * Two conditions and the second is the whole point: they must hold the money
 * grant, **and** the claim must not be theirs. The self-check comes first so
 * its message is the one returned — "you cannot approve your own" is the
 * useful sentence, and "you lack a capability" is not, for somebody who
 * plainly has it.
 */
export function mayApprove(expense: ExpenseRow, approver: Approver): Verdict {
  if (expense.claimantId !== null && expense.claimantId === approver.id) {
    return {
      ok: false,
      reason: "You can't approve your own claim — somebody else has to look at it.",
    };
  }
  if (!approver.manages) {
    return { ok: false, reason: "Not found" };
  }
  if (expense.status === "APPROVED" || expense.status === "PAID") {
    return { ok: false, reason: "That's already been approved." };
  }
  if (expense.status === "REJECTED") {
    return { ok: false, reason: "That was turned down. Reopen it first." };
  }
  return { ok: true };
}

/** Whether somebody may record that it has been paid. */
export function mayPay(expense: ExpenseRow, approver: Approver): Verdict {
  if (!approver.manages) return { ok: false, reason: "Not found" };
  if (expense.status === "PAID") return { ok: false, reason: "That's already been paid." };
  if (expense.status !== "APPROVED") {
    // Paying something nobody approved is the other half of the same hole.
    return { ok: false, reason: "It has to be approved before it's paid." };
  }
  // Deliberately *not* refused when the payer is the claimant: somebody has
  // already agreed the claim, and the person who moves the money is often the
  // only one with the bank details. The approval is the control.
  return { ok: true };
}

/** Turning a claim down, which must say why. */
export function rejectWith(reason: string): { ok: true; reason: string } | { ok: false; why: string } {
  const text = reason.trim();
  if (!text) {
    return { ok: false, why: "Say why it's being turned down — the claimant will ask." };
  }
  return { ok: true, reason: text };
}

/**
 * Whether an expense makes sense before it is written.
 *
 * A future date is refused because a cost incurred next March is a plan, not
 * an expense, and a budget that counts plans is a budget that double-counts
 * when the thing is actually bought.
 */
export function checkExpense(input: {
  amount: number;
  incurredOn: IsoDate;
  today: IsoDate;
  payee: string;
  description: string;
}): Verdict {
  if (!Number.isInteger(input.amount) || input.amount <= 0) {
    return { ok: false, reason: "An amount is a whole number of pence, and more than nothing." };
  }
  if (compareIsoDates(input.incurredOn, input.today) > 0) {
    return { ok: false, reason: "That's in the future — record it when it happens." };
  }
  if (!input.payee.trim()) return { ok: false, reason: "Who was paid?" };
  if (!input.description.trim()) return { ok: false, reason: "Say what it was for." };
  return { ok: true };
}

export type Spend = {
  /** Agreed and not yet gone: a commitment against the budget. */
  committed: number;
  /** Actually left the bank. */
  paid: number;
  /** Entered and not yet approved — nobody's money yet, but worth seeing. */
  awaiting: number;
  /** Committed plus paid: what the budget has been spent against. */
  againstBudget: number;
};

/**
 * What a set of expenses amounts to, in the states that mean different things.
 *
 * `againstBudget` is committed plus paid, because an approved invoice is spent
 * even though the money is still in the account — that is what a commitment
 * *is*. `paid` alone is what reconciles to a bank statement. Both are returned
 * because reporting either on its own is how a church overspends or panics.
 */
export function spendOf(expenses: readonly ExpenseRow[]): Spend {
  let committed = 0;
  let paid = 0;
  let awaiting = 0;

  for (const expense of expenses) {
    if (expense.status === "APPROVED") committed += expense.amount;
    else if (expense.status === "PAID") paid += expense.amount;
    else if (expense.status === "SUBMITTED") awaiting += expense.amount;
    // REJECTED counts toward nothing, and is kept so the refusal is on record.
  }

  return { committed, paid, awaiting, againstBudget: committed + paid };
}

export type CategorySpend = {
  categoryId: string;
  name: string;
  budget: number | null;
  spend: Spend;
  /** Budget minus what it has been spent against. Null without a budget. */
  remaining: number | null;
  /** 0–1 and uncapped above: going over is the thing worth seeing. */
  fractionUsed: number | null;
  over: boolean;
};

/**
 * Spend against budget, per category, most overspent first.
 *
 * `fractionUsed` is deliberately **not** capped at 1. A progress bar that stops
 * at full is fine for a pledge, where going over is generosity; here going over
 * is the single thing the report exists to show, and flattening 140% to 100%
 * hides it.
 */
export function byCategory(
  expenses: readonly ExpenseRow[],
  categories: readonly CategoryRow[],
): CategorySpend[] {
  return categories
    .map((category) => {
      const spend = spendOf(expenses.filter((expense) => expense.categoryId === category.id));
      const remaining = category.annualBudget === null ? null : category.annualBudget - spend.againstBudget;
      return {
        categoryId: category.id,
        name: category.name,
        budget: category.annualBudget,
        spend,
        remaining,
        fractionUsed:
          category.annualBudget && category.annualBudget > 0
            ? spend.againstBudget / category.annualBudget
            : null,
        over: remaining !== null && remaining < 0,
      };
    })
    .sort((a, b) => {
      if (a.over !== b.over) return a.over ? -1 : 1;
      return b.spend.againstBudget - a.spend.againstBudget;
    });
}

/**
 * Expenses inside a span, by the date the cost was incurred.
 *
 * Incurred rather than paid, because a budget year is about when things
 * happened. An invoice from December settled in January belongs to December,
 * and a church that files it by the payment date finds its December figures
 * change after the year has closed.
 */
export function inSpan(
  expenses: readonly ExpenseRow[],
  from: IsoDate,
  to: IsoDate,
): ExpenseRow[] {
  return expenses.filter(
    (expense) =>
      compareIsoDates(expense.incurredOn, from) >= 0 && compareIsoDates(expense.incurredOn, to) <= 0,
  );
}

/**
 * Claims waiting on somebody, oldest first.
 *
 * Oldest first and not biggest: a volunteer who is out of pocket is out of
 * pocket, and a queue sorted by amount leaves the small claims for ever, which
 * is how people stop claiming and quietly subsidise the church instead.
 */
export function awaitingApproval(expenses: readonly ExpenseRow[]): ExpenseRow[] {
  return expenses
    .filter((expense) => expense.status === "SUBMITTED")
    .sort((a, b) => compareIsoDates(a.incurredOn, b.incurredOn));
}

/** Approved and still not paid — what the church owes right now. */
export function owed(expenses: readonly ExpenseRow[]): ExpenseRow[] {
  return expenses
    .filter((expense) => expense.status === "APPROVED")
    .sort((a, b) => compareIsoDates(a.incurredOn, b.incurredOn));
}

export type NetPosition = {
  received: number;
  paidOut: number;
  /** Received minus paid. Negative is a church spending more than it takes. */
  net: number;
  /** Approved and not yet gone — what is already promised away. */
  committed: number;
  /** Net after the commitments land. The number to plan with. */
  netAfterCommitments: number;
};

/**
 * In against out, over a span.
 *
 * Two figures for the position and not one, for the reason that runs through
 * this file: the bank balance and the position a church is actually in differ
 * by everything it has agreed to pay and not yet paid. A treasurer reading only
 * the first commits money twice.
 *
 * Takes the income total rather than computing it, so this file never has to
 * know what counts as a gift — that rule lives in `giving.ts` and should stay
 * in one place.
 */
export function netPosition(input: { received: number; expenses: readonly ExpenseRow[] }): NetPosition {
  const spend = spendOf(input.expenses);
  return {
    received: input.received,
    paidOut: spend.paid,
    net: input.received - spend.paid,
    committed: spend.committed,
    netAfterCommitments: input.received - spend.paid - spend.committed,
  };
}

/**
 * What to say about a category that has gone over.
 *
 * Reported, never refused — a boiler fails in February whatever the budget
 * said, and refusing the entry does not stop the money going out, it stops the
 * money being recorded.
 */
export function overspendNote(row: CategorySpend, money: (minor: number) => string): string | null {
  if (!row.over || row.remaining === null || row.budget === null) return null;
  return `${row.name} is ${money(-row.remaining)} over its ${money(row.budget)}.`;
}
