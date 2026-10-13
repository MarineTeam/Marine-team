import { toIsoDate, type IsoDate } from "@/lib/dates";
import { prisma } from "@/lib/db";
import {
  financialYear,
  receiptsAndPayments,
  type GiftIn,
  type PaymentOut,
  type ReceiptsAndPayments,
  type TaxClaim,
  type TransferIn,
} from "@/lib/accounts";

/**
 * The annual statement against the database.
 *
 * The rules are in `accounts.ts`. This file's only job is to hand them every
 * row that bears on the year, and the one thing it must not do is filter by
 * date: the opening balance is the whole history before the year started, so a
 * query scoped to the year would produce a statement that opened at nothing
 * and closed at whatever the year did — which looks entirely plausible and is
 * wrong by however much the church had in the bank.
 */

export async function annualAccounts(
  year: number,
  startMonth = 1,
  startDay = 1,
): Promise<ReceiptsAndPayments> {
  const span = financialYear(year, startMonth, startDay);

  const [funds, gifts, expenses, transfers, claims] = await Promise.all([
    prisma.givingFund.findMany({ select: { id: true, name: true, restricted: true } }),
    prisma.gift.findMany({
      where: { status: "SETTLED" },
      select: { fundId: true, amount: true, givenAt: true },
    }),
    prisma.expense.findMany({
      select: {
        fundId: true,
        amount: true,
        paidOn: true,
        approvedOn: true,
        status: true,
        category: { select: { name: true } },
      },
    }),
    prisma.fundTransfer.findMany({
      select: { fromFundId: true, toFundId: true, amount: true, movedOn: true },
    }),
    prisma.giftAidClaim.findMany({
      // Only settled claims can be receipts, and an unsettled one carries no
      // date to put it under, so there is nothing for the rules to weigh.
      where: { settledOn: { not: null } },
      select: { claimTotal: true, settledOn: true, gifts: { select: { fundId: true, amount: true } } },
    }),
  ]);

  return receiptsAndPayments({
    from: span.from,
    to: span.to,
    label: span.label,
    funds,
    gifts: gifts.map(
      (gift): GiftIn => ({ fundId: gift.fundId, amount: gift.amount, givenAt: toIsoDate(gift.givenAt) }),
    ),
    payments: expenses.map(
      (expense): PaymentOut => ({
        fundId: expense.fundId,
        categoryName: expense.category.name,
        amount: expense.amount,
        paidOn: expense.paidOn ? toIsoDate(expense.paidOn) : null,
        approvedOn: expense.approvedOn ? toIsoDate(expense.approvedOn) : null,
        status: expense.status,
      }),
    ),
    transfers: transfers.map(
      (transfer): TransferIn => ({
        fromFundId: transfer.fromFundId,
        toFundId: transfer.toFundId,
        amount: transfer.amount,
        movedOn: toIsoDate(transfer.movedOn),
      }),
    ),
    claims: claims.map(
      (claim): TaxClaim => ({
        claimTotal: claim.claimTotal,
        settledOn: claim.settledOn ? toIsoDate(claim.settledOn) : null,
        gifts: claim.gifts.map((gift) => ({ fundId: gift.fundId, amount: gift.amount })),
      }),
    ),
  });
}

/**
 * The years there is anything to report on, newest first.
 *
 * Offering every year since 1970 in a dropdown is how somebody files the
 * accounts for 1994 by accident, so the list is bounded by the data: the first
 * year anything was recorded, to the current one.
 */
export async function yearsWithActivity(startMonth = 1, startDay = 1): Promise<number[]> {
  const [firstGift, firstExpense] = await Promise.all([
    prisma.gift.findFirst({ orderBy: { givenAt: "asc" }, select: { givenAt: true } }),
    prisma.expense.findFirst({ orderBy: { incurredOn: "asc" }, select: { incurredOn: true } }),
  ]);

  const earliest = [firstGift?.givenAt, firstExpense?.incurredOn]
    .filter((date): date is Date => date instanceof Date)
    .sort((a, b) => a.getTime() - b.getTime())[0];

  const yearOf = (date: IsoDate) => {
    const [y, m, d] = date.split("-").map(Number);
    const beforeStart = m < startMonth || (m === startMonth && d < startDay);
    return beforeStart ? y - 1 : y;
  };

  const thisYear = yearOf(toIsoDate(new Date()));
  if (!earliest) return [thisYear];

  const first = yearOf(toIsoDate(earliest));
  const years: number[] = [];
  for (let year = thisYear; year >= first; year -= 1) years.push(year);
  return years;
}
