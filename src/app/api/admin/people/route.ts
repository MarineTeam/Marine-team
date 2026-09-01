import { auditLog, jsonOk, NO_STORE_HEADERS, readJsonBody, requireAdmin, withErrorHandling } from "@/lib/schedules/http";
import { prisma } from "@/lib/db";
import { createPerson } from "@/lib/schedules/admin-service";
import { createPersonSchema } from "@/lib/validation/schemas";

/**
 * GET/POST /api/admin/people
 *
 * The admin view includes inactive people and their aliases, plus how many
 * events each person appears in -- the information needed to spot and merge
 * accidental duplicates created by inconsistent spreadsheet spelling.
 */

export const dynamic = "force-dynamic";

export const GET = withErrorHandling(async () => {
  await requireAdmin();

  const people = await prisma.person.findMany({
    where: { deletedAt: null },
    include: {
      aliases: { select: { normalizedName: true } },
      _count: { select: { events: true } },
    },
    orderBy: [{ active: "desc" }, { displayName: "asc" }],
  });

  return jsonOk(
    {
      people: people.map((person) => ({
        id: person.id,
        displayName: person.displayName,
        normalizedName: person.normalizedName,
        active: person.active,
        aliases: person.aliases.map((alias) => alias.normalizedName),
        eventCount: person._count.events,
      })),
    },
    { headers: NO_STORE_HEADERS },
  );
});

export const POST = withErrorHandling(async (request: Request) => {
  const admin = await requireAdmin();
  const body = await readJsonBody(request, createPersonSchema);

  const person = await createPerson(body);
  await auditLog(admin.email, "person.create", "Person", person.id, {
    displayName: person.displayName,
  });

  return jsonOk(
    {
      person: {
        id: person.id,
        displayName: person.displayName,
        normalizedName: person.normalizedName,
        active: person.active,
        aliases: person.aliases.map((alias) => alias.normalizedName),
      },
    },
    { status: 201, headers: NO_STORE_HEADERS },
  );
});
