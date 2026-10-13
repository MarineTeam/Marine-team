import type { MembershipChange } from "@prisma/client";
import { compareIsoDates, type IsoDate } from "@/lib/dates";

/**
 * The membership roll — the rules, with no database near them.
 *
 * A church keeps a roll because somebody asks it to: a denominational return,
 * a charity annual report, a vote that needs a quorum. What they ask is not
 * "who is a member?" but "who was on the roll on 31 December?", and those are
 * different questions. A boolean on a person answers only the first, and
 * answers it for today — the moment somebody is removed, last year's roll
 * becomes unknowable, which is exactly when the auditor asks for it.
 *
 * So the roll is **derived** from an append-only log of changes and never
 * stored. Three decisions follow from that.
 *
 *   1. **Every event carries the date it took effect**, not the date it was
 *      typed. A roll revision held in March records lapses dated to the
 *      previous 31 December, and a transfer letter that arrives in June
 *      records the date on the letter. Recording-time dates would put people
 *      in the wrong year's figures, which is the whole thing this is for.
 *   2. **A person's events must alternate**: joining, leaving, joining. Two
 *      joinings with no leaving between them is the state that makes a roll
 *      count somebody twice, and it cannot be prevented by a column because it
 *      depends on the dates of every other event that person has.
 *   3. **Why somebody left is read one person at a time.** It is the most
 *      sensitive line in the table — a transfer is nothing, a removal under
 *      discipline is not — so no listing carries it, exactly as the
 *      safeguarding register withholds a withdrawal reason. A roll is a thing
 *      churches pin to a noticeboard.
 */

/** The changes that put somebody on the roll. The rest take them off. */
const JOININGS = new Set<MembershipChange>(["BAPTISM", "PROFESSION", "TRANSFER_IN", "RESTORED"]);

export function isJoining(change: MembershipChange): boolean {
  return JOININGS.has(change);
}

export type MembershipRow = {
  id: string;
  personId: string;
  change: MembershipChange;
  on: IsoDate;
};

export type Verdict = { ok: true } | { ok: false; reason: string };

/**
 * One person's events, oldest first.
 *
 * Ties are broken by id so the order is total: two events on the same day
 * would otherwise sort differently between calls, and the alternation check
 * would accept a sequence one time and refuse it the next.
 */
export function inOrder(events: readonly MembershipRow[]): MembershipRow[] {
  return [...events].sort((a, b) => compareIsoDates(a.on, b.on) || a.id.localeCompare(b.id));
}

/**
 * Whether somebody was on the roll on a given day.
 *
 * Inclusive of the day itself: somebody admitted on 31 December is on the 31
 * December roll, because that is what the date on the certificate means. The
 * last event on or before the day decides it, and no events at all means no.
 */
export function wasMemberOn(events: readonly MembershipRow[], date: IsoDate): boolean {
  let member = false;
  for (const event of inOrder(events)) {
    if (compareIsoDates(event.on, date) > 0) break;
    member = isJoining(event.change);
  }
  return member;
}

export type Spell = { from: IsoDate; to: IsoDate | null; joined: MembershipChange; left: MembershipChange | null };

/**
 * A person's membership as spells, which is how a return asks for it.
 *
 * An open spell has a null `to`. Someone who has come and gone and come back
 * has two, and "when did they join?" has two honest answers — which is why
 * `RESTORED` is its own change rather than another transfer in.
 */
export function spellsOf(events: readonly MembershipRow[]): Spell[] {
  const spells: Spell[] = [];
  for (const event of inOrder(events)) {
    const open = spells.length > 0 ? spells[spells.length - 1] : null;
    if (isJoining(event.change)) {
      // A joining while a spell is open is refused when it is written; one
      // already in the data must not silently start a second spell on top.
      if (!open || open.to !== null) {
        spells.push({ from: event.on, to: null, joined: event.change, left: null });
      }
    } else if (open && open.to === null) {
      open.to = event.on;
      open.left = event.change;
    }
  }
  return spells;
}

/**
 * Whether a change may be added to somebody's history.
 *
 * Checked against the state **as at the new event's own date**, not as at
 * today, because backfilling is normal: a transfer letter dated last March
 * arrives in June, and the question is whether they were a member last March.
 * Then the events after it are checked too, because inserting a joining in the
 * middle of an open spell breaks the alternation just as surely as appending
 * one does.
 */
export function checkChange(
  events: readonly MembershipRow[],
  proposed: { change: MembershipChange; on: IsoDate },
  today: IsoDate,
): Verdict {
  if (compareIsoDates(proposed.on, today) > 0) {
    return { ok: false, reason: "That's in the future — record it when it happens." };
  }

  const joining = isJoining(proposed.change);
  const ordered = inOrder(events);
  const earlier = ordered.filter((event) => compareIsoDates(event.on, proposed.on) <= 0);
  const later = ordered.filter((event) => compareIsoDates(event.on, proposed.on) > 0);

  const wasMember = earlier.length > 0 && isJoining(earlier[earlier.length - 1].change);

  if (joining && wasMember) {
    return {
      ok: false,
      reason: "They were already on the roll then. Record them leaving first, or correct the date.",
    };
  }
  if (!joining && !wasMember) {
    return {
      ok: false,
      reason: "They weren't on the roll then, so there is nothing to record them leaving from.",
    };
  }

  // The next event after this one has to make sense following it: two joinings
  // in a row either way round is the same corruption.
  const next = later[0];
  if (next && isJoining(next.change) === joining) {
    const what = joining ? "joining" : "leaving";
    return {
      ok: false,
      reason: `The next thing on their record is already a ${what}, on ${next.on}. Fix that one first.`,
    };
  }

  return { ok: true };
}

export type RollEntry = { personId: string; since: IsoDate; joined: MembershipChange };

/**
 * The roll as it stood on a given day.
 *
 * Takes every event for everybody rather than a filtered set, because a person
 * whose only events are from 2019 is still on the 2026 roll if the last of
 * them was a joining. Filtering by date before this point is the mistake that
 * makes an old roll look empty.
 */
export function rollAt(events: readonly MembershipRow[], date: IsoDate): RollEntry[] {
  const byPerson = new Map<string, MembershipRow[]>();
  for (const event of events) {
    const list = byPerson.get(event.personId);
    if (list) list.push(event);
    else byPerson.set(event.personId, [event]);
  }

  const roll: RollEntry[] = [];
  for (const [personId, own] of byPerson) {
    const upTo = own.filter((event) => compareIsoDates(event.on, date) <= 0);
    if (upTo.length === 0) continue;
    const ordered = inOrder(upTo);
    const last = ordered[ordered.length - 1];
    if (!isJoining(last.change)) continue;
    // Since the start of the *current* spell, not the first time they ever
    // joined: "a member since 1998" is wrong for somebody who left in 2003.
    const spells = spellsOf(ordered);
    const open = spells[spells.length - 1];
    roll.push({ personId, since: open.from, joined: open.joined });
  }

  return roll.sort((a, b) => compareIsoDates(a.since, b.since) || a.personId.localeCompare(b.personId));
}

export type Revision = {
  from: IsoDate;
  to: IsoDate;
  /** The roll at the start of the span, before any of its changes. */
  openingCount: number;
  joined: { personId: string; change: MembershipChange; on: IsoDate }[];
  left: { personId: string; change: MembershipChange; on: IsoDate }[];
  closingCount: number;
  /** Closing less opening. Negative is a shrinking church, which is a fact. */
  net: number;
  /** Whether the arithmetic closes — see `reconciles` on the accounts. */
  reconciles: boolean;
};

/**
 * What changed over a span, and the two counts either side of it.
 *
 * The shape of an annual return: so many at the start, so many in by each
 * route, so many out by each, so many at the end. The counts are computed
 * independently of the movements and `reconciles` says they agree — which
 * catches the boundary error this sort of report always has, where the opening
 * roll and the first day's changes both take the same day.
 */
export function revision(events: readonly MembershipRow[], from: IsoDate, to: IsoDate): Revision {
  // The opening roll is the day *before* the span starts: a joining on the
  // first day belongs to the span's movements, not to what was already there.
  const opening = rollAt(events, previousDay(from));
  const closing = rollAt(events, to);

  const inSpan = events.filter(
    (event) => compareIsoDates(event.on, from) >= 0 && compareIsoDates(event.on, to) <= 0,
  );
  const describe = (event: MembershipRow) => ({
    personId: event.personId,
    change: event.change,
    on: event.on,
  });

  const joined = inOrder(inSpan.filter((event) => isJoining(event.change))).map(describe);
  const left = inOrder(inSpan.filter((event) => !isJoining(event.change))).map(describe);

  return {
    from,
    to,
    openingCount: opening.length,
    joined,
    left,
    closingCount: closing.length,
    net: closing.length - opening.length,
    reconciles: opening.length + joined.length - left.length === closing.length,
  };
}

/** The day before an ISO date, without pulling in a date library. */
function previousDay(date: IsoDate): IsoDate {
  const [year, month, day] = date.split("-").map(Number);
  const moment = new Date(Date.UTC(year, month - 1, day));
  moment.setUTCDate(moment.getUTCDate() - 1);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${moment.getUTCFullYear()}-${pad(moment.getUTCMonth() + 1)}-${pad(moment.getUTCDate())}`;
}

export const CHANGE_LABELS: Record<MembershipChange, string> = {
  BAPTISM: "baptism",
  PROFESSION: "profession of faith",
  TRANSFER_IN: "transfer in",
  RESTORED: "restored to the roll",
  DEATH: "death",
  TRANSFER_OUT: "transfer out",
  REQUEST: "at their own request",
  LAPSED: "lapsed at a revision",
};

/** How many came in and went out by each route, for the return's table. */
export function byRoute(events: readonly { change: MembershipChange }[]): Record<MembershipChange, number> {
  const counts = Object.fromEntries(
    (Object.keys(CHANGE_LABELS) as MembershipChange[]).map((change) => [change, 0]),
  ) as Record<MembershipChange, number>;
  for (const event of events) counts[event.change] += 1;
  return counts;
}

/**
 * A roll entry as it may be shown on a noticeboard.
 *
 * Built field by field rather than by deleting from the full one, and it is
 * the absence of the leaving reason that matters: a roll is a public thing and
 * why somebody came off it is not.
 */
export function publicEntry(entry: RollEntry) {
  return { personId: entry.personId, since: entry.since };
}
