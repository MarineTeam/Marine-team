import { prisma } from "@/lib/db";
import { fail, ok, pageArgs, pageFrom, pageOut, withKey } from "@/lib/api-v1";

/**
 * Who has signed up for one event.
 *
 * This is the personal-data endpoint: names, email addresses, phone numbers,
 * and whatever somebody wrote in the note. Its own scope, which the admin form
 * marks as personal data, and never folded into `events:read` — the difference
 * between "forty people are coming" and "here are their phone numbers" is the
 * whole of why scopes exist.
 *
 * Per event rather than a firehose, deliberately: an integration that wants one
 * door list should not be able to ask for every door list by leaving out a
 * parameter.
 */
export const dynamic = "force-dynamic";

export const GET = withKey<{ id: string }>("events:registrations", async ({ url, params }) => {
  const event = await prisma.event.findUnique({
    where: { id: params.id },
    select: { id: true, slug: true, title: true, startsAt: true },
  });
  if (!event) return fail(404, "not_found", "No such event.");

  const page = pageFrom(url);
  const rows = await prisma.eventRegistration.findMany({
    where: { eventId: event.id },
    orderBy: { id: "asc" },
    ...pageArgs(page),
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      guests: true,
      note: true,
      status: true,
      promotedAt: true,
      cancelledAt: true,
      createdAt: true,
      // Whether they have an account, without handing over the account: an
      // integration wants to know which of these are members, not to be given
      // a way to join this list to the member table.
      userId: true,
    },
  });

  const { rows: kept, nextCursor } = pageOut(rows, page);
  return ok(
    {
      event,
      registrations: kept.map(({ userId, ...row }) => ({ ...row, isMember: userId !== null })),
    },
    { nextCursor },
  );
});
