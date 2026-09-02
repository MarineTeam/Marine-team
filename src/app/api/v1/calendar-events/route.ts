import { prisma } from "@/lib/db";
import { fromIsoDate, isIsoDate, toIsoDate } from "@/lib/dates";
import { ok, pageArgs, pageFrom, pageOut, withKey } from "@/lib/api-v1";

/**
 * Rota dates, with the names on each.
 *
 * These names are already on the public `/calendar` page — that is the point of
 * a rota — so this endpoint carries them. It is still behind `calendar:read`,
 * which the admin form marks as personal data, because "already public on one
 * page" and "available in bulk to a machine" are not the same exposure.
 *
 * Dates are plain calendar days, matching how they are stored and what they
 * mean: a rota date is a day, not an instant. See lib/dates.ts.
 */
export const dynamic = "force-dynamic";

export const GET = withKey("calendar:read", async ({ url }) => {
  const page = pageFrom(url);
  const scheduleId = url.searchParams.get("scheduleId");
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const window = {
    ...(from && isIsoDate(from) ? { gte: fromIsoDate(from) } : {}),
    ...(to && isIsoDate(to) ? { lte: fromIsoDate(to) } : {}),
  };

  const rows = await prisma.calendarEvent.findMany({
    where: {
      deletedAt: null,
      ...(scheduleId ? { scheduleId } : {}),
      ...(Object.keys(window).length > 0 ? { date: window } : {}),
      schedule: { deletedAt: null },
    },
    orderBy: { id: "asc" },
    ...pageArgs(page),
    select: {
      id: true,
      scheduleId: true,
      externalId: true,
      date: true,
      endDate: true,
      allDay: true,
      startTime: true,
      endTime: true,
      title: true,
      notes: true,
      location: true,
      status: true,
      origin: true,
      createdAt: true,
      updatedAt: true,
      people: {
        orderBy: { position: "asc" },
        select: { role: true, position: true, person: { select: { id: true, displayName: true } } },
      },
    },
  });

  const { rows: kept, nextCursor } = pageOut(rows, page);
  return ok(
    kept.map((row) => ({
      ...row,
      date: toIsoDate(row.date),
      endDate: row.endDate ? toIsoDate(row.endDate) : null,
      people: row.people.map((named) => ({
        personId: named.person.id,
        name: named.person.displayName,
        role: named.role,
        position: named.position,
      })),
    })),
    { nextCursor },
  );
});
