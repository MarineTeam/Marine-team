import { createHmac } from "node:crypto";
import { Prisma, type User } from "@prisma/client";
import { ApiError } from "@/lib/api-guard";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/current-user";
import { hasCapability } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { fromIsoDate, toIsoDate, todayIso, type IsoDate } from "@/lib/dates";
import { ageOn, type HouseholdMember } from "@/lib/households";
import {
  CODE_ALPHABET,
  CODE_LENGTH,
  canCheckIn,
  eligibility,
  labelsFor,
  releaseDecision,
  type Record_,
  type Session,
} from "@/lib/checkin";

/**
 * Running the desk.
 *
 * The rules are in `checkin.ts`. Two things this file is careful about, both
 * learned from what goes wrong at a real desk on a real Sunday:
 *
 *   1. **A family's code is derived, not drawn.** Two volunteers checking in
 *      two siblings at the same moment would otherwise generate two codes for
 *      one family, and the parent would arrive with a ticket matching one of
 *      their children. An HMAC of the session and the household has no race in
 *      it, and reprinting a lost ticket produces the same code rather than
 *      invalidating the one on the child's coat.
 *   2. **Medical notes exist in exactly one shape** — the room's register —
 *      and nothing else in this file returns them.
 */

const sessionSelect = {
  id: true,
  name: true,
  date: true,
  room: true,
  minAge: true,
  maxAge: true,
  closedAt: true,
} as const;

function asSession(row: { date: Date } & Omit<Session, "date">): Session {
  return { ...row, date: toIsoDate(row.date) };
}

/**
 * The code for one family in one session.
 *
 * Derived rather than stored-then-read, so there is no window in which two
 * desks disagree. The secret is the app's own — a code is worth nothing after
 * the session closes, and the protection is the guardian check beside it, not
 * this.
 */
export function codeFor(sessionId: string, householdId: string): string {
  const digest = createHmac("sha256", process.env.AUTH0_SECRET || "checkin")
    .update(`${sessionId}:${householdId}`)
    .digest();
  let code = "";
  for (let index = 0; index < CODE_LENGTH; index += 1) {
    code += CODE_ALPHABET[digest[index] % CODE_ALPHABET.length];
  }
  return code;
}

export async function listSessions(date: IsoDate = todayIso()) {
  const rows = await prisma.checkinSession.findMany({
    where: { date: fromIsoDate(date) },
    select: { ...sessionSelect, _count: { select: { records: true } } },
    orderBy: { name: "asc" },
  });
  return rows.map((row) => ({ ...asSession(row), checkedIn: row._count.records }));
}

export async function openSession(input: {
  name: string;
  date: IsoDate;
  room?: string | null;
  minAge?: number | null;
  maxAge?: number | null;
}) {
  if (input.minAge != null && input.maxAge != null && input.minAge > input.maxAge) {
    throw new ApiError(400, "bad_ages", "The youngest age can't be above the oldest.");
  }
  const row = await prisma.checkinSession.create({
    data: {
      name: input.name.trim(),
      date: fromIsoDate(input.date),
      room: input.room?.trim() || null,
      minAge: input.minAge ?? null,
      maxAge: input.maxAge ?? null,
    },
    select: sessionSelect,
  });
  return asSession(row);
}

/**
 * Closes a session, refusing while anybody is still in the room.
 *
 * The one check that matters at the end of a morning: a session closed with
 * children still signed in is a register that says nothing happened to them.
 */
export async function closeSession(id: string, byEmail: string) {
  const here = await prisma.checkinRecord.count({ where: { sessionId: id, checkedOutAt: null } });
  if (here > 0) {
    throw new ApiError(409, "still_here", `${here} ${here === 1 ? "child is" : "children are"} still signed in.`);
  }
  const row = await prisma.checkinSession.update({
    where: { id },
    data: { closedAt: new Date() },
    select: sessionSelect,
  });
  await logAudit(byEmail, "update", "checkin-session", id, `closed ${row.name}`);
  return asSession(row);
}

const memberSelect = {
  id: true,
  displayName: true,
  householdRole: true,
  dateOfBirth: true,
  userId: true,
  active: true,
} as const;

function asMember(row: { dateOfBirth: Date | null } & Omit<HouseholdMember, "dateOfBirth">): HouseholdMember {
  return { ...row, dateOfBirth: row.dateOfBirth ? toIsoDate(row.dateOfBirth) : null };
}

/**
 * Families matching what somebody typed at the desk, with their children and
 * the adults who may collect them.
 *
 * Searched by any member's name, not by the household's: a parent gives their
 * own name or the child's, and being told "no such household" because the
 * family record is called "The Bells" is the sort of thing that has a queue
 * behind it.
 */
export async function findFamilies(query: string, sessionId: string, take = 10) {
  const text = query.trim();
  if (text.length < 2) return [];

  const households = await prisma.household.findMany({
    where: { members: { some: { displayName: { contains: text, mode: "insensitive" }, deletedAt: null } } },
    select: { id: true, name: true, members: { where: { deletedAt: null }, select: memberSelect } },
    orderBy: { name: "asc" },
    take,
  });
  if (households.length === 0) return [];

  const records = await prisma.checkinRecord.findMany({
    where: { sessionId, childId: { in: households.flatMap((h) => h.members.map((m) => m.id)) } },
    select: { id: true, childId: true, securityCode: true, checkedOutAt: true },
  });
  const byChild = new Map(records.map((record) => [record.childId, record]));

  return households.map((household) => ({
    id: household.id,
    name: household.name,
    code: codeFor(sessionId, household.id),
    members: household.members.map(asMember),
    records: Object.fromEntries(
      household.members.map((member) => [member.id, byChild.get(member.id) ?? null]),
    ) as Record<string, Record_ | null>,
  }));
}

async function loadSession(sessionId: string): Promise<Session> {
  const row = await prisma.checkinSession.findUnique({ where: { id: sessionId }, select: sessionSelect });
  if (!row) throw new ApiError(404, "not_found", "That session is gone.");
  return asSession(row);
}

async function householdOf(childId: string) {
  const child = await prisma.person.findUnique({
    where: { id: childId },
    select: { id: true, householdId: true },
  });
  if (!child?.householdId) {
    throw new ApiError(400, "no_household", "That child isn't in a household, so nobody can be checked as collecting them.");
  }
  const members = await prisma.person.findMany({
    where: { householdId: child.householdId, deletedAt: null },
    select: memberSelect,
  });
  return { householdId: child.householdId, members: members.map(asMember) };
}

/**
 * Signs one child in.
 *
 * The unique index on (session, child) is the real guard against a double
 * check-in: two volunteers pressing the button together produce one record and
 * one honest "already signed in", rather than two labels for one child.
 */
export async function checkIn(input: {
  sessionId: string;
  childId: string;
  broughtById?: string | null;
  byEmail: string;
  today?: IsoDate;
}) {
  const today = input.today ?? todayIso();
  const session = await loadSession(input.sessionId);
  const { householdId, members } = await householdOf(input.childId);

  const child = members.find((member) => member.id === input.childId);
  if (!child) throw new ApiError(404, "not_found", "That child is gone.");

  const existing = await prisma.checkinRecord.findUnique({
    where: { sessionId_childId: { sessionId: session.id, childId: child.id } },
    select: { id: true, childId: true, securityCode: true, checkedOutAt: true },
  });

  const allowed = canCheckIn(session, child, existing);
  if (!allowed.ok) throw new ApiError(409, "cannot_check_in", allowed.reason);

  const fits = eligibility(session, child.dateOfBirth, today);
  if (!fits.ok) throw new ApiError(409, "wrong_room", fits.reason);

  const code = codeFor(session.id, householdId);
  let record;
  try {
    record = existing
      ? await prisma.checkinRecord.update({
          where: { id: existing.id },
          // Coming back after being collected: the same row, reopened, so the
          // register shows one child rather than two half-stories.
          data: {
            checkedInAt: new Date(),
            checkedOutAt: null,
            releasedToId: null,
            releasedByEmail: null,
            overrideReason: null,
            securityCode: code,
            broughtById: input.broughtById ?? null,
            checkedInByEmail: input.byEmail,
          },
          select: { id: true, securityCode: true },
        })
      : await prisma.checkinRecord.create({
          data: {
            sessionId: session.id,
            childId: child.id,
            securityCode: code,
            broughtById: input.broughtById ?? null,
            checkedInByEmail: input.byEmail,
          },
          select: { id: true, securityCode: true },
        });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new ApiError(409, "cannot_check_in", `${child.displayName} is already signed in.`);
    }
    throw error;
  }

  await logAudit(input.byEmail, "create", "checkin", record.id, `${child.displayName} into ${session.name}`);

  const siblings = await prisma.checkinRecord.findMany({
    where: { sessionId: session.id, checkedOutAt: null, child: { householdId } },
    select: { child: { select: { displayName: true } } },
  });

  return {
    recordId: record.id,
    note: fits.ok ? (fits.note ?? null) : null,
    labels: labelsFor(session, record.securityCode, siblings.map((row) => row.child)),
  };
}

/**
 * Hands one child over, or says exactly why not.
 *
 * The decision is `releaseDecision`'s; this writes it down. An override is
 * audited with the reason attached — an override that leaves no trace is the
 * thing the whole feature exists to prevent.
 */
export async function release(input: {
  sessionId: string;
  childId: string;
  presentedCode?: string;
  collectorId?: string | null;
  byEmail: string;
  override?: { reason: string } | null;
}) {
  const session = await loadSession(input.sessionId);
  const { members } = await householdOf(input.childId);

  const record = await prisma.checkinRecord.findUnique({
    where: { sessionId_childId: { sessionId: session.id, childId: input.childId } },
    select: { id: true, childId: true, securityCode: true, checkedOutAt: true },
  });

  const decision = releaseDecision({
    record,
    presentedCode: input.presentedCode ?? "",
    collectorId: input.collectorId ?? null,
    members,
    override: input.override ? { by: input.byEmail, reason: input.override.reason } : null,
  });
  if (!decision.ok) throw new ApiError(409, decision.code, decision.reason);

  // Conditional on still being in the room, so two desks releasing at once
  // produce one hand-over and one honest "already collected".
  const { count } = await prisma.checkinRecord.updateMany({
    where: { id: record!.id, checkedOutAt: null },
    data: {
      checkedOutAt: new Date(),
      releasedToId: input.collectorId ?? null,
      releasedByEmail: input.byEmail,
      overrideReason: decision.by === "override" ? decision.reason : null,
    },
  });
  if (count === 0) throw new ApiError(409, "already-collected", "They have already been collected.");

  const child = members.find((member) => member.id === input.childId);
  await logAudit(
    input.byEmail,
    "update",
    "checkin",
    record!.id,
    decision.by === "override"
      ? `OVERRIDE released ${child?.displayName ?? input.childId}: ${decision.reason}`
      : `released ${child?.displayName ?? input.childId}`,
  );
  return { by: decision.by };
}

/**
 * The room's register — the one place a medical note appears.
 *
 * Nothing else in this file selects `medicalNotes`, and nothing prints it. A
 * screen in the room is where somebody can act on "peanut allergy"; a sticker
 * in a corridor is where it becomes everybody's business.
 */
export async function register(sessionId: string, today: IsoDate = todayIso()) {
  const session = await loadSession(sessionId);
  const rows = await prisma.checkinRecord.findMany({
    where: { sessionId },
    orderBy: { checkedInAt: "asc" },
    select: {
      id: true,
      securityCode: true,
      checkedInAt: true,
      checkedOutAt: true,
      overrideReason: true,
      releasedByEmail: true,
      child: { select: { id: true, displayName: true, dateOfBirth: true, medicalNotes: true } },
      broughtBy: { select: { displayName: true } },
      releasedTo: { select: { displayName: true } },
    },
  });

  return {
    session,
    here: rows.filter((row) => row.checkedOutAt === null).length,
    children: rows.map((row) => ({
      id: row.id,
      childId: row.child.id,
      name: row.child.displayName,
      age: ageOn(row.child.dateOfBirth ? toIsoDate(row.child.dateOfBirth) : null, today),
      code: row.securityCode,
      medicalNotes: row.child.medicalNotes,
      broughtBy: row.broughtBy?.displayName ?? null,
      checkedInAt: row.checkedInAt.toISOString(),
      checkedOutAt: row.checkedOutAt?.toISOString() ?? null,
      releasedTo: row.releasedTo?.displayName ?? null,
      releasedBy: row.releasedByEmail,
      overrideReason: row.overrideReason,
    })),
  };
}

/**
 * Whoever is working the desk, or nothing.
 *
 * 404 rather than 403: whether this church runs children's work at all is not
 * something to confirm to somebody who may not do it.
 */
export async function requireDesk(): Promise<User> {
  const user = await getCurrentUser();
  if (!user || !(await hasCapability(user, "run_checkin"))) {
    throw new ApiError(404, "not_found", "Not found");
  }
  return user;
}
