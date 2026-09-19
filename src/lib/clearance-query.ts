import type { ClearanceKind, User } from "@prisma/client";
import { ApiError } from "@/lib/api-guard";
import {
  checkEntry,
  kindLabel,
  mayServe,
  needsChasing,
  stateOf,
  type ClearanceRow,
  type Verdict,
} from "@/lib/clearance";
import { getCurrentUser } from "@/lib/current-user";
import { toIsoDate, todayIso, fromIsoDate, type IsoDate } from "@/lib/dates";
import { prisma } from "@/lib/db";
import { hasCapability } from "@/lib/permissions";

/**
 * Clearance records, and the guards that read them.
 *
 * The rules are in `clearance.ts`. What this file adds is the two places the
 * answer is actually enforced — putting somebody on a team, and opening the
 * check-in desk — plus the settings the requirement is configured in.
 *
 * Reading a clearance list is itself sensitive, so `requireSafeguarding`
 * gates it on `manage_people` rather than on running the desk: somebody who
 * works the desk on a Sunday needs the *verdict* about themselves, not the
 * roll of who has been checked and when.
 */

const SETTINGS_ID = "singleton";

export async function safeguardingSettings() {
  return prisma.safeguardingSettings.upsert({
    where: { id: SETTINGS_ID },
    create: { id: SETTINGS_ID },
    update: {},
  });
}

export async function requireSafeguarding(): Promise<User> {
  const user = await getCurrentUser();
  if (!user || !(await hasCapability(user, "manage_people"))) {
    throw new ApiError(404, "not_found", "Not found");
  }
  return user;
}

function asRow(row: { kind: ClearanceKind; verifiedOn: Date; expiresOn: Date; withdrawnAt: Date | null }): ClearanceRow {
  return {
    kind: row.kind,
    verifiedOn: toIsoDate(row.verifiedOn),
    expiresOn: toIsoDate(row.expiresOn),
    withdrawnAt: row.withdrawnAt,
  };
}

/** Everything on file for one person. */
export async function clearancesFor(userId: string): Promise<ClearanceRow[]> {
  const rows = await prisma.volunteerClearance.findMany({
    where: { userId },
    select: { kind: true, verifiedOn: true, expiresOn: true, withdrawnAt: true },
  });
  return rows.map(asRow);
}

/**
 * Whether somebody may be put on a team.
 *
 * Reads the requirement from the team rather than taking it as an argument,
 * for the same reason the group broadcast reads its audience from its own
 * lookup: a guard whose strictness comes from the caller is a guard a caller
 * can turn off.
 */
export async function mayJoinTeam(userId: string, teamId: string): Promise<Verdict> {
  const [team, settings] = await Promise.all([
    prisma.serviceTeam.findUnique({ where: { id: teamId }, select: { requiredClearances: true } }),
    safeguardingSettings(),
  ]);
  if (!team || team.requiredClearances.length === 0) return { ok: true, warnings: [] };

  return mayServe({
    rows: await clearancesFor(userId),
    required: team.requiredClearances,
    today: todayIso(),
    warnDays: settings.warnDays,
  });
}

/** The same question, raised as a refusal the routes can let through. */
export async function ensureMayJoinTeam(userId: string, teamId: string): Promise<void> {
  const verdict = await mayJoinTeam(userId, teamId);
  if (!verdict.ok) throw new ApiError(409, "not_cleared", verdict.reason);
}

/**
 * Whether somebody may work the check-in desk.
 *
 * The requirement is site-wide rather than per-session: a church that requires
 * a check to work the desk requires it every week, and a per-session tick-box
 * is one somebody forgets on the week it matters.
 *
 * Left empty by default, so switching this on is a decision a church makes
 * rather than a Sunday morning where nobody can open the desk because no
 * records have been entered yet.
 */
export async function mayWorkDesk(userId: string): Promise<Verdict> {
  const settings = await safeguardingSettings();
  if (settings.checkinDeskRequires.length === 0) return { ok: true, warnings: [] };

  return mayServe({
    rows: await clearancesFor(userId),
    required: settings.checkinDeskRequires,
    today: todayIso(),
    warnDays: settings.warnDays,
  });
}

export async function ensureMayWorkDesk(userId: string): Promise<void> {
  const verdict = await mayWorkDesk(userId);
  if (!verdict.ok) {
    throw new ApiError(
      403,
      "not_cleared",
      // Addressed to the person at the desk, who is the one being refused —
      // unlike the rota message, which is read by whoever is scheduling.
      verdict.reason.replace("They can't be put on this team yet", "You can't work the desk yet"),
    );
  }
}

export type ClearanceEntry = {
  userId: string;
  kind: ClearanceKind;
  verifiedOn: IsoDate;
  expiresOn: IsoDate;
  reference?: string | null;
};

/** Records that somebody saw the document. Never what the document said. */
export async function recordClearance(entry: ClearanceEntry, verifier: User) {
  const sane = checkEntry({ verifiedOn: entry.verifiedOn, expiresOn: entry.expiresOn, today: todayIso() });
  if (!sane.ok) throw new ApiError(400, "bad_dates", sane.reason);

  const person = await prisma.user.findUnique({ where: { id: entry.userId }, select: { id: true } });
  if (!person) throw new ApiError(404, "not_found", "Not found");

  return prisma.volunteerClearance.create({
    data: {
      userId: entry.userId,
      kind: entry.kind,
      verifiedOn: fromIsoDate(entry.verifiedOn),
      expiresOn: fromIsoDate(entry.expiresOn),
      verifiedById: verifier.id,
      verifiedByEmail: verifier.email,
      reference: entry.reference?.trim() || null,
    },
  });
}

/**
 * Withdraws a clearance, with a reason.
 *
 * The row is kept and flagged rather than deleted: a withdrawal is a decision
 * somebody made, and deleting it would leave the person looking as though
 * they had simply never been checked — which is a different, and much less
 * answerable, thing to find in a file later.
 */
export async function withdrawClearance(id: string, reason: string) {
  const text = reason.trim();
  if (!text) throw new ApiError(400, "needs_reason", "Say why it's being withdrawn.");

  const { count } = await prisma.volunteerClearance.updateMany({
    where: { id, withdrawnAt: null },
    data: { withdrawnAt: new Date(), withdrawnReason: text },
  });
  if (count === 0) throw new ApiError(409, "already_withdrawn", "That's already been withdrawn.");
  return prisma.volunteerClearance.findUniqueOrThrow({ where: { id } });
}

export type PersonClearances = {
  userId: string;
  name: string;
  email: string;
  rows: (ClearanceRow & { id: string; reference: string | null; verifiedByEmail: string })[];
};

/**
 * The register: everybody who holds anything, and what.
 *
 * Deliberately does not select `withdrawnReason`. The list is read by whoever
 * keeps the records, and the reason for a withdrawal is not something to put
 * on a screen that gets left open — it is available on the one record, to the
 * one person who asked for it.
 */
export async function register(): Promise<PersonClearances[]> {
  const rows = await prisma.volunteerClearance.findMany({
    orderBy: [{ userId: "asc" }, { expiresOn: "desc" }],
    select: {
      id: true,
      kind: true,
      verifiedOn: true,
      expiresOn: true,
      withdrawnAt: true,
      reference: true,
      verifiedByEmail: true,
      user: { select: { id: true, name: true, displayName: true, email: true } },
    },
  });

  const people = new Map<string, PersonClearances>();
  for (const row of rows) {
    const entry = people.get(row.user.id) ?? {
      userId: row.user.id,
      name: row.user.displayName ?? row.user.name ?? row.user.email,
      email: row.user.email,
      rows: [],
    };
    entry.rows.push({
      ...asRow(row),
      id: row.id,
      reference: row.reference,
      verifiedByEmail: row.verifiedByEmail,
    });
    people.set(row.user.id, entry);
  }
  return [...people.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** Why one withdrawal happened, asked for one record at a time. */
export async function withdrawalReason(id: string): Promise<string | null> {
  const row = await prisma.volunteerClearance.findUnique({
    where: { id },
    select: { withdrawnReason: true },
  });
  return row?.withdrawnReason ?? null;
}

export type Chase = {
  clearanceId: string;
  userId: string;
  name: string;
  kind: ClearanceKind;
  expiresOn: IsoDate;
  state: ReturnType<typeof stateOf>;
};

/**
 * What is running out, soonest first.
 *
 * Only for people who are actually on a team that needs it — chasing somebody
 * for a check nothing requires of them is how a church teaches its volunteers
 * that these reminders are noise.
 */
export async function expiring(today: IsoDate = todayIso()): Promise<Chase[]> {
  const settings = await safeguardingSettings();

  const teams = await prisma.serviceTeam.findMany({
    where: { requiredClearances: { isEmpty: false } },
    select: { requiredClearances: true, members: { select: { userId: true } } },
  });

  const wanted = new Map<string, Set<ClearanceKind>>();
  for (const team of teams) {
    for (const member of team.members) {
      const kinds = wanted.get(member.userId) ?? new Set<ClearanceKind>();
      for (const kind of team.requiredClearances) kinds.add(kind);
      wanted.set(member.userId, kinds);
    }
  }
  // Anybody the desk requirement applies to is chased as well, whatever team
  // they are or aren't on.
  if (settings.checkinDeskRequires.length > 0) {
    const desk = await prisma.volunteerClearance.findMany({
      where: { kind: { in: settings.checkinDeskRequires } },
      select: { userId: true },
      distinct: ["userId"],
    });
    for (const row of desk) {
      const kinds = wanted.get(row.userId) ?? new Set<ClearanceKind>();
      for (const kind of settings.checkinDeskRequires) kinds.add(kind);
      wanted.set(row.userId, kinds);
    }
  }
  if (wanted.size === 0) return [];

  const rows = await prisma.volunteerClearance.findMany({
    where: { userId: { in: [...wanted.keys()] }, withdrawnAt: null },
    select: {
      id: true,
      userId: true,
      kind: true,
      verifiedOn: true,
      expiresOn: true,
      withdrawnAt: true,
      user: { select: { name: true, displayName: true, email: true } },
    },
  });

  const relevant = rows.filter((row) => wanted.get(row.userId)?.has(row.kind));
  return needsChasing(
    relevant.map((row) => ({ ...asRow(row), id: row.id, userId: row.userId, user: row.user })),
    today,
    settings.warnDays,
  ).map((row) => ({
    clearanceId: row.id,
    userId: row.userId,
    name: row.user.displayName ?? row.user.name ?? row.user.email,
    kind: row.kind,
    expiresOn: row.expiresOn,
    state: stateOf(row, today, settings.warnDays),
  }));
}

/** What a chase reads as in the follow-up queue. */
export function chaseTitle(chase: Chase): string {
  return chase.state === "expired"
    ? `${chase.name}: ${kindLabel(chase.kind)} has expired`
    : `${chase.name}: ${kindLabel(chase.kind)} runs out soon`;
}
