import { auditLog, jsonOk, NO_STORE_HEADERS, readJsonBody, requireAdmin, withErrorHandling } from "@/lib/schedules/http";
import { mergePeople } from "@/lib/schedules/admin-service";
import { mergePeopleSchema } from "@/lib/validation/schemas";

/**
 * POST /api/admin/people/merge
 *
 * Fixes the classic spreadsheet problem: the same person entered as "Cindy"
 * on one sheet and "Cynthia" on another. Merging moves every event link onto
 * the surviving person and records the old spelling as an alias, so the next
 * sync of the offending sheet resolves to the right person rather than
 * recreating the duplicate.
 */

export const dynamic = "force-dynamic";

export const POST = withErrorHandling(async (request: Request) => {
  const admin = await requireAdmin();
  const body = await readJsonBody(request, mergePeopleSchema);

  const person = await mergePeople(body.sourcePersonId, body.targetPersonId);
  await auditLog(admin.email, "person.merge", "Person", body.targetPersonId, {
    merged: body.sourcePersonId,
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
    { headers: NO_STORE_HEADERS },
  );
});
