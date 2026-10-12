import { type ExpenseStatus, type User } from "@prisma/client";
import { ApiError } from "@/lib/api-guard";
import { fromIsoDate, toIsoDate, todayIso, type IsoDate } from "@/lib/dates";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/current-user";
import {
  awaitingApproval,
  byCategory,
  checkExpense,
  inSpan,
  mayApprove,
  mayPay,
  netPosition,
  owed,
  rejectWith,
  spendOf,
  type ExpenseRow,
} from "@/lib/expenses";
import { mayApproveAgainst } from "@/lib/funds";
import { balanceFor, formatFundMoney } from "@/lib/funds-query";
import { hasCapability } from "@/lib/permissions";

/**
 * Expenses against the database.
 *
 * The rules are in `expenses.ts`. The one this file has to be careful not to
 * undermine is the self-approval refusal: every path that moves an expense to
 * APPROVED goes through `mayApprove` with the **current** user, re-read from
 * the session rather than taken from the request, so an approver id in a body
 * is worth nothing.
 *
 * Anybody signed in may submit a claim — a volunteer out of pocket is not
 * staff. Everything else needs `manage_giving`.
 */

export async function requireMoney(): Promise<User> {
  const user = await getCurrentUser();
  if (!user || !(await hasCapability(user, "manage_giving"))) {
    throw new ApiError(404, "not_found", "Not found");
  }
  return user;
}

/** Submitting a claim needs only an account: being out of pocket is enough. */
export async function requireClaimant(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) throw new ApiError(403, "sign_in", "Sign in first.");
  return user;
}

const expenseSelect = {
  id: true,
  categoryId: true,
  amount: true,
  payee: true,
  description: true,
  incurredOn: true,
  status: true,
  claimantId: true,
  approvedById: true,
  approvedByEmail: true,
  approvedOn: true,
  paidOn: true,
  paidMethod: true,
  rejectedReason: true,
  receiptRef: true,
  fundId: true,
  category: { select: { id: true, name: true } },
  claimant: { select: { id: true, name: true, displayName: true, email: true } },
} as const;

type RawExpense = {
  id: string;
  categoryId: string;
  amount: number;
  status: ExpenseStatus;
  incurredOn: Date;
  claimantId: string | null;
  approvedById: string | null;
  paidOn: Date | null;
  fundId: string | null;
};

function asRow(row: RawExpense): ExpenseRow {
  return {
    id: row.id,
    categoryId: row.categoryId,
    amount: row.amount,
    status: row.status,
    incurredOn: toIsoDate(row.incurredOn),
    claimantId: row.claimantId,
    approvedById: row.approvedById,
    paidOn: row.paidOn ? toIsoDate(row.paidOn) : null,
    fundId: row.fundId,
  };
}

/** Re-reads one expense as the rules see it, for a guard that must not trust a body. */
async function load(id: string): Promise<ExpenseRow> {
  const row = await prisma.expense.findUnique({
    where: { id },
    select: { id: true, categoryId: true, amount: true, status: true, incurredOn: true, claimantId: true, approvedById: true, paidOn: true, fundId: true },
  });
  if (!row) throw new ApiError(404, "not_found", "Not found");
  return asRow(row);
}

export async function listCategories(includeClosed = true) {
  return prisma.expenseCategory.findMany({
    where: includeClosed ? {} : { active: true },
    orderBy: [{ active: "desc" }, { position: "asc" }, { name: "asc" }],
    select: { id: true, name: true, slug: true, annualBudget: true, active: true, position: true },
  });
}

export async function createCategory(input: { name: string; slug: string; annualBudget: number | null }) {
  if (input.annualBudget !== null && (!Number.isInteger(input.annualBudget) || input.annualBudget <= 0)) {
    throw new ApiError(400, "bad_budget", "A budget is a whole number of pence, or nothing at all.");
  }
  return prisma.expenseCategory.create({
    data: { name: input.name.trim(), slug: input.slug.trim(), annualBudget: input.annualBudget },
    select: { id: true },
  });
}

export async function updateCategory(
  id: string,
  input: { name?: string; annualBudget?: number | null; active?: boolean },
) {
  const existing = await prisma.expenseCategory.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw new ApiError(404, "not_found", "Not found");
  return prisma.expenseCategory.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.annualBudget !== undefined ? { annualBudget: input.annualBudget } : {}),
      ...(input.active !== undefined ? { active: input.active } : {}),
    },
    select: { id: true },
  });
}

export type ExpenseInput = {
  categoryId: string;
  amount: number;
  payee: string;
  description: string;
  incurredOn: IsoDate;
  /** Set when it is a reimbursement rather than an invoice. */
  claimantId?: string | null;
  receiptRef?: string | null;
  fundId?: string | null;
};

/**
 * Records a cost, or a claim.
 *
 * Always lands as SUBMITTED, whoever entered it. A treasurer entering an
 * invoice still has to approve it, which looks like a formality until the day
 * somebody asks who agreed to a £9,000 payment and the answer is a timestamp
 * rather than a shrug.
 */
export async function recordExpense(input: ExpenseInput, by: User) {
  const sane = checkExpense({ ...input, today: todayIso() });
  if (!sane.ok) throw new ApiError(400, "bad_expense", sane.reason);

  const category = await prisma.expenseCategory.findUnique({
    where: { id: input.categoryId },
    select: { id: true, active: true },
  });
  if (!category) throw new ApiError(404, "not_found", "Not found");
  if (!category.active) throw new ApiError(409, "closed", "That category is closed.");

  return prisma.expense.create({
    data: {
      categoryId: input.categoryId,
      amount: input.amount,
      payee: input.payee.trim(),
      description: input.description.trim(),
      incurredOn: fromIsoDate(input.incurredOn),
      claimantId: input.claimantId ?? null,
      receiptRef: input.receiptRef?.trim() || null,
      fundId: input.fundId ?? null,
      recordedByEmail: by.email,
    },
    select: { id: true },
  });
}

/**
 * Approves a claim, if the rules allow this person to.
 *
 * The verdict comes from `mayApprove` against the row as stored and the user as
 * signed in. Neither the claimant nor the approver is ever read from the
 * request, which is what makes the self-approval refusal mean anything.
 */
export async function approveExpense(id: string, approver: User) {
  const row = await load(id);
  const verdict = mayApprove(row, { id: approver.id, manages: true });
  if (!verdict.ok) {
    throw new ApiError(verdict.reason === "Not found" ? 404 : 409, "refused", verdict.reason);
  }

  // A restricted fund in deficit refuses the *approval*, not the record: the
  // balance is recomputed here rather than anywhere earlier, because a figure
  // one request old lets the second of two simultaneous approvals through.
  const fund = mayApproveAgainst(await balanceFor(row.fundId), row.amount, formatFundMoney);
  if (!fund.ok) throw new ApiError(409, "fund_restricted", fund.reason);

  const { count } = await prisma.expense.updateMany({
    where: { id, status: "SUBMITTED" },
    data: {
      status: "APPROVED",
      approvedById: approver.id,
      approvedByEmail: approver.email,
      approvedOn: fromIsoDate(todayIso()),
    },
  });
  // Conditional on still being SUBMITTED, so two approvers pressing together
  // produce one approval rather than the second overwriting the first's name.
  if (count === 0) throw new ApiError(409, "moved", "Somebody has already dealt with that.");
}

export async function rejectExpense(id: string, reason: string, by: User) {
  const row = await load(id);
  const verdict = mayApprove(row, { id: by.id, manages: true });
  if (!verdict.ok) {
    throw new ApiError(verdict.reason === "Not found" ? 404 : 409, "refused", verdict.reason);
  }
  const said = rejectWith(reason);
  if (!said.ok) throw new ApiError(400, "needs_reason", said.why);

  await prisma.expense.update({
    where: { id },
    data: { status: "REJECTED", rejectedReason: said.reason, approvedByEmail: by.email },
    select: { id: true },
  });
}

/** Puts a rejected claim back in the queue, so a mistake is not final. */
export async function reopenExpense(id: string) {
  const { count } = await prisma.expense.updateMany({
    where: { id, status: "REJECTED" },
    data: { status: "SUBMITTED", rejectedReason: null },
  });
  if (count === 0) throw new ApiError(409, "not_rejected", "That isn't a rejected claim.");
}

export async function payExpense(id: string, input: { paidOn: IsoDate; method?: string | null }, by: User) {
  const row = await load(id);
  const verdict = mayPay(row, { id: by.id, manages: true });
  if (!verdict.ok) {
    throw new ApiError(verdict.reason === "Not found" ? 404 : 409, "refused", verdict.reason);
  }

  const { count } = await prisma.expense.updateMany({
    where: { id, status: "APPROVED" },
    data: { status: "PAID", paidOn: fromIsoDate(input.paidOn), paidMethod: input.method?.trim() || null },
  });
  if (count === 0) throw new ApiError(409, "moved", "Somebody has already paid that.");
}

/**
 * The treasurer's view over a span: spend by category, the queue, and the
 * position.
 *
 * `received` is asked of the giving tables rather than recomputed here, so what
 * counts as income stays defined in one place.
 */
export async function moneyView(from: IsoDate, to: IsoDate) {
  const [rawExpenses, categories, gifts] = await Promise.all([
    prisma.expense.findMany({ orderBy: { incurredOn: "desc" }, select: expenseSelect }),
    prisma.expenseCategory.findMany({
      where: { active: true },
      orderBy: [{ position: "asc" }, { name: "asc" }],
      select: { id: true, name: true, annualBudget: true, active: true },
    }),
    prisma.gift.findMany({
      where: { status: "SETTLED", givenAt: { gte: fromIsoDate(from), lte: fromIsoDate(to) } },
      select: { amount: true },
    }),
  ]);

  const rows = rawExpenses.map(asRow);
  const inYear = inSpan(rows, from, to);
  const received = gifts.reduce((sum, gift) => sum + gift.amount, 0);

  const describe = (row: ExpenseRow) => {
    const full = rawExpenses.find((raw) => raw.id === row.id)!;
    return {
      ...row,
      payee: full.payee,
      description: full.description,
      categoryName: full.category.name,
      claimant: full.claimant?.displayName ?? full.claimant?.name ?? full.claimant?.email ?? null,
      approvedByEmail: full.approvedByEmail,
      rejectedReason: full.rejectedReason,
      receiptRef: full.receiptRef,
      paidMethod: full.paidMethod,
    };
  };

  return {
    from,
    to,
    spend: spendOf(inYear),
    byCategory: byCategory(inYear, categories),
    position: netPosition({ received, expenses: inYear }),
    waiting: awaitingApproval(rows).map(describe),
    owing: owed(rows).map(describe),
    recent: inYear.slice(0, 50).map(describe),
  };
}

/**
 * One person's own claims.
 *
 * Needs no capability — being out of pocket is not a staff privilege, and a
 * volunteer who cannot see whether their £8 has been paid will stop claiming
 * and quietly subsidise the church instead.
 */
export async function myClaims(userId: string) {
  const rows = await prisma.expense.findMany({
    where: { claimantId: userId },
    orderBy: { incurredOn: "desc" },
    take: 100,
    select: expenseSelect,
  });
  return rows.map((row) => ({
    id: row.id,
    amount: row.amount,
    payee: row.payee,
    description: row.description,
    incurredOn: toIsoDate(row.incurredOn),
    status: row.status,
    categoryName: row.category.name,
    paidOn: row.paidOn ? toIsoDate(row.paidOn) : null,
    rejectedReason: row.rejectedReason,
  }));
}
