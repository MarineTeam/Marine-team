import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/lib/api-guard";
import { logAudit } from "@/lib/audit";
import { isPluginEnabled } from "@/lib/plugins";
import {
  deleteHousehold,
  getHousehold,
  householdViewer,
  requirePeopleAccess,
  updateHousehold,
} from "@/lib/households-query";

export const dynamic = "force-dynamic";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Give a date as YYYY-MM-DD");

const patchSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  address: z.string().max(500).nullish(),
  anniversary: isoDate.nullish(),
  notes: z.string().max(2000).nullish(),
  primaryContactId: z.string().min(1).max(60).nullish(),
});

const notFound = () => NextResponse.json({ error: "Not found" }, { status: 404 });

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    if (!(await isPluginEnabled("households"))) return notFound();
    const user = await requirePeopleAccess();
    const { id } = await context.params;
    const household = await getHousehold(id, await householdViewer(user));
    if (!household) return notFound();
    return NextResponse.json(household, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    if (!(await isPluginEnabled("households"))) return notFound();
    const user = await requirePeopleAccess();
    const { id } = await context.params;
    const body = patchSchema.parse(await request.json());
    const household = await updateHousehold(id, body);
    await logAudit(user.email, "update", "household", id, household.name);
    return NextResponse.json(household);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    if (!(await isPluginEnabled("households"))) return notFound();
    const user = await requirePeopleAccess();
    const { id } = await context.params;
    // The people in it are left exactly where they were — see the query
    // layer, and the schema's SetNull, for why that is the whole point.
    await deleteHousehold(id);
    await logAudit(user.email, "delete", "household", id, null);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
