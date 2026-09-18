import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/lib/api-guard";
import { logAudit } from "@/lib/audit";
import { isPluginEnabled } from "@/lib/plugins";
import { requirePeopleAccess, setHouseholdOf, updatePerson } from "@/lib/households-query";

/**
 * One person's place in a family, and the details only the office keeps.
 *
 * `householdId: null` moves them out. A person belongs to at most one
 * household, so this is a move rather than an add — see the query layer.
 */
export const dynamic = "force-dynamic";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Give a date as YYYY-MM-DD");

const patchSchema = z.object({
  householdId: z.string().min(1).max(60).nullish(),
  householdRole: z.enum(["ADULT", "CHILD"]).optional(),
  dateOfBirth: isoDate.nullish(),
  medicalNotes: z.string().max(2000).nullish(),
});

export async function PATCH(request: NextRequest, context: { params: Promise<{ personId: string }> }) {
  try {
    if (!(await isPluginEnabled("households"))) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const user = await requirePeopleAccess();
    const { personId } = await context.params;
    const body = patchSchema.parse(await request.json());

    if (body.householdId !== undefined) {
      await setHouseholdOf(personId, body.householdId ?? null, body.householdRole ?? "ADULT");
    }
    const person =
      body.dateOfBirth !== undefined || body.medicalNotes !== undefined || body.householdRole !== undefined
        ? await updatePerson(personId, body)
        : null;

    await logAudit(user.email, "update", "person", personId, person?.displayName ?? null);
    return NextResponse.json({ ok: true, person });
  } catch (error) {
    return errorResponse(error);
  }
}
