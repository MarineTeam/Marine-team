import { randomBytes } from "node:crypto";
import type { User } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { IcsEvent } from "@/lib/ics";
import { assignmentEntry, eventEntry, rotaEntry } from "@/lib/calendar-feed";

/**
 * Reading the diary out, for the .ics feeds.
 *
 * Two windows, both deliberate. A subscribed calendar is re-fetched, so it
 * should carry a little of the past — a phone showing an empty last Sunday is
 * confusing when the entry was there yesterday — and it should not carry
 * forever, because a feed is downloaded whole every few hours.
 */
const PAST_DAYS = 30;
const FUTURE_DAYS = 400;

function window(now: Date): { from: Date; to: Date } {
  return {
    from: new Date(now.getTime() - PAST_DAYS * 86_400_000),
    to: new Date(now.getTime() + FUTURE_DAYS * 86_400_000),
  };
}

/**
 * What's on, for anybody.
 *
 * Member-only events are absent, and that is not an oversight: a feed URL is
 * fetched by a calendar server with no session, so there is nobody to check.
 * Anything gated belongs in the personal feed, which has a member behind it.
 */
export async function publicCalendarEntries(now = new Date()): Promise<IcsEvent[]> {
  const { from, to } = window(now);
  const events = await prisma.event.findMany({
    where: { published: true, memberOnly: false, startsAt: { gte: from, lte: to } },
    orderBy: { startsAt: "asc" },
  });
  return events.map(eventEntry);
}

/**
 * One member's own diary: what they are serving at, what they have signed up
 * for, and the dates a rota names them on.
 *
 * Member-only events are in here, because this feed's URL identifies a person.
 * That is also why the URL is the credential and why it can be replaced.
 */
export async function personalCalendarEntries(user: User, now = new Date()): Promise<IcsEvent[]> {
  const { from, to } = window(now);

  const [assignments, registrations, person] = await Promise.all([
    prisma.serviceAssignment.findMany({
      where: { userId: user.id, plan: { serviceDate: { gte: from, lte: to } } },
      include: { team: { select: { name: true } }, plan: { select: { id: true, title: true, serviceDate: true } } },
    }),
    prisma.eventRegistration.findMany({
      where: {
        userId: user.id,
        status: { not: "CANCELLED" },
        event: { startsAt: { gte: from, lte: to } },
      },
      include: { event: true },
    }),
    prisma.person.findUnique({ where: { userId: user.id }, select: { id: true } }),
  ]);

  const rota = person
    ? await prisma.calendarEventPerson.findMany({
        where: {
          personId: person.id,
          event: { date: { gte: from, lte: to }, deletedAt: null, schedule: { enabled: true, deletedAt: null } },
        },
        include: { event: { include: { schedule: { select: { name: true } } } } },
      })
    : [];

  return [
    ...assignments.flatMap((assignment) => {
      const entry = assignmentEntry(assignment);
      return entry ? [entry] : [];
    }),
    ...registrations.map((registration) => ({
      ...eventEntry(registration.event),
      // The entry says which it is, because "you are on the waiting list" is
      // exactly the thing somebody forgets between signing up and the day.
      title:
        registration.status === "WAITLIST"
          ? `${registration.event.title} (waiting list)`
          : registration.event.title,
    })),
    ...rota.map((named) =>
      rotaEntry({
        ...named.event,
        scheduleName: named.event.schedule.name,
        role: named.role,
      }),
    ),
  ];
}

/**
 * The member behind a feed URL, or null.
 *
 * An empty or short token is refused before it reaches the database: a lookup
 * of `""` against a nullable unique column is the kind of thing that quietly
 * matches every row that never asked for a feed.
 */
export async function userByCalendarToken(token: string): Promise<User | null> {
  if (token.length < 20) return null;
  return prisma.user.findUnique({ where: { calendarToken: token } });
}

/** 24 random bytes, url-safe. Long enough that guessing is not a strategy. */
function newToken(): string {
  return randomBytes(24).toString("base64url");
}

/** The member's feed token, made if they haven't one yet. */
export async function ensureCalendarToken(userId: string): Promise<string> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { calendarToken: true } });
  if (user.calendarToken) return user.calendarToken;
  const token = newToken();
  await prisma.user.update({ where: { id: userId }, data: { calendarToken: token } });
  return token;
}

/**
 * A new token, which is what "this link got out" needs: the old URL stops
 * working the moment this returns, and every calendar subscribed to it stops
 * updating rather than going on quietly.
 */
export async function resetCalendarToken(userId: string): Promise<string> {
  const token = newToken();
  await prisma.user.update({ where: { id: userId }, data: { calendarToken: token } });
  return token;
}

/** Stops the feed entirely. */
export async function clearCalendarToken(userId: string): Promise<void> {
  await prisma.user.update({ where: { id: userId }, data: { calendarToken: null } });
}
