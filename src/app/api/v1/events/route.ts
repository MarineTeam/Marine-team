import { prisma } from "@/lib/db";
import { seatsTaken } from "@/lib/events";
import { ok, pageArgs, pageFrom, pageOut, updatedSince, withKey } from "@/lib/api-v1";

/**
 * Events, with how full each one is — and no names.
 *
 * The counts are here because "is there room" is the question a noticeboard or
 * a website asks, and answering it does not require knowing who is coming.
 * Names live behind `events:registrations`, which is a scope somebody has to
 * grant on purpose.
 */
export const dynamic = "force-dynamic";

export const GET = withKey("events:read", async ({ url }) => {
  const page = pageFrom(url);
  const since = updatedSince(url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const window = {
    ...(from && !Number.isNaN(Date.parse(from)) ? { gte: new Date(from) } : {}),
    ...(to && !Number.isNaN(Date.parse(to)) ? { lte: new Date(to) } : {}),
  };

  const rows = await prisma.event.findMany({
    where: {
      ...(Object.keys(window).length > 0 ? { startsAt: window } : {}),
      ...(since ? { updatedAt: { gte: since } } : {}),
    },
    orderBy: { id: "asc" },
    ...pageArgs(page),
    select: {
      id: true,
      slug: true,
      title: true,
      description: true,
      location: true,
      startsAt: true,
      endsAt: true,
      allDay: true,
      published: true,
      memberOnly: true,
      registration: true,
      capacity: true,
      waitlist: true,
      opensAt: true,
      closesAt: true,
      maxGuests: true,
      seriesId: true,
      occurrenceDate: true,
      createdAt: true,
      updatedAt: true,
      registrations: { select: { guests: true, status: true } },
    },
  });

  const { rows: kept, nextCursor } = pageOut(rows, page);
  return ok(
    kept.map(({ registrations, ...event }) => ({
      ...event,
      placesTaken: seatsTaken(registrations),
      going: registrations.filter((row) => row.status === "GOING").length,
      waiting: registrations.filter((row) => row.status === "WAITLIST").length,
    })),
    { nextCursor },
  );
});
