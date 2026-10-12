import type { User } from "@prisma/client";
import { ApiError } from "@/lib/api-guard";
import { fromIsoDate, toIsoDate, todayIso, type IsoDate } from "@/lib/dates";
import { prisma } from "@/lib/db";
import {
  balanceOf,
  balances,
  checkTransfer,
  type FundBalance,
  type FundExpense,
  type FundGift,
  type FundRow,
  type Transfer,
} from "@/lib/funds";

/**
 * Fund balances against the database.
 *
 * The rules are in `funds.ts`. The one this file must not undermine is the
 * refusal to approve against a restricted fund in deficit: the balance is
 * always recomputed from the stored rows at the moment of the decision, never
 * cached and never taken from a request, because a balance that is one request
 * out of date is a balance that lets the second of two simultaneous approvals
 * through.
 */

const money = (minor: number) =>
  new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 }).format(
    minor / 100,
  );

export { money as formatFundMoney };

/**
 * Every row that bears on a fund balance.
 *
 * Deliberately unbounded by date: a balance is the whole history of a fund and
 * not a year of it. A fund balance computed over a span is how a church
 * discovers in April that its restricted fund has been empty since February.
 */
async function fundRows(): Promise<{
  gifts: FundGift[];
  expenses: FundExpense[];
  transfers: Transfer[];
}> {
  const [gifts, expenses, transfers] = await Promise.all([
    prisma.gift.findMany({
      where: { status: "SETTLED" },
      select: { fundId: true, amount: true, givenAt: true },
    }),
    prisma.expense.findMany({
      where: { fundId: { not: null } },
      select: { fundId: true, amount: true, status: true, incurredOn: true },
    }),
    prisma.fundTransfer.findMany({
      select: { fromFundId: true, toFundId: true, amount: true, movedOn: true },
    }),
  ]);

  return {
    gifts: gifts.map((gift) => ({ ...gift, givenAt: toIsoDate(gift.givenAt) })),
    expenses: expenses.map((expense) => ({ ...expense, incurredOn: toIsoDate(expense.incurredOn) })),
    transfers: transfers.map((transfer) => ({ ...transfer, movedOn: toIsoDate(transfer.movedOn) })),
  };
}

const fundSelect = {
  id: true,
  name: true,
  restricted: true,
  description: true,
  active: true,
} as const;

/** One fund's balance as the rules see it, or null when there is no such fund. */
export async function balanceFor(fundId: string | null): Promise<FundBalance | null> {
  if (!fundId) return null;
  const fund = await prisma.givingFund.findUnique({ where: { id: fundId }, select: fundSelect });
  if (!fund) return null;
  return balanceOf({ fund, ...(await fundRows()) });
}

/** Every fund's balance, restricted first, then tightest. */
export async function allBalances(includeClosed = true): Promise<FundBalance[]> {
  const [funds, rows] = await Promise.all([
    prisma.givingFund.findMany({
      where: includeClosed ? {} : { active: true },
      orderBy: [{ position: "asc" }, { name: "asc" }],
      select: fundSelect,
    }),
    fundRows(),
  ]);
  return balances({ funds: funds as FundRow[], ...rows });
}

export async function listTransfers(take = 50) {
  const rows = await prisma.fundTransfer.findMany({
    orderBy: [{ movedOn: "desc" }, { createdAt: "desc" }],
    take,
    select: {
      id: true,
      amount: true,
      movedOn: true,
      authority: true,
      note: true,
      recordedByEmail: true,
      from: { select: { id: true, name: true } },
      to: { select: { id: true, name: true } },
    },
  });
  return rows.map((row) => ({
    id: row.id,
    amount: row.amount,
    movedOn: toIsoDate(row.movedOn),
    authority: row.authority,
    note: row.note,
    recordedByEmail: row.recordedByEmail,
    fromFundId: row.from.id,
    fromName: row.from.name,
    toFundId: row.to.id,
    toName: row.to.name,
  }));
}

/**
 * Moves money between funds.
 *
 * The source balance is read inside the same call that writes the transfer, so
 * two people releasing the same money cannot both succeed on the strength of
 * the same stale figure. A transfer is never edited or deleted afterwards:
 * correcting one means a transfer the other way, which leaves both entries and
 * the reason for each on the record.
 */
export async function recordTransfer(
  input: { fromFundId: string; toFundId: string; amount: number; movedOn?: IsoDate; authority: string; note?: string | null },
  by: User,
) {
  const to = await prisma.givingFund.findUnique({
    where: { id: input.toFundId },
    select: { id: true, active: true },
  });
  if (!to) throw new ApiError(404, "not_found", "Not found");
  if (!to.active) throw new ApiError(409, "closed", "That fund is closed — money can't be moved into it.");

  const from = await balanceFor(input.fromFundId);
  const verdict = checkTransfer({
    from,
    toFundId: input.toFundId,
    amount: input.amount,
    authority: input.authority,
    money,
  });
  if (!verdict.ok) {
    throw new ApiError(verdict.reason === "Not found" ? 404 : 409, "refused", verdict.reason);
  }

  return prisma.fundTransfer.create({
    data: {
      fromFundId: input.fromFundId,
      toFundId: input.toFundId,
      amount: input.amount,
      movedOn: fromIsoDate(input.movedOn ?? todayIso()),
      authority: input.authority.trim(),
      note: input.note?.trim() || null,
      recordedByEmail: by.email,
    },
    select: { id: true },
  });
}
