import type { Event, EventRegistration, Prisma, RegistrationStatus } from "@prisma/client";
import { ApiError } from "@/lib/api-guard";
import { prisma, type PrismaTransaction } from "@/lib/db";
import { notifySubscribers } from "@/lib/push";
import { uniqueSlug } from "@/lib/slug";

/**
 * Events people sign up for.
 *
 * The interesting part of this feature is not the form; it is the number. An
 * event with sixty places and sixty-one people wanting them has to give the
 * sixty-first a straight answer, and give it once — so everything that
 * decides "is there room" happens under a lock on the event row, and
 * everything that only *describes* the answer is a pure function up here that
 * a test can drive without a database.
 */

/** A registration takes a place for the person plus each guest they bring. */
export function seatsOf(registration: { guests: number }): number {
  return 1 + Math.max(0, registration.guests);
}

/** Places spoken for, counting guests. Waitlisted and cancelled rows take none. */
export function seatsTaken(
  registrations: readonly { guests: number; status: string }[],
): number {
  return registrations
    .filter((registration) => registration.status === "GOING")
    .reduce((total, registration) => total + seatsOf(registration), 0);
}

/** Places left, or null when the event has no limit. */
export function placesLeft(event: { capacity: number | null }, taken: number): number | null {
  return event.capacity === null ? null : Math.max(0, event.capacity - taken);
}

export type RegistrationState =
  | "off"
  | "not-open-yet"
  | "closed"
  | "past"
  | "open"
  | "waitlist-only"
  | "full";

/**
 * Whether sign-up is being offered, and if not, why not.
 *
 * Ordered by what somebody looking at the page most needs to hear. "This
 * already happened" beats "sign-up closed on the 3rd": both are true, and only
 * one of them tells them not to wait for it to reopen.
 */
export function registrationState(
  event: Pick<
    Event,
    "registration" | "capacity" | "waitlist" | "opensAt" | "closesAt" | "startsAt" | "endsAt"
  >,
  taken: number,
  now: Date = new Date(),
): RegistrationState {
  if (!event.registration) return "off";
  if ((event.endsAt ?? event.startsAt).getTime() < now.getTime()) return "past";
  if (event.opensAt && now < event.opensAt) return "not-open-yet";
  if (event.closesAt && now > event.closesAt) return "closed";
  const left = placesLeft(event, taken);
  if (left !== null && left <= 0) return event.waitlist ? "waitlist-only" : "full";
  return "open";
}

/** The sentence shown under the button, or in place of it. */
export function registrationMessage(state: RegistrationState, left: number | null): string {
  switch (state) {
    case "off":
      return "";
    case "past":
      return "This has already happened.";
    case "not-open-yet":
      return "Sign-up hasn't opened yet.";
    case "closed":
      return "Sign-up has closed.";
    case "full":
      return "This is full.";
    case "waitlist-only":
      return "This is full, but you can join the waiting list.";
    case "open":
      return left === null
        ? ""
        : left === 1
          ? "1 place left."
          : `${left} places left.`;
  }
}

/**
 * Which waitlisted registrations fit into the places that just freed up, in
 * the order they joined.
 *
 * **It stops at the first one that doesn't fit** rather than skipping ahead to
 * a smaller party that does. Two places free and a family of four at the front
 * of the queue means nobody moves — because passing over that family to seat
 * the couple behind them is exactly the thing people notice and rightly
 * resent. The places wait for a cancellation big enough, or an organiser
 * raises the capacity.
 */
export function promotable<T extends { guests: number }>(
  waiting: readonly T[],
  left: number | null,
): T[] {
  if (left === null) return [...waiting];
  const promoted: T[] = [];
  let room = left;
  for (const registration of waiting) {
    const seats = seatsOf(registration);
    if (seats > room) break;
    room -= seats;
    promoted.push(registration);
  }
  return promoted;
}

/** How an event's date reads on a page. */
export function eventWhen(event: Pick<Event, "startsAt" | "endsAt" | "allDay">): string {
  const day: Intl.DateTimeFormatOptions = {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  };
  const start = event.startsAt.toLocaleDateString("en-GB", day);
  const time = event.allDay
    ? ""
    : event.startsAt.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  if (!event.endsAt) return time ? `${start}, ${time}` : start;

  const sameDay = event.endsAt.toDateString() === event.startsAt.toDateString();
  if (sameDay) {
    if (event.allDay) return start;
    const end = event.endsAt.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
    return `${start}, ${time}–${end}`;
  }
  return `${start} – ${event.endsAt.toLocaleDateString("en-GB", day)}`;
}

// ---------------------------------------------------------------- reads --

/** What every public read of an event needs: the event plus its seat count. */
export type EventWithCount = Event & { taken: number; going: number };

function withCounts(
  event: Event & { registrations: { guests: number; status: string }[] },
): EventWithCount {
  return {
    ...event,
    taken: seatsTaken(event.registrations),
    going: event.registrations.filter((r) => r.status === "GOING").length,
  };
}

/** Only the columns a seat count needs, so listing events doesn't drag names along. */
const seatSelect = {
  registrations: { where: { status: "GOING" as const }, select: { guests: true, status: true } },
};

export async function listPublishedEvents(
  options: { includePast?: boolean; memberOnly?: boolean } = {},
): Promise<EventWithCount[]> {
  const events = await prisma.event.findMany({
    where: {
      published: true,
      // A member-only event simply isn't in the list for somebody with no
      // account, rather than being listed and then refusing them.
      ...(options.memberOnly ? {} : { memberOnly: false }),
      ...(options.includePast ? {} : { OR: [{ endsAt: { gte: new Date() } }, { endsAt: null, startsAt: { gte: startOfToday() } }] }),
    },
    orderBy: { startsAt: "asc" },
    include: seatSelect,
  });
  return events.map(withCounts);
}

/**
 * An all-day event on today's date is still on today, so "upcoming" counts
 * from midnight rather than from now — otherwise a coffee morning disappears
 * from the list at the moment somebody most wants to check where it is.
 */
function startOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

export async function getEventBySlug(slug: string): Promise<EventWithCount | null> {
  const event = await prisma.event.findUnique({ where: { slug }, include: seatSelect });
  return event ? withCounts(event) : null;
}

/** Somebody's own registrations, for their profile page. */
export async function listRegistrationsFor(userId: string) {
  return prisma.eventRegistration.findMany({
    where: { userId, status: { not: "CANCELLED" } },
    include: { event: true },
    orderBy: { event: { startsAt: "asc" } },
  });
}

// --------------------------------------------------------------- writes --

export type RegistrationInput = {
  name: string;
  email: string;
  phone?: string | null;
  guests?: number;
  note?: string | null;
};

/**
 * Takes the event's row lock, so two people cannot both be told they got the
 * last place.
 *
 * `SELECT … FOR UPDATE` rather than a serializable transaction: it serialises
 * sign-ups *for this one event* while leaving every other event to proceed in
 * parallel, and it can't fail with a serialisation error that would have to be
 * retried and explained.
 */
async function lockEvent(tx: PrismaTransaction, eventId: string): Promise<Event> {
  await tx.$queryRaw`SELECT "id" FROM "Event" WHERE "id" = ${eventId} FOR UPDATE`;
  const event = await tx.event.findUnique({ where: { id: eventId } });
  if (!event) throw new ApiError(404, "not_found", "That event no longer exists.");
  return event;
}

export type RegistrationOutcome = {
  registration: EventRegistration;
  status: "GOING" | "WAITLIST";
  /** True when this replaced an earlier sign-up rather than creating one. */
  updated: boolean;
};

/**
 * Sign somebody up, or move their existing sign-up.
 *
 * Everything that could change the answer — the window, the capacity, what
 * else is already booked — is read inside the lock. Reading it outside and
 * writing inside is the version of this that overbooks under load.
 */
export async function register(
  eventId: string,
  input: RegistrationInput,
  userId: string | null,
  now: Date = new Date(),
): Promise<RegistrationOutcome> {
  return prisma.$transaction(async (tx) => {
    const event = await lockEvent(tx, eventId);
    if (!event.published) throw new ApiError(404, "not_found", "That event no longer exists.");
    if (!userId && event.memberOnly) {
      throw new ApiError(403, "members_only", "You need to be signed in to register for this.");
    }

    const guests = Math.max(0, Math.trunc(input.guests ?? 0));
    if (guests > event.maxGuests) {
      throw new ApiError(
        400,
        "too_many_guests",
        event.maxGuests === 0
          ? "This event is one place per person."
          : `You can bring at most ${event.maxGuests} ${event.maxGuests === 1 ? "guest" : "guests"}.`,
      );
    }

    // An account identifies a person; without one, their email does. Both are
    // scoped to this event, so the same address may sign up for two things.
    const existing = userId
      ? await tx.eventRegistration.findUnique({ where: { eventId_userId: { eventId, userId } } })
      : await tx.eventRegistration.findFirst({
          where: { eventId, userId: null, email: input.email.toLowerCase() },
        });

    const others = await tx.eventRegistration.findMany({
      where: { eventId, status: "GOING", ...(existing ? { id: { not: existing.id } } : {}) },
      select: { guests: true, status: true },
    });
    const taken = seatsTaken(others);

    const state = registrationState(event, taken, now);
    if (state === "off") throw new ApiError(400, "no_registration", "This event doesn't take sign-ups.");
    if (state === "past") throw new ApiError(400, "past", "This has already happened.");
    if (state === "not-open-yet") throw new ApiError(400, "not_open", "Sign-up hasn't opened yet.");
    if (state === "closed") throw new ApiError(400, "closed", "Sign-up has closed.");

    const left = placesLeft(event, taken);
    const fits = left === null || left >= 1 + guests;
    if (!fits && !event.waitlist) {
      throw new ApiError(409, "full", "This is full.");
    }
    const status: RegistrationStatus = fits ? "GOING" : "WAITLIST";

    const data = {
      name: input.name.trim(),
      email: input.email.trim().toLowerCase(),
      phone: input.phone?.trim() || null,
      note: input.note?.trim() || null,
      guests,
      status,
      cancelledAt: null,
      // `promotedAt` is deliberately untouched: it records that the waiting
      // list moved somebody, and re-registering yourself is not that.
    };

    const registration = existing
      ? await tx.eventRegistration.update({ where: { id: existing.id }, data })
      : await tx.eventRegistration.create({ data: { ...data, eventId, userId } });

    return { registration, status, updated: Boolean(existing) };
  });
}

export type Promotion = { registration: EventRegistration; event: Event };

/**
 * Cancel a sign-up and hand the places on.
 *
 * The promotion happens in the same transaction as the cancellation, under the
 * same lock, because "there is a place free" and "you have it" must never be
 * two separate facts that another request can slip between.
 */
export async function cancelRegistration(
  registrationId: string,
  by: { userId: string | null; isStaff: boolean },
): Promise<{ cancelled: EventRegistration; promoted: Promotion[] }> {
  return prisma.$transaction(async (tx) => {
    const found = await tx.eventRegistration.findUnique({ where: { id: registrationId } });
    if (!found) throw new ApiError(404, "not_found", "That sign-up no longer exists.");
    if (!by.isStaff && (!by.userId || found.userId !== by.userId)) {
      throw new ApiError(403, "forbidden", "That isn't your sign-up.");
    }

    const event = await lockEvent(tx, found.eventId);
    const cancelled = await tx.eventRegistration.update({
      where: { id: registrationId },
      data: { status: "CANCELLED", cancelledAt: new Date() },
    });

    const promoted = await promoteWaitlist(tx, event);
    return { cancelled, promoted: promoted.map((registration) => ({ registration, event })) };
  });
}

/**
 * Move whoever now fits off the waiting list.
 *
 * Called under the event's lock, from cancellation and from an organiser
 * raising the capacity — the two ways places appear.
 */
export async function promoteWaitlist(
  tx: PrismaTransaction,
  event: Event,
): Promise<EventRegistration[]> {
  if (event.capacity === null && !event.waitlist) return [];

  const going = await tx.eventRegistration.findMany({
    where: { eventId: event.id, status: "GOING" },
    select: { guests: true, status: true },
  });
  const waiting = await tx.eventRegistration.findMany({
    where: { eventId: event.id, status: "WAITLIST" },
    orderBy: { createdAt: "asc" },
  });

  const moving = promotable(waiting, placesLeft(event, seatsTaken(going)));
  if (moving.length === 0) return [];

  await tx.eventRegistration.updateMany({
    where: { id: { in: moving.map((registration) => registration.id) } },
    data: { status: "GOING", promotedAt: new Date() },
  });
  return moving.map((registration) => ({ ...registration, status: "GOING" as const }));
}

/** Raising a capacity is the other way places appear, so it promotes too. */
export async function updateEvent(
  eventId: string,
  data: Prisma.EventUpdateInput,
): Promise<{ event: Event; promoted: Promotion[] }> {
  return prisma.$transaction(async (tx) => {
    await lockEvent(tx, eventId);
    const event = await tx.event.update({ where: { id: eventId }, data });
    const promoted = await promoteWaitlist(tx, event);
    return { event, promoted: promoted.map((registration) => ({ registration, event })) };
  });
}

/** A slug nothing else has taken. */
export async function nextEventSlug(title: string): Promise<string> {
  const taken = await prisma.event.findMany({ select: { slug: true } });
  return uniqueSlug(
    title,
    taken.map((event) => event.slug),
    "event",
  );
}

/**
 * Tells whoever just came off the waiting list.
 *
 * Being moved up is the one thing about a waiting list worth interrupting
 * somebody for, and it has to say the same thing whether the cancellation came
 * from the member's own page or from an organiser's. Only people with an
 * account are told: an email address typed into a public sign-up form is not
 * an address this app has agreed to write to.
 */
export async function notifyPromoted(promoted: readonly Promotion[]): Promise<void> {
  await Promise.all(
    promoted
      .filter((entry) => entry.registration.userId)
      .map((entry) =>
        notifySubscribers(
          {
            title: `A place has opened up: ${entry.event.title}`,
            body: "You've moved off the waiting list — you're in.",
            url: `/events/${entry.event.slug}`,
          },
          [entry.registration.userId as string],
        ),
      ),
  );
}
