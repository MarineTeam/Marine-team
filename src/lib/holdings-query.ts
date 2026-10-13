import type { HoldingKind, User } from "@prisma/client";
import { ApiError } from "@/lib/api-guard";
import { addIsoDays, compareIsoDates, fromIsoDate, toIsoDate, todayIso, type IsoDate } from "@/lib/dates";
import { prisma } from "@/lib/db";
import { annualAccounts } from "@/lib/accounts-query";
import {
  assetsAndLiabilities,
  type AssetsAndLiabilities,
  type HoldingRow,
  type TaxClaimRow,
} from "@/lib/holdings";

/**
 * The statement of assets and liabilities against the database.
 *
 * The rules are in `holdings.ts`. What this file must not do is work out the
 * cash or the creditors itself: both come from the receipts and payments
 * account for the same year, so the two statements cannot disagree about a
 * figure they share — which is the discrepancy an examiner spots first and the
 * church cannot explain.
 */

export async function statement(
  year: number,
  startMonth = 1,
  startDay = 1,
): Promise<AssetsAndLiabilities & { label: string }> {
  // The year's receipts and payments, which carry the closing cash and the
  // approved-and-unpaid figure as at the same date.
  const accounts = await annualAccounts(year, startMonth, startDay);

  const [claims, holdings, funds] = await Promise.all([
    prisma.giftAidClaim.findMany({ select: { claimTotal: true, submittedOn: true, settledOn: true } }),
    prisma.holding.findMany({
      select: { id: true, name: true, kind: true, amount: true, asAt: true, fundId: true },
    }),
    prisma.givingFund.findMany({ where: { restricted: true }, select: { id: true } }),
  ]);

  const built = assetsAndLiabilities({
    asAt: accounts.to,
    cash: accounts.closing,
    creditors: accounts.owed,
    claims: claims.map(
      (claim): TaxClaimRow => ({
        claimTotal: claim.claimTotal,
        submittedOn: claim.submittedOn ? toIsoDate(claim.submittedOn) : null,
        settledOn: claim.settledOn ? toIsoDate(claim.settledOn) : null,
      }),
    ),
    holdings: holdings.map((row): HoldingRow => ({ ...row, asAt: toIsoDate(row.asAt) })),
    restrictedFunds: new Set(funds.map((fund) => fund.id)),
  });

  return { ...built, label: accounts.label };
}

/** Everything typed in, newest year end first, for the editing list. */
export async function listHoldings() {
  const rows = await prisma.holding.findMany({
    orderBy: [{ asAt: "desc" }, { name: "asc" }],
    take: 200,
    select: {
      id: true,
      name: true,
      kind: true,
      amount: true,
      asAt: true,
      note: true,
      fund: { select: { id: true, name: true } },
    },
  });
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    kind: row.kind,
    amount: row.amount,
    asAt: toIsoDate(row.asAt),
    note: row.note,
    fundId: row.fund?.id ?? null,
    fundName: row.fund?.name ?? null,
  }));
}

export type HoldingInput = {
  name: string;
  kind: HoldingKind;
  amount: number;
  asAt: IsoDate;
  fundId?: string | null;
  note?: string | null;
};

/**
 * Records what something was worth at a year end.
 *
 * Upserts on the name and the date, because the unique index says one figure
 * per item per year end and a treasurer correcting a typo should not have to
 * delete a row first. A *different* year end is a new row, never an edit of
 * the old one: last year's statement has to keep saying what it said.
 */
export async function recordHolding(input: HoldingInput, by: User) {
  if (!Number.isInteger(input.amount) || input.amount <= 0) {
    throw new ApiError(400, "bad_amount", "An amount is a whole number of pence, and more than nothing.");
  }
  const name = input.name.trim();
  if (!name) throw new ApiError(400, "bad_name", "Give it a name.");
  // Not "no later than today": a year end is a reporting date, and the current
  // year's is in the future for most of the year. A treasurer looking at 2026
  // in October has every reason to attach the building's valuation to 31
  // December 2026. What this stops is the typo — 2206 rather than 2026 — so
  // the bound is a year out, which covers every real year end and nothing else.
  if (compareIsoDates(input.asAt, addIsoDays(todayIso(), 400)) > 0) {
    throw new ApiError(400, "far_future", "That year end is more than a year away — check the date.");
  }

  return prisma.holding.upsert({
    where: { name_asAt: { name, asAt: fromIsoDate(input.asAt) } },
    create: {
      name,
      kind: input.kind,
      amount: input.amount,
      asAt: fromIsoDate(input.asAt),
      fundId: input.fundId ?? null,
      note: input.note?.trim() || null,
      recordedByEmail: by.email,
    },
    update: {
      kind: input.kind,
      amount: input.amount,
      fundId: input.fundId ?? null,
      note: input.note?.trim() || null,
      recordedByEmail: by.email,
    },
    select: { id: true },
  });
}

/**
 * Removes one figure.
 *
 * Allowed, unlike a membership entry or a fund transfer, because a holding is
 * a *valuation* rather than a record of something that happened: a figure
 * entered against the wrong year is noise, not history, and leaving it there
 * would carry it forward into every later statement.
 */
export async function removeHolding(id: string) {
  const existing = await prisma.holding.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw new ApiError(404, "not_found", "Not found");
  await prisma.holding.delete({ where: { id } });
}
