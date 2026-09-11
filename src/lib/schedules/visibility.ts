import type { CalendarEvent, Person, Snapshot } from "@/lib/schedules/types";

/**
 * Who may see the names on the rotas.
 *
 * The calendar app this module came from was built for people who never log
 * in, and it published every name on every rota to anyone with the URL. Ported
 * as-is, that sat oddly beside the rest of this app, where the directory needs
 * a member's opt-in *and* a sign-in before a name appears and a small group
 * publishes only its leaders. A rota is a list of who is at the building on
 * which days; that is not nothing.
 *
 * So the rule is now the same as everywhere else here: **the structure is
 * public, the people are for members.** Which rotas exist, on what days, with
 * what notes — anyone. Who is on them — sign in. It is enforced the way the
 * group address is: the shape handed to a signed-out reader has empty `people`
 * rather than hidden ones, so a page cannot print what it wasn't given.
 */

export type ScheduleViewer = { signedIn: boolean };

export function canSeeNames(viewer: ScheduleViewer): boolean {
  return viewer.signedIn;
}

/** The event with its people, or with none — never with names to be hidden later. */
export function visibleEvent(event: CalendarEvent, viewer: ScheduleViewer): CalendarEvent {
  if (canSeeNames(viewer)) return event;
  return { ...event, people: [] };
}

export function visibleEvents(events: readonly CalendarEvent[], viewer: ScheduleViewer): CalendarEvent[] {
  return events.map((event) => visibleEvent(event, viewer));
}

/** The people list, or nothing: there is no "choose your name" without names to choose. */
export function visiblePeople(people: readonly Person[], viewer: ScheduleViewer): Person[] {
  return canSeeNames(viewer) ? [...people] : [];
}

/**
 * A snapshot for the device, stripped for a signed-out one.
 *
 * `deleted.personIds` goes too: a signed-out device has no people to delete,
 * and an id is still a fact about who exists. The caller is expected to hand
 * a signed-out device a *full* snapshot (see the sync route), so a cache that
 * was saved while signed in is replaced rather than kept.
 */
export function visibleSnapshot(snapshot: Snapshot, viewer: ScheduleViewer): Snapshot {
  if (canSeeNames(viewer)) return snapshot;
  return {
    ...snapshot,
    people: [],
    events: visibleEvents(snapshot.events, viewer),
    deleted: { ...snapshot.deleted, personIds: [] },
  };
}

/** What a signed-out reader is told instead of the names. */
export const NAMES_WITHHELD = "Sign in to see who's on the rota.";
