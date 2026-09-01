import { auditLog, jsonOk, NO_STORE_HEADERS, readJsonBody, requireAdmin, withErrorHandling } from "@/lib/schedules/http";
import { deletePerson, updatePerson } from "@/lib/schedules/admin-service";
import { idSchema, updatePersonSchema } from "@/lib/validation/schemas";

/** PATCH/DELETE /api/admin/people/:id */

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export const PATCH = withErrorHandling(async (request: Request, context: Context) => {
  const admin = await requireAdmin();
  const personId = idSchema.parse((await context.params).id);
  const body = await readJsonBody(request, updatePersonSchema);

  const person = await updatePerson(personId, body);
  await auditLog(admin.email, "person.update", "Person", personId, { fields: Object.keys(body) });

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

export const DELETE = withErrorHandling(async (_request: Request, context: Context) => {
  const admin = await requireAdmin();
  const personId = idSchema.parse((await context.params).id);

  // Soft delete: the person's history on past events stays intact, and offline
  // clients learn to drop them from the name picker on their next sync.
  await deletePerson(personId);
  await auditLog(admin.email, "person.delete", "Person", personId);

  return jsonOk({ ok: true }, { headers: NO_STORE_HEADERS });
});
