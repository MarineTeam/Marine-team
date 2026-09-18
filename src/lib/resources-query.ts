import { ApiError } from "@/lib/api-guard";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/current-user";
import { hasCapability } from "@/lib/permissions";
import {
  capacityWarning,
  conflictMessage,
  conflictsWith,
  inTimeOrder,
  spanIsValid,
  type Booking,
  type ResourceRow,
} from "@/lib/resources";
import type { ResourceKind, User } from "@prisma/client";

/**
 * Booking the hall.
 *
 * The rules are in `resources.ts`. What this file is careful about is the one
 * way a conflict check can be right in a unit test and useless in production:
 * two people saving at the same moment. The check reads, then writes; a
 * transaction with the resource's row locked is what makes those one step, so
 * the second booking sees the first rather than sitting beside it.
 */

const resourceSelect = {
  id: true,
  name: true,
  kind: true,
  capacity: true,
  notes: true,
  active: true,
  position: true,
} as const;

const bookingSelect = {
  id: true,
  resourceId: true,
  eventId: true,
  title: true,
  startsAt: true,
  endsAt: true,
  createdByEmail: true,
} as const;

export async function requireDiaryAccess(): Promise<User> {
  const user = await getCurrentUser();
  if (!user || !(await hasCapability(user, "manage_events"))) {
    throw new ApiError(404, "not_found", "Not found");
  }
  return user;
}

export async function listResources(includeClosed = true) {
  return prisma.resource.findMany({
    where: includeClosed ? {} : { active: true },
    select: resourceSelect,
    orderBy: [{ position: "asc" }, { name: "asc" }],
  });
}

export async function createResource(input: {
  name: string;
  kind?: ResourceKind;
  capacity?: number | null;
  notes?: string | null;
}) {
  const name = input.name.trim();
  if (!name) throw new ApiError(400, "no_name", "Give it a name.");
  return prisma.resource.create({
    data: {
      name,
      kind: input.kind ?? "ROOM",
      capacity: input.capacity ?? null,
      notes: input.notes?.trim() || null,
    },
    select: resourceSelect,
  });
}

export async function updateResource(
  id: string,
  input: { name?: string; kind?: ResourceKind; capacity?: number | null; notes?: string | null; active?: boolean },
) {
  return prisma.resource.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.kind !== undefined ? { kind: input.kind } : {}),
      ...(input.capacity !== undefined ? { capacity: input.capacity } : {}),
      ...(input.notes !== undefined ? { notes: input.notes?.trim() || null } : {}),
      ...(input.active !== undefined ? { active: input.active } : {}),
    },
    select: resourceSelect,
  });
}

/** What is booked in a window, for the diary. */
export async function bookingsBetween(from: Date, to: Date, resourceId?: string) {
  const rows = await prisma.resourceBooking.findMany({
    where: {
      ...(resourceId ? { resourceId } : {}),
      startsAt: { lt: to },
      endsAt: { gt: from },
    },
    select: { ...bookingSelect, resource: { select: { name: true } }, event: { select: { slug: true, title: true } } },
    orderBy: { startsAt: "asc" },
  });
  return inTimeOrder(rows as unknown as Booking[]).map(
    (booking) => rows.find((row) => row.id === booking.id)!,
  );
}

export type BookingInput = {
  resourceId: string;
  title: string;
  startsAt: Date;
  endsAt: Date;
  eventId?: string | null;
  expected?: number | null;
  byEmail: string;
};

/**
 * Books a resource, or refuses and says what it clashed with.
 *
 * The read and the write are one transaction with the resource's row locked,
 * so two people pressing save together produce one booking and one honest
 * refusal — rather than two bookings and a discovery on the Saturday.
 */
export async function book(input: BookingInput, ignoreId?: string) {
  if (!spanIsValid(input)) {
    throw new ApiError(400, "bad_span", "That finishes before it starts.");
  }

  return prisma.$transaction(async (tx) => {
    // The lock is on the resource, which is what two bookings contend for.
    await tx.$queryRaw`SELECT "id" FROM "Resource" WHERE "id" = ${input.resourceId} FOR UPDATE`;

    const resource = await tx.resource.findUnique({ where: { id: input.resourceId }, select: resourceSelect });
    if (!resource) throw new ApiError(404, "not_found", "There's no such room.");
    if (!resource.active) throw new ApiError(409, "closed", `${resource.name} isn't in use any more.`);

    const existing = await tx.resourceBooking.findMany({
      where: { resourceId: input.resourceId, startsAt: { lt: input.endsAt }, endsAt: { gt: input.startsAt } },
      select: bookingSelect,
    });

    const clashes = conflictsWith(input, existing as Booking[], ignoreId);
    if (clashes.length > 0) {
      throw new ApiError(409, "double_booked", conflictMessage(clashes, resource.name));
    }

    const booking = ignoreId
      ? await tx.resourceBooking.update({
          where: { id: ignoreId },
          data: {
            resourceId: input.resourceId,
            title: input.title.trim(),
            startsAt: input.startsAt,
            endsAt: input.endsAt,
            eventId: input.eventId ?? null,
          },
          select: bookingSelect,
        })
      : await tx.resourceBooking.create({
          data: {
            resourceId: input.resourceId,
            title: input.title.trim(),
            startsAt: input.startsAt,
            endsAt: input.endsAt,
            eventId: input.eventId ?? null,
            createdByEmail: input.byEmail,
          },
          select: bookingSelect,
        });

    // Advisory, never a refusal — see the rules for why.
    return { booking, warning: capacityWarning(resource as ResourceRow, input.expected ?? null) };
  });
}

export async function cancelBooking(id: string): Promise<void> {
  await prisma.resourceBooking.delete({ where: { id } });
}

/** What an event has booked, for its own page. */
export async function bookingsForEvent(eventId: string) {
  return prisma.resourceBooking.findMany({
    where: { eventId },
    select: { ...bookingSelect, resource: { select: { name: true, kind: true } } },
    orderBy: { startsAt: "asc" },
  });
}
