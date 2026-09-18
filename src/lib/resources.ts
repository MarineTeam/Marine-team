import type { ResourceKind } from "@prisma/client";

/**
 * Rooms, vehicles and equipment — the rules, with no database near them.
 *
 * The whole feature is one question asked at the moment of saving: **is this
 * already booked?** Events had a free-text location and nothing stopped two of
 * them claiming the hall, which is discovered on the Saturday by two groups
 * standing in the same doorway.
 *
 * The interval is half-open — `[startsAt, endsAt)` — and that is the only
 * subtle thing here. A booking that ends at 11:00 and one that starts at 11:00
 * do not clash: back-to-back is how a hall is actually used, and a checker
 * that calls it a conflict gets switched off within a week.
 */

export type Span = { startsAt: Date; endsAt: Date };

export type Booking = Span & {
  id: string;
  resourceId: string;
  title: string;
  eventId: string | null;
};

export type ResourceRow = {
  id: string;
  name: string;
  kind: ResourceKind;
  capacity: number | null;
  active: boolean;
};

/** Whether a span is the right way round and has any duration at all. */
export function spanIsValid(span: Span): boolean {
  return (
    Number.isFinite(span.startsAt.getTime()) &&
    Number.isFinite(span.endsAt.getTime()) &&
    span.endsAt.getTime() > span.startsAt.getTime()
  );
}

/**
 * Whether two spans overlap.
 *
 * Half-open: touching at an endpoint is not an overlap. See the file comment —
 * this is the decision that makes the checker usable rather than annoying.
 */
export function overlaps(a: Span, b: Span): boolean {
  return a.startsAt.getTime() < b.endsAt.getTime() && b.startsAt.getTime() < a.endsAt.getTime();
}

/**
 * The bookings a proposed one would clash with.
 *
 * Returns them rather than a boolean: "the hall is booked" is not a useful
 * message, and "the hall is booked for Messy Church, 10:00–12:00" is.
 *
 * `ignoreId` is for editing an existing booking, which would otherwise always
 * clash with itself.
 */
export function conflictsWith(
  proposed: Span & { resourceId: string },
  existing: readonly Booking[],
  ignoreId?: string,
): Booking[] {
  return existing.filter(
    (booking) =>
      booking.resourceId === proposed.resourceId &&
      booking.id !== ignoreId &&
      overlaps(proposed, booking),
  );
}

/** What to tell somebody whose booking was refused. */
export function conflictMessage(conflicts: readonly Booking[], resourceName: string): string {
  if (conflicts.length === 0) return "";
  const when = (booking: Booking) =>
    `${booking.startsAt.toISOString().slice(11, 16)}–${booking.endsAt.toISOString().slice(11, 16)}`;
  const [first] = conflicts;
  const rest = conflicts.length - 1;
  return `${resourceName} is already booked for ${first.title}, ${when(first)}${
    rest > 0 ? ` (and ${rest} other${rest === 1 ? "" : "s"})` : ""
  }.`;
}

/**
 * Whether a room is big enough, when both numbers are known.
 *
 * Advisory, never a refusal: a capacity is a fire-safety figure somebody typed
 * once, and an event's expected numbers are a guess. Refusing a booking on two
 * soft numbers is how people stop recording either.
 */
export function capacityWarning(resource: ResourceRow, expected: number | null): string | null {
  if (resource.capacity === null || expected === null || expected <= resource.capacity) return null;
  return `${resource.name} holds ${resource.capacity}; you're expecting ${expected}.`;
}

/** Bookings in the order a day reads. */
export function inTimeOrder(bookings: readonly Booking[]): Booking[] {
  return [...bookings].sort(
    (a, b) => a.startsAt.getTime() - b.startsAt.getTime() || a.title.localeCompare(b.title),
  );
}

/** What is booked on one day, for the diary view. */
export function onDay(bookings: readonly Booking[], day: Date): Booking[] {
  const from = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate()));
  const to = new Date(from.getTime() + 86_400_000);
  return inTimeOrder(bookings.filter((booking) => overlaps(booking, { startsAt: from, endsAt: to })));
}

/** The label a resource reads as in a list. */
export function describeResource(resource: ResourceRow): string {
  const kind = resource.kind === "ROOM" ? "" : ` · ${resource.kind.toLowerCase()}`;
  const size = resource.capacity === null ? "" : ` · holds ${resource.capacity}`;
  return `${resource.name}${kind}${size}`;
}
