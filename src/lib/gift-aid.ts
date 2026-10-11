import type { DeclarationMethod } from "@prisma/client";
import { addIsoDays, compareIsoDates, type IsoDate } from "@/lib/dates";

/**
 * Gift Aid — the rules, with no database near them.
 *
 * A UK church may reclaim the basic-rate tax on an eligible donation, which
 * adds 25% to it. The giving feature recorded everything needed for this except
 * the thing that actually decides it: `GivingFund.taxDeductible` says the
 * *fund* is eligible, and HMRC's requirement is a declaration from the
 * *individual*. A statement filtered on the fund alone overstates what can be
 * claimed, and on a church giving £200k a year the difference is tens of
 * thousands either left unclaimed or wrongly claimed.
 *
 * Four decisions run through this file, and three of them are the ones a
 * careless version gets wrong.
 *
 *   1. **A withdrawal is about the future.** Gifts given before it stay
 *      claimable. A withdrawal is not a statement that the donor never paid
 *      tax; treating it as retroactive would mean repaying claims that were
 *      correct when they were made.
 *   2. **A gift with no named giver cannot be claimed**, however eligible its
 *      fund. HMRC claims against a person. This is reported as a blocked
 *      reason rather than quietly dropped, because it is usually fixable —
 *      somebody knows who put the envelope in.
 *   3. **The claim rounds down.** 25% of an odd number of pence is not a whole
 *      number of pence, and rounding up claims money that is not owed.
 *   4. **Three conditions, not one**: a live declaration covering the day it
 *      was given, an eligible fund, and not already claimed. The last is what
 *      stops a second claim taking the same donation twice.
 *
 * What this file deliberately does not do is decide that something *is*
 * claimable in any legal sense. It reports what the church's own records
 * support, and the blocked list is the useful half — a list of people to ask.
 */

/** The basic rate as the fraction added to a donation: 20/80 = 25%. */
export const GIFT_AID_RATE_NUMERATOR = 20;
export const GIFT_AID_RATE_DENOMINATOR = 80;

/**
 * How far back a declaration's "covers past gifts" wording reaches.
 *
 * HMRC's standard form says four years. Expressed in days rather than years so
 * the arithmetic stays on `IsoDate` and a leap year cannot shift a boundary by
 * a day in the wrong direction.
 */
export const BACK_CLAIM_YEARS = 4;

/**
 * How far back the reconciliation screen looks by default.
 *
 * A tax year and a bit. Long enough that a treasurer opening it in April sees
 * the year they are about to claim for; short enough that the page is not
 * assessing a decade of gifts to answer "what can I claim now".
 */
export const DEFAULT_REVIEW_DAYS = 400;

export type Declaration = {
  id: string;
  personId: string;
  madeOn: IsoDate;
  coversPast: boolean;
  withdrawnOn: IsoDate | null;
  firstName: string;
  lastName: string;
  houseNumber: string;
  postcode: string;
  how: DeclarationMethod;
};

export type ClaimableGift = {
  id: string;
  amount: number;
  givenAt: IsoDate;
  fundId: string;
  giverId: string | null;
  giftAidClaimId: string | null;
  status: string;
};

/**
 * Shift an ISO date by whole years, clamping 29 February to the 28th.
 *
 * Years rather than days because the deadline is expressed in years and a
 * day-count drifts by one across a leap year — in a window where being a day
 * out is the difference between a claim and a refusal.
 */
function shiftYears(date: IsoDate, years: number): IsoDate {
  const [year, month, day] = date.split("-").map(Number);
  const target = year + years;
  const isLeap = (target % 4 === 0 && target % 100 !== 0) || target % 400 === 0;
  const safeDay = month === 2 && day === 29 && !isLeap ? 28 : day;
  return `${String(target).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(safeDay).padStart(2, "0")}`;
}

/** The day a gift's claim window shuts. */
export function claimDeadline(givenAt: IsoDate): IsoDate {
  return shiftYears(givenAt, BACK_CLAIM_YEARS);
}

/**
 * Whether a declaration covers a gift given on a particular day.
 *
 * The day a declaration is made counts, and so does the day it is withdrawn —
 * somebody who signs the form on Sunday morning and gives that morning is
 * covered, and the alternative is arguing with the paper in front of you.
 */
export function coversGift(declaration: Declaration, givenAt: IsoDate): boolean {
  if (declaration.withdrawnOn && compareIsoDates(givenAt, declaration.withdrawnOn) > 0) {
    return false;
  }
  if (compareIsoDates(givenAt, declaration.madeOn) >= 0) return true;
  // Earlier than the declaration: only with the back-dating wording, and only
  // as far back as that wording reaches.
  if (!declaration.coversPast) return false;
  return compareIsoDates(givenAt, shiftYears(declaration.madeOn, -BACK_CLAIM_YEARS)) >= 0;
}

/**
 * The declaration that speaks for a gift, of the several a person may have.
 *
 * A church that re-papers its declarations every few years has people with
 * three on file. Any one that covers the day is enough, and the most recently
 * made of those is the one to cite on a claim.
 */
export function declarationFor(
  declarations: readonly Declaration[],
  personId: string,
  givenAt: IsoDate,
): Declaration | null {
  const covering = declarations.filter(
    (declaration) => declaration.personId === personId && coversGift(declaration, givenAt),
  );
  if (covering.length === 0) return null;
  return covering.reduce((best, row) => (compareIsoDates(row.madeOn, best.madeOn) > 0 ? row : best));
}

export type BlockReason =
  | "no-giver"
  | "no-declaration"
  | "fund-not-eligible"
  | "already-claimed"
  | "refunded"
  | "too-old";

/** What each blocked reason reads as, and whether anybody can do something. */
export const BLOCK_REASONS: Record<BlockReason, { label: string; fixable: boolean }> = {
  "no-giver": { label: "nobody is named as the giver", fixable: true },
  "no-declaration": { label: "no Gift Aid declaration on file", fixable: true },
  "fund-not-eligible": { label: "the fund isn't eligible", fixable: false },
  "already-claimed": { label: "already claimed", fixable: false },
  refunded: { label: "refunded", fixable: false },
  "too-old": { label: "past the four-year deadline", fixable: false },
};

/**
 * The deadline. A claim must reach HMRC within four years of the end of the
 * tax year the gift fell in.
 *
 * Approximated to four years from the gift itself, which is the *conservative*
 * direction: it writes a gift off up to a year early rather than encouraging a
 * claim that would be refused. A church that wants the last months of that
 * window should be looking at the expiring list, which is why there is one.
 */
export function isTooOld(givenAt: IsoDate, today: IsoDate): boolean {
  return compareIsoDates(givenAt, shiftYears(today, -BACK_CLAIM_YEARS)) < 0;
}

export type Assessed = {
  gift: ClaimableGift;
  claimable: boolean;
  reason: BlockReason | null;
  declaration: Declaration | null;
};

/**
 * Every gift, with whether it can be claimed and why not.
 *
 * Returns all of them rather than only the claimable ones: the blocked list is
 * the half a church acts on, and a function that filtered it out would make the
 * reconciliation view impossible to build from the same pass.
 *
 * The order of the checks is the order a person would explain them in, and the
 * first failure is the one reported — "nobody is named as the giver" is more
 * useful than "no declaration" for a gift that has neither.
 */
export function assess(input: {
  gifts: readonly ClaimableGift[];
  declarations: readonly Declaration[];
  eligibleFundIds: readonly string[];
  today: IsoDate;
}): Assessed[] {
  const eligible = new Set(input.eligibleFundIds);

  return input.gifts.map((gift) => {
    const blocked = (reason: BlockReason): Assessed => ({ gift, claimable: false, reason, declaration: null });

    if (gift.status !== "SETTLED") return blocked("refunded");
    if (gift.giftAidClaimId !== null) return blocked("already-claimed");
    if (!eligible.has(gift.fundId)) return blocked("fund-not-eligible");
    if (!gift.giverId) return blocked("no-giver");
    if (isTooOld(gift.givenAt, input.today)) return blocked("too-old");

    const declaration = declarationFor(input.declarations, gift.giverId, gift.givenAt);
    if (!declaration) return blocked("no-declaration");

    return { gift, claimable: true, reason: null, declaration };
  });
}

/**
 * What a claim is worth, in minor units.
 *
 * Computed on the total rather than per gift, and floored. Per-gift rounding
 * would lose a fraction of a penny on every donation and arrive at a figure
 * that disagrees with HMRC's own arithmetic; rounding up would claim money that
 * is not owed.
 */
export function claimValue(donationTotal: number): number {
  return Math.floor((donationTotal * GIFT_AID_RATE_NUMERATOR) / GIFT_AID_RATE_DENOMINATOR);
}

export type ClaimSummary = {
  giftCount: number;
  donationTotal: number;
  claimTotal: number;
};

export function summariseClaim(assessed: readonly Assessed[]): ClaimSummary {
  const claimable = assessed.filter((row) => row.claimable);
  const donationTotal = claimable.reduce((sum, row) => sum + row.gift.amount, 0);
  return { giftCount: claimable.length, donationTotal, claimTotal: claimValue(donationTotal) };
}

export type BlockedGroup = {
  reason: BlockReason;
  label: string;
  fixable: boolean;
  gifts: number;
  amount: number;
  /** What claiming it would be worth, so the list is ordered by what it costs. */
  worth: number;
};

/**
 * What is being left behind, grouped by why, biggest first.
 *
 * Ordered by what it is *worth* rather than by how many gifts: a list that puts
 * forty £2 collections above one £5,000 gift with no declaration is a list that
 * sends somebody after the wrong thing.
 */
export function blockedSummary(assessed: readonly Assessed[]): BlockedGroup[] {
  const groups = new Map<BlockReason, { gifts: number; amount: number }>();

  for (const row of assessed) {
    if (row.claimable || !row.reason) continue;
    const running = groups.get(row.reason) ?? { gifts: 0, amount: 0 };
    groups.set(row.reason, { gifts: running.gifts + 1, amount: running.amount + row.gift.amount });
  }

  return [...groups.entries()]
    .map(([reason, totals]) => ({
      reason,
      label: BLOCK_REASONS[reason].label,
      fixable: BLOCK_REASONS[reason].fixable,
      gifts: totals.gifts,
      amount: totals.amount,
      worth: claimValue(totals.amount),
    }))
    .sort((a, b) => b.worth - a.worth || a.label.localeCompare(b.label));
}

/**
 * Claimable money running out of time, soonest first.
 *
 * The one number on the whole screen that is urgent: a donation that passes the
 * deadline is money the church was owed and cannot now ask for.
 */
export function expiringSoon(
  assessed: readonly Assessed[],
  today: IsoDate,
  withinDays = 180,
): { giftId: string; givenAt: IsoDate; amount: number; deadline: IsoDate }[] {
  return assessed
    .filter((row) => row.claimable)
    .map((row) => ({
      giftId: row.gift.id,
      givenAt: row.gift.givenAt,
      amount: row.gift.amount,
      deadline: claimDeadline(row.gift.givenAt),
    }))
    .filter((row) => compareIsoDates(row.deadline, addIsoDays(today, withinDays)) <= 0)
    .sort((a, b) => compareIsoDates(a.deadline, b.deadline));
}

export type ScheduleRow = {
  title: string;
  firstName: string;
  lastName: string;
  houseNumber: string;
  postcode: string;
  /** HMRC wants one date per donor line, and uses the last gift in the span. */
  donationDate: IsoDate;
  /** Major units with two decimals — the only place money leaves as a string. */
  amount: string;
};

/**
 * The claim schedule, one line per donor.
 *
 * HMRC's spreadsheet takes a line per donor with their aggregated total, not a
 * line per donation. Aggregating here rather than in the view means the figure
 * the church sends and the figure it sees are the same arithmetic.
 *
 * The amount is formatted to two decimal places from integer pence at the last
 * possible moment. It is the only point in the feature where money becomes a
 * string, and it happens on the way out of the door.
 */
export function claimSchedule(assessed: readonly Assessed[]): ScheduleRow[] {
  const byDonor = new Map<string, { declaration: Declaration; amount: number; latest: IsoDate }>();

  for (const row of assessed) {
    if (!row.claimable || !row.declaration) continue;
    const key = row.declaration.personId;
    const running = byDonor.get(key);
    if (!running) {
      byDonor.set(key, {
        declaration: row.declaration,
        amount: row.gift.amount,
        latest: row.gift.givenAt,
      });
      continue;
    }
    running.amount += row.gift.amount;
    if (compareIsoDates(row.gift.givenAt, running.latest) > 0) running.latest = row.gift.givenAt;
  }

  return [...byDonor.values()]
    .map(({ declaration, amount, latest }) => ({
      title: "",
      firstName: declaration.firstName,
      lastName: declaration.lastName,
      houseNumber: declaration.houseNumber,
      postcode: declaration.postcode,
      donationDate: latest,
      amount: (amount / 100).toFixed(2),
    }))
    .sort((a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName));
}

/**
 * Whether a declaration has what HMRC's schedule needs.
 *
 * Checked when it is entered rather than when a claim is built, because the
 * person who can fix a missing postcode is the one typing the form, and a claim
 * that falls over on the last step is a claim nobody attempts again.
 */
export function declarationIsComplete(input: {
  firstName: string;
  lastName: string;
  houseNumber: string;
  postcode: string;
}): { ok: true } | { ok: false; missing: string[] } {
  const missing: string[] = [];
  if (!input.firstName.trim()) missing.push("a forename");
  if (!input.lastName.trim()) missing.push("a surname");
  if (!input.houseNumber.trim()) missing.push("a house name or number");
  // Deliberately not a full UK postcode regex. The format has enough real
  // exceptions (BFPO, Gibraltar, overseas donors) that a strict pattern
  // refuses genuine declarations, and HMRC will say so far more cheaply than
  // this app guessing.
  if (!input.postcode.trim()) missing.push("a postcode");
  return missing.length === 0 ? { ok: true } : { ok: false, missing };
}

/** Declarations still owed a written confirmation: the verbal ones. */
export function needsWrittenConfirmation(declarations: readonly Declaration[]): Declaration[] {
  return declarations.filter(
    (declaration) => declaration.how === "VERBAL" && declaration.withdrawnOn === null,
  );
}
