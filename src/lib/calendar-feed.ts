import type { IcsEvent } from "@/lib/ics";
import { siteUrl } from "@/lib/seo";

/**
 * Turning the things this app knows the date of into calendar entries.
 *
 * Three kinds of thing end up in a member's calendar and they read very
 * differently, so each gets its own shape rather than one generic mapper:
 * an event is something to come to, a rota assignment is something to *do*,
 * and a date somebody is named on is somewhere to be. The prefix on the title
 * is what makes a phone's month view legible when all three are on it.
 */

/**
 * The domain part of every UID.
 *
 * A UID has to be stable across re-fetches — the same meeting, moved, rather
 * than a new meeting — and unique across every calendar a phone holds. Keying
 * it to the row id and the kind of thing gives both without a stored column.
 */
function uid(kind: string, id: string): string {
  return `${kind}-${id}@marine-team`;
}

export function eventEntry(event: {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  location: string | null;
  startsAt: Date;
  endsAt: Date | null;
  allDay: boolean;
  updatedAt: Date;
  seriesId?: string | null;
}): IcsEvent {
  return {
    uid: uid("event", event.id),
    title: event.title,
    description: event.description,
    location: event.location,
    url: siteUrl(`/events/${event.slug}`),
    start: event.startsAt,
    end: event.endsAt,
    allDay: event.allDay,
    updatedAt: event.updatedAt,
    // Groups the dates of one repeating thing without pretending they are a
    // single RRULE — see the note in ics.ts.
    relatedTo: event.seriesId ? uid("series", event.seriesId) : null,
  };
}

/**
 * A service somebody is on the rota for.
 *
 * All-day, because a service plan carries a date and no time: inventing 10am
 * would be a guess that is wrong for every evening service, and an all-day
 * entry is the honest shape of "you are on, this Sunday".
 *
 * A decline is written as CANCELLED rather than left out, so that saying no
 * *removes it from the phone* of somebody who had already synced the ask.
 * Omitting it would leave the old entry sitting there for good.
 */
export function assignmentEntry(assignment: {
  id: string;
  status: string;
  position: string;
  team: { name: string };
  plan: { id: string; title: string; serviceDate: Date | null };
}): IcsEvent | null {
  if (!assignment.plan.serviceDate) return null;
  const role = assignment.position ? `${assignment.team.name} — ${assignment.position}` : assignment.team.name;
  return {
    uid: uid("assignment", assignment.id),
    title: `Serving: ${role}`,
    description: `${assignment.plan.title}${assignment.status === "INVITED" ? "\n\nYou haven't answered this yet." : ""}`,
    url: siteUrl(`/services/${assignment.plan.id}`),
    start: assignment.plan.serviceDate,
    allDay: true,
    cancelled: assignment.status === "DECLINED",
  };
}

/** A date from a rota spreadsheet that names this person. */
export function rotaEntry(event: {
  id: string;
  date: Date;
  endDate: Date | null;
  title: string | null;
  location: string | null;
  notes: string | null;
  status: string;
  startTime: string | null;
  scheduleName: string;
  role: string | null;
}): IcsEvent {
  const what = event.title ?? event.scheduleName;
  return {
    uid: uid("rota", event.id),
    title: event.role ? `${what} — ${event.role}` : what,
    description: [event.notes, event.startTime ? `From ${event.startTime}` : null].filter(Boolean).join("\n") || null,
    location: event.location,
    url: siteUrl("/calendar"),
    start: event.date,
    // A range in the source is inclusive at both ends; DTEND is exclusive, and
    // ics.ts adds the day for a single-day entry but cannot know to for a range.
    end: event.endDate ? new Date(event.endDate.getTime() + 86_400_000) : null,
    allDay: true,
    cancelled: event.status === "CANCELLED",
  };
}
