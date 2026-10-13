import type { MembershipChange, User } from "@prisma/client";
import { ApiError } from "@/lib/api-guard";
import { fromIsoDate, toIsoDate, todayIso, type IsoDate } from "@/lib/dates";
import { prisma } from "@/lib/db";
import {
  byRoute,
  checkChange,
  inOrder,
  revision,
  rollAt,
  spellsOf,
  type MembershipRow,
} from "@/lib/membership";

/**
 * The membership roll against the database.
 *
 * The rules are in `membership.ts`. Two things this file must not undermine.
 *
 * It never filters events by date before handing them over: the roll on any
 * day depends on somebody's last event whenever that was, so a person whose
 * only entry is from 1998 is still on the 2026 roll. Narrowing the query is
 * the mistake that makes an old roll look empty.
 *
 * And no listing carries the `note`. Why somebody left a church is the most
 * sensitive line in the table — a transfer is nothing, a removal is not — so
 * it is asked for one person at a time, exactly as the safeguarding register
 * withholds a withdrawal reason.
 */

const personSelect = {
  id: true,
  displayName: true,
  householdId: true,
  household: { select: { name: true } },
} as const;

/** Every event, as the rules see them. Deliberately unfiltered. */
async function allEvents(): Promise<MembershipRow[]> {
  const rows = await prisma.membershipEvent.findMany({
    select: { id: true, personId: true, change: true, on: true },
  });
  return rows.map((row) => ({ ...row, on: toIsoDate(row.on) }));
}

/**
 * The roll on a day, with names attached.
 *
 * Soft-deleted people are left out of the listing but their events still count
 * toward nothing else: a person removed from the app is not a statement about
 * whether they were a member in 2019, so historic figures stay intact while
 * the name stops appearing.
 */
export async function roll(date: IsoDate = todayIso()) {
  const [events, people] = await Promise.all([
    allEvents(),
    prisma.person.findMany({ where: { deletedAt: null }, select: personSelect }),
  ]);

  const names = new Map(people.map((person) => [person.id, person]));

  return rollAt(events, date)
    .map((entry) => {
      const person = names.get(entry.personId);
      if (!person) return null;
      return {
        personId: entry.personId,
        name: person.displayName,
        householdName: person.household?.name ?? null,
        since: entry.since,
        joined: entry.joined,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null);
}

/** One person's history, newest first, still without the notes. */
export async function historyFor(personId: string) {
  const rows = await prisma.membershipEvent.findMany({
    where: { personId },
    select: { id: true, personId: true, change: true, on: true, congregation: true },
  });
  const ordered = inOrder(rows.map((row) => ({ ...row, on: toIsoDate(row.on) })));
  return {
    events: [...ordered].reverse(),
    spells: spellsOf(ordered),
  };
}

/**
 * The note on one event, asked for on purpose.
 *
 * Separate from every listing and audited where it is called, so the reason
 * somebody was removed is never on a screen that was opened to look at
 * something else.
 */
export async function noteFor(eventId: string): Promise<string | null> {
  const row = await prisma.membershipEvent.findUnique({
    where: { id: eventId },
    select: { note: true },
  });
  if (!row) throw new ApiError(404, "not_found", "Not found");
  return row.note;
}

/** A revision over a span, with the by-route counts a return asks for. */
export async function rollRevision(from: IsoDate, to: IsoDate) {
  const events = await allEvents();
  const summary = revision(events, from, to);
  return {
    ...summary,
    joinedByRoute: byRoute(summary.joined),
    leftByRoute: byRoute(summary.left),
  };
}

export type ChangeInput = {
  personId: string;
  change: MembershipChange;
  on: IsoDate;
  congregation?: string | null;
  note?: string | null;
};

/**
 * Records a change to the roll.
 *
 * The person's existing events are re-read here and the verdict comes from
 * `checkChange` against them, so the alternation rule holds whatever a request
 * claims. Nothing is ever updated or deleted: a correction is a further event,
 * which is what keeps last year's roll reproducible.
 */
export async function recordChange(input: ChangeInput, by: User) {
  const person = await prisma.person.findUnique({
    where: { id: input.personId },
    select: { id: true, deletedAt: true },
  });
  if (!person || person.deletedAt) throw new ApiError(404, "not_found", "Not found");

  const existing = await prisma.membershipEvent.findMany({
    where: { personId: input.personId },
    select: { id: true, personId: true, change: true, on: true },
  });

  const verdict = checkChange(
    existing.map((row) => ({ ...row, on: toIsoDate(row.on) })),
    { change: input.change, on: input.on },
    todayIso(),
  );
  if (!verdict.ok) throw new ApiError(409, "refused", verdict.reason);

  return prisma.membershipEvent.create({
    data: {
      personId: input.personId,
      change: input.change,
      on: fromIsoDate(input.on),
      congregation: input.congregation?.trim() || null,
      note: input.note?.trim() || null,
      recordedByEmail: by.email,
    },
    select: { id: true },
  });
}

/**
 * People who could be added to the roll, for the picker.
 *
 * Everybody not currently on it, including those who have been on it before —
 * coming back is a `RESTORED`, and hiding former members would make that
 * impossible to record.
 */
export async function notOnRoll() {
  const [events, people] = await Promise.all([
    allEvents(),
    prisma.person.findMany({
      where: { deletedAt: null },
      orderBy: { displayName: "asc" },
      select: { id: true, displayName: true },
    }),
  ]);
  const onIt = new Set(rollAt(events, todayIso()).map((entry) => entry.personId));
  return people.filter((person) => !onIt.has(person.id));
}
