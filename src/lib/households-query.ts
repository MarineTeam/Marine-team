import { ApiError } from "@/lib/api-guard";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/current-user";
import { hasCapability } from "@/lib/permissions";
import { toIsoDate, fromIsoDate, todayIso, type IsoDate } from "@/lib/dates";
import {
  presentHousehold,
  suggestName,
  upcomingOccasions,
  type HouseholdMember,
  type HouseholdViewer,
  type Occasion,
} from "@/lib/households";
import type { HouseholdRole, User } from "@prisma/client";

/**
 * Reading and writing family records.
 *
 * The rules are in `households.ts`. What this file is careful about is that a
 * person belongs to at most one household and that moving them is a single
 * write — the obvious implementation, "remove from the old one then add to the
 * new", leaves a family with a missing member if the second half fails.
 */

const memberSelect = {
  id: true,
  displayName: true,
  householdRole: true,
  dateOfBirth: true,
  userId: true,
  active: true,
} as const;

const householdSelect = {
  id: true,
  name: true,
  address: true,
  primaryContactId: true,
  anniversary: true,
  notes: true,
  members: { select: memberSelect },
} as const;

type MemberRow = {
  id: string;
  displayName: string;
  householdRole: HouseholdRole;
  dateOfBirth: Date | null;
  userId: string | null;
  active: boolean;
};

function asMember(row: MemberRow): HouseholdMember {
  return { ...row, dateOfBirth: row.dateOfBirth ? toIsoDate(row.dateOfBirth) : null };
}

function asHousehold(row: { anniversary: Date | null; members: MemberRow[] } & Record<string, unknown>) {
  return {
    ...(row as unknown as { id: string; name: string; address: string | null; primaryContactId: string | null; notes: string | null }),
    anniversary: row.anniversary ? toIsoDate(row.anniversary) : null,
    members: row.members.map(asMember),
  };
}

/** Who is asking, for the purposes of a family record. */
export async function householdViewer(user: User | null): Promise<HouseholdViewer> {
  return {
    userId: user?.id ?? null,
    manages: user ? await hasCapability(user, "manage_people") : false,
  };
}

/** Every household, for the office's list. */
export async function listHouseholds(viewer: HouseholdViewer, today: IsoDate = todayIso()) {
  const rows = await prisma.household.findMany({ select: householdSelect, orderBy: { name: "asc" } });
  return rows.map((row) => {
    const shaped = asHousehold(row);
    return presentHousehold(shaped, shaped.members, viewer, today);
  });
}

export async function getHousehold(id: string, viewer: HouseholdViewer, today: IsoDate = todayIso()) {
  const row = await prisma.household.findUnique({ where: { id }, select: householdSelect });
  if (!row) return null;
  const shaped = asHousehold(row);
  return presentHousehold(shaped, shaped.members, viewer, today);
}

/**
 * The household this member is in, if any — the one household read that is
 * not the office's.
 *
 * Reached from their own profile, so it resolves the account to a person
 * rather than taking an id: a member asking about "my household" must not be
 * able to ask about anybody else's by changing a number.
 */
export async function myHousehold(user: User, today: IsoDate = todayIso()) {
  const me = await prisma.person.findUnique({
    where: { userId: user.id },
    select: { householdId: true },
  });
  if (!me?.householdId) return null;
  return getHousehold(me.householdId, { userId: user.id, manages: false }, today);
}

export type HouseholdInput = {
  name?: string;
  address?: string | null;
  anniversary?: IsoDate | null;
  notes?: string | null;
  primaryContactId?: string | null;
};

function writable(input: HouseholdInput) {
  return {
    ...(input.name !== undefined ? { name: input.name.trim() } : {}),
    ...(input.address !== undefined ? { address: input.address?.trim() || null } : {}),
    ...(input.notes !== undefined ? { notes: input.notes?.trim() || null } : {}),
    ...(input.anniversary !== undefined
      ? { anniversary: input.anniversary ? fromIsoDate(input.anniversary) : null }
      : {}),
  };
}

/**
 * Makes a household and puts the given people in it.
 *
 * The name is offered by `suggestName` when the form leaves it blank, which is
 * the common case: whoever is typing has just picked four people and does not
 * want to think of a title for them.
 */
export async function createHousehold(input: HouseholdInput & { memberIds?: string[] }) {
  const memberIds = input.memberIds ?? [];
  const people = memberIds.length
    ? await prisma.person.findMany({ where: { id: { in: memberIds } }, select: { id: true, displayName: true } })
    : [];
  if (people.length !== memberIds.length) {
    throw new ApiError(400, "unknown_person", "One of those people no longer exists.");
  }

  const name = input.name?.trim() || suggestName(people);
  if (!name) throw new ApiError(400, "no_name", "Give the household a name.");

  return prisma.household.create({
    data: {
      ...writable({ ...input, name }),
      name,
      ...(memberIds.length ? { members: { connect: memberIds.map((id) => ({ id })) } } : {}),
    },
    select: householdSelect,
  });
}

/**
 * Changes a household's own fields.
 *
 * The primary contact is checked against the household's membership rather
 * than trusted: "ring this person about this family" pointing at somebody who
 * has never been in it is the kind of wrong that survives for years.
 */
export async function updateHousehold(id: string, input: HouseholdInput) {
  if (input.primaryContactId !== undefined && input.primaryContactId !== null) {
    const member = await prisma.person.findFirst({
      where: { id: input.primaryContactId, householdId: id },
      select: { id: true },
    });
    if (!member) {
      throw new ApiError(400, "not_a_member", "The primary contact must be somebody in this household.");
    }
  }

  const updated = await prisma.household.update({
    where: { id },
    data: {
      ...writable(input),
      ...(input.primaryContactId !== undefined ? { primaryContactId: input.primaryContactId } : {}),
    },
    select: householdSelect,
  });
  return updated;
}

/**
 * Moves somebody into a household, or out of one when `householdId` is null.
 *
 * One write, not a remove and an add: a person has at most one household, so
 * setting the field *is* the move, and there is no moment in between where a
 * family is missing a member.
 *
 * Leaving clears the primary contact if it was them, so no household is left
 * pointing at somebody who has moved out.
 */
export async function setHouseholdOf(
  personId: string,
  householdId: string | null,
  role: HouseholdRole = "ADULT",
) {
  const person = await prisma.person.findUnique({
    where: { id: personId },
    select: { id: true, householdId: true },
  });
  if (!person) throw new ApiError(404, "not_found", "That person is gone.");

  await prisma.$transaction([
    prisma.person.update({ where: { id: personId }, data: { householdId, householdRole: role } }),
    ...(person.householdId && person.householdId !== householdId
      ? [
          prisma.household.updateMany({
            where: { id: person.householdId, primaryContactId: personId },
            data: { primaryContactId: null },
          }),
        ]
      : []),
  ]);
}

/** A person's own details, which only the office edits. */
export async function updatePerson(
  personId: string,
  input: { dateOfBirth?: IsoDate | null; medicalNotes?: string | null; householdRole?: HouseholdRole },
) {
  return prisma.person.update({
    where: { id: personId },
    data: {
      ...(input.dateOfBirth !== undefined
        ? { dateOfBirth: input.dateOfBirth ? fromIsoDate(input.dateOfBirth) : null }
        : {}),
      ...(input.medicalNotes !== undefined ? { medicalNotes: input.medicalNotes?.trim() || null } : {}),
      ...(input.householdRole !== undefined ? { householdRole: input.householdRole } : {}),
    },
    select: memberSelect,
  });
}

/**
 * Deletes a household, leaving the people in it alone.
 *
 * The schema's `SetNull` does the work; this exists to say so. Deleting a
 * family record is a statement about a unit, never about its members, and
 * somebody who is on next Sunday's rota must still be there afterwards.
 */
export async function deleteHousehold(id: string): Promise<void> {
  await prisma.household.delete({ where: { id } });
}

/** Birthdays and anniversaries coming up, for the office's list. */
export async function occasionsWithin(days = 30, today: IsoDate = todayIso()): Promise<Occasion[]> {
  const rows = await prisma.household.findMany({ select: householdSelect });
  return upcomingOccasions(rows.map(asHousehold), today, days);
}

/** People not yet in any household, for the form that makes one. */
export async function unhoused(take = 200) {
  return prisma.person.findMany({
    where: { householdId: null, deletedAt: null, active: true },
    select: { id: true, displayName: true },
    orderBy: { displayName: "asc" },
    take,
  });
}

/** The office, for a route that must not answer anybody else. */
export async function requirePeopleAccess(): Promise<User> {
  const user = await getCurrentUser();
  if (!user || !(await hasCapability(user, "manage_people"))) {
    throw new ApiError(404, "not_found", "Not found");
  }
  return user;
}
