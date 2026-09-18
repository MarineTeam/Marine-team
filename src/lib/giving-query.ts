import { Prisma, type GiftSource, type User } from "@prisma/client";
import { ApiError } from "@/lib/api-guard";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/current-user";
import { hasCapability } from "@/lib/permissions";
import { slugify } from "@/lib/slug";
import {
  byFund,
  statementFor,
  total as totalOf,
  taxYearOf,
  taxYearRange,
  type FundRow,
  type GiftRow,
  type IncomingGift,
  type Statement,
} from "@/lib/giving";

/**
 * Recording what came in.
 *
 * The rules are in `giving.ts`. What this file is careful about is the one
 * thing a payment webhook always eventually does: **deliver the same event
 * twice.** Every processor retries, and a retry that records a second gift is
 * a church telling somebody they gave twice as much as they did. The unique
 * constraint on the reference is what makes that impossible; the code below
 * turns the collision into "already recorded" rather than an error.
 */

const fundSelect = {
  id: true,
  name: true,
  slug: true,
  description: true,
  active: true,
  taxDeductible: true,
  position: true,
} as const;

const giftSelect = {
  id: true,
  amount: true,
  currency: true,
  fundId: true,
  status: true,
  source: true,
  givenAt: true,
  householdId: true,
  giverId: true,
  message: true,
  note: true,
  externalId: true,
  recordedByEmail: true,
} as const;

/** The office, for money. Its own capability — see capabilities.ts. */
export async function requireGivingAccess(): Promise<User> {
  const user = await getCurrentUser();
  if (!user || !(await hasCapability(user, "manage_giving"))) {
    throw new ApiError(404, "not_found", "Not found");
  }
  return user;
}

export async function listFunds(includeClosed = true) {
  return prisma.givingFund.findMany({
    where: includeClosed ? {} : { active: true },
    select: fundSelect,
    orderBy: [{ position: "asc" }, { name: "asc" }],
  });
}

export async function createFund(input: {
  name: string;
  description?: string | null;
  taxDeductible?: boolean;
}) {
  const name = input.name.trim();
  const slug = slugify(name);
  if (!slug) throw new ApiError(400, "bad_name", "Give the fund a name.");
  return prisma.givingFund.create({
    data: {
      name,
      slug,
      description: input.description?.trim() || null,
      taxDeductible: input.taxDeductible ?? true,
    },
    select: fundSelect,
  });
}

export async function updateFund(
  id: string,
  input: { name?: string; description?: string | null; active?: boolean; taxDeductible?: boolean; position?: number },
) {
  return prisma.givingFund.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.description !== undefined ? { description: input.description?.trim() || null } : {}),
      ...(input.active !== undefined ? { active: input.active } : {}),
      ...(input.taxDeductible !== undefined ? { taxDeductible: input.taxDeductible } : {}),
      ...(input.position !== undefined ? { position: input.position } : {}),
    },
    select: fundSelect,
  });
}

/**
 * Who a gift belongs to, from the email the payment page collected.
 *
 * Best effort and deliberately quiet about failing: an unmatched gift is
 * recorded as anonymous rather than refused. Money that arrived is a fact, and
 * a webhook is the wrong place to argue about whose it was — somebody can
 * attach it later from the admin screen.
 */
async function giverFromEmail(email: string | null) {
  if (!email) return { giverId: null, householdId: null };
  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase().trim() },
    select: { person: { select: { id: true, householdId: true } } },
  });
  return {
    giverId: user?.person?.id ?? null,
    householdId: user?.person?.householdId ?? null,
  };
}

async function fundBySlug(slug: string | null) {
  if (slug) {
    const named = await prisma.givingFund.findUnique({ where: { slug }, select: { id: true } });
    if (named) return named.id;
  }
  // Money with no fund named still has to land somewhere it can be found.
  const fallback = await prisma.givingFund.findFirst({
    where: { active: true },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    select: { id: true },
  });
  if (!fallback) throw new ApiError(409, "no_fund", "No giving fund has been set up to receive this.");
  return fallback.id;
}

export type RecordOutcome = { recorded: boolean; giftId: string };

/**
 * Records a gift from the payment page, exactly once.
 *
 * The second delivery of the same event hits the unique index and is answered
 * `recorded: false` — the processor gets its 200, the church's total stays
 * right, and nothing is written.
 */
export async function recordIncoming(incoming: IncomingGift): Promise<RecordOutcome> {
  const existing = await prisma.gift.findUnique({
    where: { externalId: incoming.externalId },
    select: { id: true },
  });
  if (existing) return { recorded: false, giftId: existing.id };

  const [fundId, who] = await Promise.all([
    fundBySlug(incoming.fundSlug),
    giverFromEmail(incoming.email),
  ]);

  try {
    const gift = await prisma.gift.create({
      data: {
        amount: incoming.amount,
        currency: incoming.currency,
        fundId,
        source: "ONLINE",
        externalId: incoming.externalId,
        givenAt: incoming.givenAt,
        message: incoming.message,
        ...who,
      },
      select: { id: true },
    });
    return { recorded: true, giftId: gift.id };
  } catch (error) {
    // Two deliveries arriving together: the index decides, and the loser
    // reports the winner's row rather than failing the webhook.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const now = await prisma.gift.findUnique({
        where: { externalId: incoming.externalId },
        select: { id: true },
      });
      if (now) return { recorded: false, giftId: now.id };
    }
    throw error;
  }
}

/**
 * Marks a gift refunded.
 *
 * Kept rather than deleted: the accounts have to show that money arrived and
 * went back. Every total excludes it — see `counted` in the rules.
 */
export async function markRefunded(externalId: string): Promise<boolean> {
  const { count } = await prisma.gift.updateMany({
    where: { externalId, status: "SETTLED" },
    data: { status: "REFUNDED" },
  });
  return count > 0;
}

/** A gift somebody counted by hand — cash in an envelope, a cheque, a transfer. */
export async function recordManualGift(input: {
  amount: number;
  currency?: string;
  fundId: string;
  source: GiftSource;
  givenAt: Date;
  giverId?: string | null;
  note?: string | null;
  byEmail: string;
}) {
  if (!Number.isInteger(input.amount) || input.amount <= 0) {
    throw new ApiError(400, "bad_amount", "Give an amount in pounds and pence.");
  }
  const household = input.giverId
    ? (await prisma.person.findUnique({ where: { id: input.giverId }, select: { householdId: true } }))?.householdId
    : null;

  return prisma.gift.create({
    data: {
      amount: input.amount,
      currency: (input.currency ?? "GBP").toUpperCase(),
      fundId: input.fundId,
      source: input.source,
      givenAt: input.givenAt,
      giverId: input.giverId ?? null,
      householdId: household ?? null,
      note: input.note?.trim() || null,
      recordedByEmail: input.byEmail,
    },
    select: giftSelect,
  });
}

/** Attaches a gift that arrived anonymously to whoever turns out to have given it. */
export async function attributeGift(giftId: string, giverId: string | null) {
  const household = giverId
    ? (await prisma.person.findUnique({ where: { id: giverId }, select: { householdId: true } }))?.householdId
    : null;
  return prisma.gift.update({
    where: { id: giftId },
    data: { giverId, householdId: household ?? null },
    select: giftSelect,
  });
}

export async function listGifts(input: { from?: Date; to?: Date; fundId?: string; take?: number } = {}) {
  const rows = await prisma.gift.findMany({
    where: {
      ...(input.from || input.to
        ? { givenAt: { ...(input.from ? { gte: input.from } : {}), ...(input.to ? { lt: input.to } : {}) } }
        : {}),
      ...(input.fundId ? { fundId: input.fundId } : {}),
    },
    select: {
      ...giftSelect,
      fund: { select: { name: true } },
      giver: { select: { id: true, displayName: true } },
    },
    orderBy: { givenAt: "desc" },
    take: Math.min(input.take ?? 200, 500),
  });
  return rows.map((row) => ({ ...row, givenAt: row.givenAt.toISOString() }));
}

/** What a period brought in, by fund — the reconciliation view. */
export async function summary(from: Date, to: Date) {
  const [gifts, funds] = await Promise.all([
    prisma.gift.findMany({ where: { givenAt: { gte: from, lt: to } }, select: giftSelect }),
    listFunds(),
  ]);
  return {
    from: from.toISOString(),
    to: to.toISOString(),
    total: totalOf(gifts as GiftRow[]),
    funds: byFund(gifts as GiftRow[], funds as FundRow[]),
    gifts: gifts.length,
  };
}

/** Every household's statement for a tax year, for the office to send out. */
export async function statements(taxYear: number, startMonth = 4, startDay = 6): Promise<Statement[]> {
  const { from, to } = taxYearRange(taxYear, startMonth, startDay);
  const [gifts, funds, households] = await Promise.all([
    prisma.gift.findMany({
      where: { givenAt: { gte: from, lt: to }, householdId: { not: null } },
      select: giftSelect,
    }),
    listFunds(),
    prisma.household.findMany({ select: { id: true, name: true } }),
  ]);

  const giving = new Set(gifts.map((gift) => gift.householdId));
  return households
    .filter((household) => giving.has(household.id))
    .map((household) =>
      statementFor({
        householdId: household.id,
        householdName: household.name,
        taxYear,
        gifts: gifts as GiftRow[],
        funds: funds as FundRow[],
        startMonth,
        startDay,
      }),
    )
    .sort((a, b) => b.total - a.total || a.householdName.localeCompare(b.householdName));
}

/**
 * A member's own giving — theirs and their household's, nobody else's.
 *
 * Resolved from the account to a person to a household, so there is no id to
 * change: "show me my giving" cannot be turned into "show me theirs".
 */
export async function myGiving(user: User, taxYear?: number) {
  const person = await prisma.person.findUnique({
    where: { userId: user.id },
    select: { id: true, householdId: true, household: { select: { id: true, name: true } } },
  });
  if (!person) return null;

  const year = taxYear ?? taxYearOf(new Date());
  const { from, to } = taxYearRange(year);
  const [gifts, funds] = await Promise.all([
    prisma.gift.findMany({
      where: {
        givenAt: { gte: from, lt: to },
        ...(person.householdId ? { householdId: person.householdId } : { giverId: person.id }),
      },
      select: giftSelect,
    }),
    listFunds(),
  ]);

  return statementFor({
    householdId: person.householdId ?? person.id,
    householdName: person.household?.name ?? "Your giving",
    taxYear: year,
    gifts: (gifts as GiftRow[]).map((gift) => ({
      ...gift,
      householdId: person.householdId ?? person.id,
    })),
    funds: funds as FundRow[],
  });
}
