import { Prisma, type PledgeSchedule, type User } from "@prisma/client";
import { ApiError } from "@/lib/api-guard";
import { fromIsoDate, toIsoDate, todayIso, type IsoDate } from "@/lib/dates";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/current-user";
import { hasCapability } from "@/lib/permissions";
import {
  checkPledge,
  fallingBehind,
  progressOf,
  publicSummary,
  receivedFrom,
  summarise,
  visiblePledges,
  type Campaign,
  type GiftForCampaign,
  type PledgeRow,
} from "@/lib/pledges";

/**
 * Campaigns and pledges, against the database.
 *
 * The rules are in `pledges.ts`. What this file is responsible for is the one
 * thing the rules cannot enforce: **who gets which numbers.**
 *
 * `campaignView` is for the treasurer and carries everything. `publicView`
 * builds a different object from the ground up rather than deleting fields
 * from the first — so a field added to the summary later is absent from the
 * public one until somebody decides otherwise, instead of leaking the day it
 * is added. A member asking about their own pledge gets `myPledge`, which
 * knows nothing about anybody else's.
 */

export async function requirePledgeAccess(): Promise<User> {
  const user = await getCurrentUser();
  if (!user || !(await hasCapability(user, "manage_giving"))) {
    throw new ApiError(404, "not_found", "Not found");
  }
  return user;
}

const campaignSelect = {
  id: true,
  name: true,
  slug: true,
  description: true,
  target: true,
  fundId: true,
  startsOn: true,
  endsOn: true,
  publicTotals: true,
  closed: true,
} as const;

function asCampaign(row: {
  id: string;
  name: string;
  fundId: string;
  target: number | null;
  startsOn: Date;
  endsOn: Date | null;
  closed: boolean;
}): Campaign {
  return {
    id: row.id,
    name: row.name,
    fundId: row.fundId,
    target: row.target,
    startsOn: toIsoDate(row.startsOn),
    endsOn: row.endsOn ? toIsoDate(row.endsOn) : null,
    closed: row.closed,
  };
}

function asPledge(row: {
  id: string;
  campaignId: string;
  householdId: string | null;
  personId: string | null;
  amount: number;
  schedule: PledgeSchedule;
  startsOn: Date;
  endsOn: Date | null;
  status: PledgeRow["status"];
  nameMayBeShown: boolean;
}): PledgeRow {
  return {
    ...row,
    startsOn: toIsoDate(row.startsOn),
    endsOn: row.endsOn ? toIsoDate(row.endsOn) : null,
  };
}

const pledgeSelect = {
  id: true,
  campaignId: true,
  householdId: true,
  personId: true,
  amount: true,
  schedule: true,
  startsOn: true,
  endsOn: true,
  status: true,
  nameMayBeShown: true,
  note: true,
  household: { select: { id: true, name: true } },
  person: { select: { id: true, displayName: true } },
} as const;

/**
 * The gifts a campaign needs, which is every settled gift to its fund in its
 * span — not only the ones from people who pledged.
 */
async function giftsFor(campaign: Campaign): Promise<GiftForCampaign[]> {
  const rows = await prisma.gift.findMany({
    where: {
      fundId: campaign.fundId,
      givenAt: {
        gte: fromIsoDate(campaign.startsOn),
        ...(campaign.endsOn ? { lte: fromIsoDate(campaign.endsOn) } : {}),
      },
    },
    select: { amount: true, fundId: true, givenAt: true, householdId: true, giverId: true, status: true },
  });
  return rows.map((row) => ({ ...row, givenAt: toIsoDate(row.givenAt), status: String(row.status) }));
}

export async function listCampaigns(includeClosed = true) {
  const rows = await prisma.givingCampaign.findMany({
    where: includeClosed ? {} : { closed: false },
    orderBy: [{ closed: "asc" }, { startsOn: "desc" }],
    select: { ...campaignSelect, _count: { select: { pledges: true } } },
  });
  return rows;
}

export type CampaignInput = {
  name: string;
  slug: string;
  description?: string | null;
  target: number | null;
  fundId: string;
  startsOn: IsoDate;
  endsOn: IsoDate | null;
  publicTotals: boolean;
};

export async function createCampaign(input: CampaignInput, by: User) {
  if (input.target !== null && (!Number.isInteger(input.target) || input.target <= 0)) {
    throw new ApiError(400, "bad_target", "A target is a whole number of pence, or nothing at all.");
  }
  if (input.endsOn && input.endsOn < input.startsOn) {
    throw new ApiError(400, "bad_span", "It can't end before it starts.");
  }
  const fund = await prisma.givingFund.findUnique({ where: { id: input.fundId }, select: { id: true } });
  if (!fund) throw new ApiError(404, "not_found", "Not found");

  try {
    return await prisma.givingCampaign.create({
      data: {
        name: input.name.trim(),
        slug: input.slug.trim(),
        description: input.description?.trim() || null,
        target: input.target,
        fundId: input.fundId,
        startsOn: fromIsoDate(input.startsOn),
        endsOn: input.endsOn ? fromIsoDate(input.endsOn) : null,
        publicTotals: input.publicTotals,
        createdByEmail: by.email,
      },
      select: { id: true },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new ApiError(409, "slug_taken", "A campaign already uses that address.");
    }
    throw error;
  }
}

export async function updateCampaign(
  id: string,
  input: Partial<Pick<CampaignInput, "name" | "description" | "target" | "endsOn" | "publicTotals">> & {
    closed?: boolean;
  },
) {
  const existing = await prisma.givingCampaign.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw new ApiError(404, "not_found", "Not found");

  return prisma.givingCampaign.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.description !== undefined ? { description: input.description?.trim() || null } : {}),
      ...(input.target !== undefined ? { target: input.target } : {}),
      ...(input.endsOn !== undefined ? { endsOn: input.endsOn ? fromIsoDate(input.endsOn) : null } : {}),
      ...(input.publicTotals !== undefined ? { publicTotals: input.publicTotals } : {}),
      ...(input.closed !== undefined ? { closed: input.closed } : {}),
    },
    select: { id: true },
  });
}

export type PledgeInput = {
  campaignId: string;
  householdId: string | null;
  personId: string | null;
  amount: number;
  schedule: PledgeSchedule;
  startsOn: IsoDate;
  endsOn: IsoDate | null;
  note?: string | null;
  nameMayBeShown: boolean;
};

/**
 * Records a promise, or amends one already made.
 *
 * Upserted on (campaign, household): a second pledge to the same appeal from
 * the same family is a change of mind, and adding it to the first would double
 * what the church believes it has been promised — which is the error this
 * whole feature exists to prevent.
 */
export async function recordPledge(input: PledgeInput, by: User) {
  const sane = checkPledge(input);
  if (!sane.ok) throw new ApiError(400, "bad_pledge", sane.reason);
  if (!input.householdId && !input.personId) {
    throw new ApiError(400, "needs_a_giver", "Say whose pledge this is.");
  }

  const campaign = await prisma.givingCampaign.findUnique({
    where: { id: input.campaignId },
    select: { id: true, closed: true },
  });
  if (!campaign) throw new ApiError(404, "not_found", "Not found");
  if (campaign.closed) throw new ApiError(409, "closed", "That campaign is closed.");

  const data = {
    amount: input.amount,
    schedule: input.schedule,
    startsOn: fromIsoDate(input.startsOn),
    endsOn: input.endsOn ? fromIsoDate(input.endsOn) : null,
    note: input.note?.trim() || null,
    nameMayBeShown: input.nameMayBeShown,
    recordedByEmail: by.email,
  };

  // The unique index only covers a household pledge — a personal one has a
  // null household, and Postgres does not constrain nulls — so the personal
  // case is matched by hand.
  if (!input.householdId) {
    const existing = await prisma.pledge.findFirst({
      where: { campaignId: input.campaignId, personId: input.personId },
      select: { id: true },
    });
    if (existing) {
      return prisma.pledge.update({ where: { id: existing.id }, data, select: { id: true } });
    }
    return prisma.pledge.create({
      data: { campaignId: input.campaignId, personId: input.personId, ...data },
      select: { id: true },
    });
  }

  return prisma.pledge.upsert({
    where: { campaignId_householdId: { campaignId: input.campaignId, householdId: input.householdId } },
    create: {
      campaignId: input.campaignId,
      householdId: input.householdId,
      personId: input.personId,
      ...data,
    },
    update: data,
    select: { id: true },
  });
}

/**
 * Cancels a pledge.
 *
 * Kept and flagged rather than deleted: a campaign's history is the pledges it
 * had, not only the ones that worked out, and a promise that was withdrawn is
 * a different fact from one never made.
 */
export async function cancelPledge(id: string) {
  const { count } = await prisma.pledge.updateMany({
    where: { id, status: { not: "CANCELLED" } },
    data: { status: "CANCELLED" },
  });
  if (count === 0) throw new ApiError(409, "already_cancelled", "That's already been cancelled.");
}

/** The treasurer's view of one campaign: everything, per pledge. */
export async function campaignView(slug: string, today: IsoDate = todayIso()) {
  const row = await prisma.givingCampaign.findUnique({ where: { slug }, select: campaignSelect });
  if (!row) throw new ApiError(404, "not_found", "Not found");

  const campaign = asCampaign(row);
  const [rawPledges, gifts] = await Promise.all([
    prisma.pledge.findMany({ where: { campaignId: row.id }, select: pledgeSelect }),
    giftsFor(campaign),
  ]);

  const pledges = rawPledges.map((pledge) => {
    const parsed = asPledge(pledge);
    const received = receivedFrom(gifts, campaign, parsed);
    return {
      ...parsed,
      note: pledge.note,
      who: pledge.household?.name ?? pledge.person?.displayName ?? "Unattached",
      progress: progressOf(parsed, received, today),
    };
  });

  return {
    campaign: { ...row, startsOn: campaign.startsOn, endsOn: campaign.endsOn },
    summary: summarise({ campaign, pledges: rawPledges.map(asPledge), gifts, today }),
    pledges,
    behind: fallingBehind(
      rawPledges.map((pledge) => {
        const parsed = asPledge(pledge);
        return { pledge: parsed, received: receivedFrom(gifts, campaign, parsed) };
      }),
      today,
    ).map((row) => ({ ...row, pledgeId: row.pledge.id })),
  };
}

/**
 * What anybody may see about a campaign whose totals are public.
 *
 * Built field by field from `publicSummary` rather than by removing things, so
 * the day somebody adds a figure to the treasurer's summary it does not appear
 * here by accident. Refuses outright when the campaign has not been published.
 */
export async function publicView(slug: string, today: IsoDate = todayIso()) {
  const row = await prisma.givingCampaign.findUnique({ where: { slug }, select: campaignSelect });
  if (!row || !row.publicTotals || row.closed) throw new ApiError(404, "not_found", "Not found");

  const campaign = asCampaign(row);
  const [pledges, gifts] = await Promise.all([
    prisma.pledge.findMany({ where: { campaignId: row.id }, select: pledgeSelect }),
    giftsFor(campaign),
  ]);

  return {
    name: row.name,
    description: row.description,
    ...publicSummary(summarise({ campaign, pledges: pledges.map(asPledge), gifts, today })),
  };
}

/**
 * One member's own pledge, and how it is going.
 *
 * Goes through `visiblePledges` rather than querying by household directly —
 * the rule about who may see what lives in one place, and a query that encoded
 * it again is a second copy to keep in step.
 */
export async function myPledge(
  slug: string,
  viewer: { householdId: string | null; personId: string | null },
  today: IsoDate = todayIso(),
) {
  const row = await prisma.givingCampaign.findUnique({ where: { slug }, select: campaignSelect });
  if (!row) throw new ApiError(404, "not_found", "Not found");

  const campaign = asCampaign(row);
  const [all, gifts] = await Promise.all([
    prisma.pledge.findMany({ where: { campaignId: row.id }, select: pledgeSelect }),
    giftsFor(campaign),
  ]);

  const mine = visiblePledges(all.map(asPledge), { manages: false, ...viewer });
  if (mine.length === 0) return { campaign: row.name, pledge: null };

  const pledge = mine[0];
  return {
    campaign: row.name,
    pledge: {
      amount: pledge.amount,
      schedule: pledge.schedule,
      startsOn: pledge.startsOn,
      endsOn: pledge.endsOn,
      status: pledge.status,
      progress: progressOf(pledge, receivedFrom(gifts, campaign, pledge), today),
    },
  };
}
