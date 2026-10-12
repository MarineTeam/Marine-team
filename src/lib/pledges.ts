import type { PledgeSchedule, PledgeStatus } from "@prisma/client";
import { compareIsoDates, type IsoDate } from "@/lib/dates";

/**
 * Pledges and campaigns — the rules, with no database near them.
 *
 * Giving records what arrived. It cannot answer "we asked for £400,000, where
 * are we?", which is the question a building appeal is actually run on.
 *
 * Four decisions run through this file, and the first is the one that matters
 * more than the rest put together.
 *
 *   1. **A pledge is not income.** Target, pledged and received are three
 *      different numbers and nothing here ever adds a pledge to a giving
 *      total. A church that mistakes £400,000 pledged for £400,000 received
 *      signs a contract it cannot pay for, and the way that mistake gets made
 *      is a screen showing one figure. Every summary this file produces
 *      carries all three.
 *   2. **Unpledged giving counts.** Most people give to an appeal without ever
 *      filling in a card, so a campaign's received total is *all* the money to
 *      its fund in its dates — not the sum of what pledgers managed. The two
 *      are different numbers and both are worth seeing.
 *   3. **Over-giving is not an error.** Somebody who promised £500 and gave
 *      £700 has given £700. The progress bar stops at full; the amount does
 *      not, and the extra is never quietly discarded.
 *   4. **"Behind" is arithmetic, not a judgement.** It compares what has
 *      arrived against the instalments due by today, and it is reported as a
 *      figure for somebody to look at — never as a status the system sets on
 *      its own. A person three weeks late may have been in hospital.
 */

export type Campaign = {
  id: string;
  name: string;
  fundId: string;
  target: number | null;
  startsOn: IsoDate;
  endsOn: IsoDate | null;
  closed: boolean;
};

export type PledgeRow = {
  id: string;
  campaignId: string;
  householdId: string | null;
  personId: string | null;
  amount: number;
  schedule: PledgeSchedule;
  startsOn: IsoDate;
  endsOn: IsoDate | null;
  status: PledgeStatus;
  nameMayBeShown: boolean;
};

/** A gift, reduced to what a campaign needs to know about it. */
export type GiftForCampaign = {
  amount: number;
  fundId: string;
  givenAt: IsoDate;
  householdId: string | null;
  giverId: string | null;
  status: string;
};

/**
 * Whether a gift counts toward a campaign.
 *
 * To the campaign's fund, inside its dates, and settled. A refunded gift is
 * excluded for the same reason it is excluded from a statement: the money went
 * back, and an appeal total that counts it is a total that disagrees with the
 * bank.
 */
export function countsToward(gift: GiftForCampaign, campaign: Campaign): boolean {
  if (gift.status !== "SETTLED") return false;
  if (gift.fundId !== campaign.fundId) return false;
  if (compareIsoDates(gift.givenAt, campaign.startsOn) < 0) return false;
  if (campaign.endsOn && compareIsoDates(gift.givenAt, campaign.endsOn) > 0) return false;
  return true;
}

/** Everything received toward a campaign, pledged or not. */
export function receivedTotal(gifts: readonly GiftForCampaign[], campaign: Campaign): number {
  return gifts
    .filter((gift) => countsToward(gift, campaign))
    .reduce((sum, gift) => sum + gift.amount, 0);
}

/** What a particular giver has put toward it. */
export function receivedFrom(
  gifts: readonly GiftForCampaign[],
  campaign: Campaign,
  who: { householdId: string | null; personId: string | null },
): number {
  return gifts
    .filter((gift) => {
      if (!countsToward(gift, campaign)) return false;
      // Household first, because that is how giving is attributed and how a
      // family decides. A pledge with no household falls back to the person.
      if (who.householdId) return gift.householdId === who.householdId;
      if (who.personId) return gift.giverId === who.personId;
      return false;
    })
    .reduce((sum, gift) => sum + gift.amount, 0);
}

/** How many instalments a schedule puts in a year. Null for a one-off. */
export function instalmentsPerYear(schedule: PledgeSchedule): number | null {
  switch (schedule) {
    case "ONE_OFF":
      return null;
    case "WEEKLY":
      return 52;
    case "MONTHLY":
      return 12;
    case "QUARTERLY":
      return 4;
    case "ANNUAL":
      return 1;
  }
}

/** Whole months from one date to another, ignoring the day of the month. */
function monthsBetween(from: IsoDate, to: IsoDate): number {
  const [fy, fm] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  return (ty - fy) * 12 + (tm - fm);
}

/**
 * How many instalments have fallen due by a given day.
 *
 * An instalment falls due **on** its date, so a monthly pledge starting
 * 1 January has three due by 15 March — January's, February's and March's. The
 * other reading (completed months) is defensible and wrong for this purpose: a
 * treasurer asking "has March been paid?" in March wants March counted.
 *
 * Capped at the number the pledge actually contains, so a finished promise does
 * not accumulate phantom arrears for ever.
 */
export function instalmentsDue(pledge: PledgeRow, today: IsoDate): number {
  if (pledge.schedule === "ONE_OFF") {
    return compareIsoDates(today, pledge.startsOn) >= 0 ? 1 : 0;
  }
  if (compareIsoDates(today, pledge.startsOn) < 0) return 0;

  const perYear = instalmentsPerYear(pledge.schedule) ?? 1;
  const elapsed =
    pledge.schedule === "WEEKLY"
      ? Math.floor(
          (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${pledge.startsOn}T00:00:00Z`)) /
            (7 * 86_400_000),
        )
      : Math.floor((monthsBetween(pledge.startsOn, today) * perYear) / 12);

  const due = elapsed + 1;
  const total = totalInstalments(pledge);
  return total === null ? due : Math.min(due, total);
}

/**
 * How many instalments the pledge contains in total, or null when open-ended.
 *
 * Without an end date a recurring pledge has no fixed count — which is a real
 * thing somebody promises ("£20 a month until the roof is done") and is why
 * this is nullable rather than guessed at.
 */
export function totalInstalments(pledge: PledgeRow): number | null {
  if (pledge.schedule === "ONE_OFF") return 1;
  if (!pledge.endsOn) return null;

  const perYear = instalmentsPerYear(pledge.schedule) ?? 1;
  if (pledge.schedule === "WEEKLY") {
    const weeks = Math.floor(
      (Date.parse(`${pledge.endsOn}T00:00:00Z`) - Date.parse(`${pledge.startsOn}T00:00:00Z`)) /
        (7 * 86_400_000),
    );
    return Math.max(1, weeks + 1);
  }
  return Math.max(1, Math.floor((monthsBetween(pledge.startsOn, pledge.endsOn) * perYear) / 12) + 1);
}

/**
 * What should have arrived by today, if the promise is being kept to schedule.
 *
 * Never more than the whole pledge. Rounded down per instalment and then
 * capped, so the last instalment absorbs the rounding rather than the giver
 * appearing a few pence short at the end of two years.
 */
export function expectedBy(pledge: PledgeRow, today: IsoDate): number {
  const total = totalInstalments(pledge);
  const due = instalmentsDue(pledge, today);
  if (due <= 0) return 0;
  if (total === null) return pledge.amount;
  if (due >= total) return pledge.amount;
  // No cap needed here: the line above returns early whenever `due` has
  // reached `total`, so past it `due < total` and the share is always less
  // than the whole. A `Math.min` was here and a mutation test showed it could
  // never bite — dead defence reads as a check that is actually happening.
  return Math.floor((pledge.amount * due) / total);
}

export type PledgeProgress = {
  pledged: number;
  received: number;
  /** What should have arrived by now on this schedule. */
  expected: number;
  /** Negative when behind. Positive when ahead. */
  aheadBy: number;
  /** 0–1, capped — see the file comment on over-giving. */
  fraction: number;
  fulfilled: boolean;
};

/**
 * One pledge against what has actually arrived.
 *
 * `fraction` is capped at 1 so a progress bar cannot overflow; `received` is
 * not, so the figure beside it stays true. Both are returned because a screen
 * that only has the capped one cannot tell generous from exact.
 */
export function progressOf(pledge: PledgeRow, received: number, today: IsoDate): PledgeProgress {
  const expected = expectedBy(pledge, today);
  return {
    pledged: pledge.amount,
    received,
    expected,
    aheadBy: received - expected,
    fraction: pledge.amount <= 0 ? 0 : Math.min(1, received / pledge.amount),
    fulfilled: received >= pledge.amount,
  };
}

export type CampaignSummary = {
  /** What was asked for. Null when the campaign names no figure. */
  target: number | null;
  /** What people have promised. **Not money.** */
  pledged: number;
  /** What has actually arrived — including from people who never pledged. */
  received: number;
  /** Of the received, how much came from somebody with a pledge. */
  receivedFromPledgers: number;
  /** Promises still outstanding: pledged minus what pledgers have given. */
  outstanding: number;
  pledgeCount: number;
  /** Against the target, capped. Null when there is no target to measure. */
  fractionOfTarget: number | null;
};

/**
 * A campaign in the three numbers it must always be reported in.
 *
 * `outstanding` is the one a treasurer plans with: what has been promised and
 * has not yet arrived, floored at zero so a campaign where pledgers gave extra
 * does not report a negative debt back to itself.
 */
export function summarise(input: {
  campaign: Campaign;
  pledges: readonly PledgeRow[];
  gifts: readonly GiftForCampaign[];
  today: IsoDate;
}): CampaignSummary {
  const live = input.pledges.filter((pledge) => pledge.status !== "CANCELLED");
  const pledged = live.reduce((sum, pledge) => sum + pledge.amount, 0);
  const received = receivedTotal(input.gifts, input.campaign);

  const receivedFromPledgers = live.reduce(
    (sum, pledge) => sum + receivedFrom(input.gifts, input.campaign, pledge),
    0,
  );

  return {
    target: input.campaign.target,
    pledged,
    received,
    receivedFromPledgers,
    outstanding: Math.max(0, pledged - receivedFromPledgers),
    pledgeCount: live.length,
    fractionOfTarget:
      input.campaign.target && input.campaign.target > 0
        ? Math.min(1, received / input.campaign.target)
        : null,
  };
}

/**
 * How a campaign reads in a sentence, for the people who will quote it.
 *
 * Deliberately says both figures in one breath. The sentence is the guard: it
 * is much harder to misquote "£120,000 received, £400,000 promised" than it is
 * to misread a single large number on a tile.
 */
export function describeProgress(
  summary: CampaignSummary,
  money: (minorUnits: number) => string,
): string {
  const parts = [`${money(summary.received)} received`];
  if (summary.pledged > 0) parts.push(`${money(summary.pledged)} promised`);
  if (summary.target !== null) parts.push(`of ${money(summary.target)} asked for`);
  return `${parts.join(", ")}.`;
}

export type Behind = { pledge: PledgeRow; behindBy: number; expected: number; received: number };

/**
 * Pledges with less in than the schedule expected, furthest behind first.
 *
 * Advisory and nothing more. Nothing in this file changes a pledge's status on
 * the strength of it: somebody three weeks late may have been in hospital, and
 * a system that writes people off on arithmetic is one a church stops using
 * the moment it does that to the wrong person.
 *
 * `tolerance` exists because a penny of rounding is not arrears.
 */
export function fallingBehind(
  entries: readonly { pledge: PledgeRow; received: number }[],
  today: IsoDate,
  tolerance = 100,
): Behind[] {
  return entries
    .filter((entry) => entry.pledge.status === "ACTIVE")
    .map((entry) => {
      const expected = expectedBy(entry.pledge, today);
      return {
        pledge: entry.pledge,
        expected,
        received: entry.received,
        behindBy: expected - entry.received,
      };
    })
    .filter((row) => row.behindBy > tolerance)
    .sort((a, b) => b.behindBy - a.behindBy);
}

/**
 * Whether a pledge makes sense before it is written.
 *
 * A recurring promise with no end date is allowed — "£20 a month until the
 * roof is done" is a real thing somebody says — but one that ends before it
 * starts is a typo, and a nought is somebody who meant to cancel.
 */
export function checkPledge(input: {
  amount: number;
  schedule: PledgeSchedule;
  startsOn: IsoDate;
  endsOn: IsoDate | null;
}): { ok: true } | { ok: false; reason: string } {
  if (!Number.isInteger(input.amount) || input.amount <= 0) {
    return { ok: false, reason: "A pledge is a whole number of pence, and more than nothing." };
  }
  if (input.endsOn && compareIsoDates(input.endsOn, input.startsOn) < 0) {
    return { ok: false, reason: "It can't end before it starts." };
  }
  if (input.schedule === "ONE_OFF" && input.endsOn) {
    return { ok: false, reason: "A one-off gift has no end date — it has a date." };
  }
  return { ok: true };
}

/**
 * The pledges a viewer may see, and in what detail.
 *
 * The office sees the list. Everybody else sees their own and nothing else —
 * an array of at most one, rather than a flag, so a page cannot total what it
 * was never handed. The same shape as the group rolls and the discussion
 * guides, for the same reason.
 *
 * `nameMayBeShown` governs an internal list of who has pledged, not this: even
 * a giver happy to be named does not have their *amount* shown to other
 * members.
 */
export function visiblePledges(
  pledges: readonly PledgeRow[],
  viewer: { manages: boolean; householdId: string | null; personId: string | null },
): PledgeRow[] {
  if (viewer.manages) return [...pledges];
  return pledges.filter(
    (pledge) =>
      (viewer.householdId !== null && pledge.householdId === viewer.householdId) ||
      (viewer.personId !== null && pledge.personId === viewer.personId),
  );
}

/**
 * What a campaign's totals look like to somebody who is not the treasurer.
 *
 * The church-wide figures stay; the per-pledge breakdown never leaves. Built by
 * picking fields out rather than deleting them, so a field added to
 * `CampaignSummary` later is absent here until somebody decides otherwise.
 */
export function publicSummary(summary: CampaignSummary): {
  target: number | null;
  received: number;
  fractionOfTarget: number | null;
} {
  return {
    target: summary.target,
    received: summary.received,
    fractionOfTarget: summary.fractionOfTarget,
  };
}
