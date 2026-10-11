import { Prisma, type DeclarationMethod, type User } from "@prisma/client";
import { ApiError } from "@/lib/api-guard";
import { fromIsoDate, toIsoDate, todayIso, type IsoDate } from "@/lib/dates";
import { prisma } from "@/lib/db";
import {
  assess,
  blockedSummary,
  claimSchedule,
  claimValue,
  declarationIsComplete,
  expiringSoon,
  needsWrittenConfirmation,
  summariseClaim,
  type Assessed,
  type Declaration,
} from "@/lib/gift-aid";
import { requireGivingAccess } from "@/lib/giving-query";

/**
 * Declarations, claims, and the reconciliation that sits between them.
 *
 * The rules are in `gift-aid.ts`. Two things this file is responsible for.
 *
 * **Claiming is one transaction.** The gifts are stamped with the claim inside
 * the same transaction that creates it, and the stamp is conditional on them
 * still being unclaimed. Two treasurers pressing the button at the same moment
 * produce one claim and one honest refusal — the same shape as the resource
 * booker, for a better reason: a double claim to HMRC is a repayment and a
 * letter.
 *
 * **The totals the church sees are the totals it sends.** Every figure on the
 * screen and in the schedule comes from one `assess` pass over the same rows,
 * so there is no second arithmetic to disagree with the first.
 */

const declarationSelect = {
  id: true,
  personId: true,
  madeOn: true,
  coversPast: true,
  withdrawnOn: true,
  firstName: true,
  lastName: true,
  houseNumber: true,
  postcode: true,
  how: true,
} as const;

function asDeclaration(row: {
  id: string;
  personId: string;
  madeOn: Date;
  coversPast: boolean;
  withdrawnOn: Date | null;
  firstName: string;
  lastName: string;
  houseNumber: string;
  postcode: string;
  how: DeclarationMethod;
}): Declaration {
  return {
    ...row,
    madeOn: toIsoDate(row.madeOn),
    withdrawnOn: row.withdrawnOn ? toIsoDate(row.withdrawnOn) : null,
  };
}

export async function declarations(): Promise<Declaration[]> {
  const rows = await prisma.giftAidDeclaration.findMany({
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    select: declarationSelect,
  });
  return rows.map(asDeclaration);
}

export type DeclarationInput = {
  personId: string;
  madeOn: IsoDate;
  coversPast: boolean;
  title?: string | null;
  firstName: string;
  lastName: string;
  houseNumber: string;
  postcode: string;
  how: DeclarationMethod;
};

/**
 * Records a declaration.
 *
 * Completeness is checked here rather than when a claim is built: the person
 * who can fix a missing postcode is the one typing the form, and a claim that
 * falls over on the last step is a claim nobody attempts twice.
 */
export async function recordDeclaration(input: DeclarationInput, by: User) {
  const complete = declarationIsComplete(input);
  if (!complete.ok) {
    throw new ApiError(400, "incomplete", `HMRC needs ${complete.missing.join(", ")}.`);
  }
  if (input.madeOn > todayIso()) {
    throw new ApiError(400, "future", "A declaration can't be dated in the future.");
  }

  const person = await prisma.person.findUnique({ where: { id: input.personId }, select: { id: true } });
  if (!person) throw new ApiError(404, "not_found", "Not found");

  return prisma.giftAidDeclaration.create({
    data: {
      personId: input.personId,
      madeOn: fromIsoDate(input.madeOn),
      coversPast: input.coversPast,
      title: input.title?.trim() || null,
      firstName: input.firstName.trim(),
      lastName: input.lastName.trim(),
      houseNumber: input.houseNumber.trim(),
      postcode: input.postcode.trim().toUpperCase(),
      how: input.how,
      recordedByEmail: by.email,
    },
    select: { id: true },
  });
}

/**
 * Withdraws a declaration from a given day.
 *
 * The day matters and is asked for rather than assumed to be today: somebody
 * ringing in March to say they stopped paying tax last September is describing
 * September, and defaulting to today would leave six months of claims the
 * church is not entitled to.
 */
export async function withdrawDeclaration(id: string, on: IsoDate, note?: string | null) {
  const existing = await prisma.giftAidDeclaration.findUnique({
    where: { id },
    select: { madeOn: true, withdrawnOn: true },
  });
  if (!existing) throw new ApiError(404, "not_found", "Not found");
  if (existing.withdrawnOn) throw new ApiError(409, "already_withdrawn", "That's already been withdrawn.");
  if (on < toIsoDate(existing.madeOn)) {
    throw new ApiError(400, "before_made", "It can't be withdrawn before it was made.");
  }

  return prisma.giftAidDeclaration.update({
    where: { id },
    data: { withdrawnOn: fromIsoDate(on), withdrawnNote: note?.trim() || null },
    select: { id: true },
  });
}

/** Every gift in a span, assessed against the declarations on file. */
export async function assessSpan(from: IsoDate, to: IsoDate, today: IsoDate = todayIso()): Promise<Assessed[]> {
  const [gifts, onFile, funds] = await Promise.all([
    prisma.gift.findMany({
      where: { givenAt: { gte: fromIsoDate(from), lte: fromIsoDate(to) } },
      orderBy: { givenAt: "asc" },
      select: {
        id: true,
        amount: true,
        givenAt: true,
        fundId: true,
        giverId: true,
        giftAidClaimId: true,
        status: true,
      },
    }),
    declarations(),
    prisma.givingFund.findMany({ where: { taxDeductible: true }, select: { id: true } }),
  ]);

  return assess({
    gifts: gifts.map((row) => ({ ...row, givenAt: toIsoDate(row.givenAt), status: String(row.status) })),
    declarations: onFile,
    eligibleFundIds: funds.map((fund) => fund.id),
    today,
  });
}

/**
 * The reconciliation view: what can be claimed, what cannot, and what it is
 * worth either way.
 *
 * The blocked list is the half a church acts on, so it is not an afterthought
 * here — it comes back with a figure beside each reason, because "no
 * declaration on file: £4,120 unclaimed" is a sentence that gets somebody to
 * write to four people, and "12 gifts blocked" is not.
 */
export async function giftAidView(from: IsoDate, to: IsoDate, today: IsoDate = todayIso()) {
  const assessed = await assessSpan(from, to, today);
  const onFile = await declarations();

  return {
    from,
    to,
    summary: summariseClaim(assessed),
    blocked: blockedSummary(assessed),
    expiring: expiringSoon(assessed, today),
    schedule: claimSchedule(assessed),
    declarations: onFile.length,
    awaitingLetter: needsWrittenConfirmation(onFile).length,
  };
}

/**
 * Creates a claim and takes its gifts in one transaction.
 *
 * The stamp is a conditional `updateMany` on the gifts that were assessed as
 * claimable *and* are still unclaimed. If the count comes back short, somebody
 * else claimed one in between and the whole thing rolls back: a claim whose
 * total disagrees with the gifts behind it is worse than no claim, because HMRC
 * is told a number the church cannot reproduce.
 */
export async function createClaim(from: IsoDate, to: IsoDate, by: User) {
  const assessed = await assessSpan(from, to);
  const claimable = assessed.filter((row) => row.claimable);
  if (claimable.length === 0) {
    throw new ApiError(400, "nothing_to_claim", "There's nothing claimable in that span.");
  }

  const ids = claimable.map((row) => row.gift.id);
  const summary = summariseClaim(assessed);

  return prisma.$transaction(async (tx) => {
    const claim = await tx.giftAidClaim.create({
      data: {
        from: fromIsoDate(from),
        to: fromIsoDate(to),
        donationTotal: summary.donationTotal,
        claimTotal: summary.claimTotal,
        giftCount: summary.giftCount,
        createdByEmail: by.email,
      },
    });

    const { count } = await tx.gift.updateMany({
      where: { id: { in: ids }, giftAidClaimId: null },
      data: { giftAidClaimId: claim.id },
    });
    if (count !== ids.length) {
      throw new ApiError(
        409,
        "claimed_underneath",
        "Somebody claimed one of these while this was being prepared. Nothing has been sent — have another look.",
      );
    }

    return claim;
  });
}

/** Marks a claim as sent, and later as paid. */
export async function updateClaim(
  id: string,
  input: { submittedOn?: IsoDate | null; settledOn?: IsoDate | null; reference?: string | null },
) {
  const existing = await prisma.giftAidClaim.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw new ApiError(404, "not_found", "Not found");

  return prisma.giftAidClaim.update({
    where: { id },
    data: {
      ...(input.submittedOn !== undefined
        ? { submittedOn: input.submittedOn ? fromIsoDate(input.submittedOn) : null }
        : {}),
      ...(input.settledOn !== undefined
        ? { settledOn: input.settledOn ? fromIsoDate(input.settledOn) : null }
        : {}),
      ...(input.reference !== undefined ? { reference: input.reference?.trim() || null } : {}),
    },
    select: { id: true },
  });
}

/**
 * Deletes a claim that was never sent, releasing its gifts.
 *
 * Refused once it has been submitted. A claim HMRC has seen is a thing that
 * happened, and deleting the record of it while the money is in flight is how a
 * church ends up unable to explain a payment in its own bank account.
 */
export async function deleteClaim(id: string): Promise<void> {
  const claim = await prisma.giftAidClaim.findUnique({
    where: { id },
    select: { submittedOn: true },
  });
  if (!claim) throw new ApiError(404, "not_found", "Not found");
  if (claim.submittedOn) {
    throw new ApiError(409, "already_submitted", "That's already gone to HMRC. It can't be unmade here.");
  }
  // The gifts' SetNull releases them for the next claim.
  await prisma.giftAidClaim.delete({ where: { id } });
}

export async function claims(take = 50) {
  return prisma.giftAidClaim.findMany({
    orderBy: { createdAt: "desc" },
    take,
    select: {
      id: true,
      from: true,
      to: true,
      donationTotal: true,
      claimTotal: true,
      giftCount: true,
      submittedOn: true,
      settledOn: true,
      reference: true,
    },
  });
}

/**
 * The one number a treasurer wants before anything else: what is sitting
 * unclaimed, and what of that is fixable.
 */
export async function unclaimedWorth(today: IsoDate = todayIso()) {
  const from = toIsoDate(new Date(Date.now() - 5 * 365 * 86_400_000));
  const assessed = await assessSpan(from, today, today);
  const blocked = blockedSummary(assessed);

  return {
    claimableNow: summariseClaim(assessed).claimTotal,
    fixable: blocked.filter((row) => row.fixable).reduce((sum, row) => sum + row.worth, 0),
    lost: blocked
      .filter((row) => row.reason === "too-old")
      .reduce((sum, row) => sum + row.worth, 0),
  };
}

export { claimValue, requireGivingAccess };

/** Surfaces a Prisma unique-constraint clash as something readable. */
export function isUniqueClash(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}
