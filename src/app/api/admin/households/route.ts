import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/lib/api-guard";
import { logAudit } from "@/lib/audit";
import { isPluginEnabled } from "@/lib/plugins";
import {
  createHousehold,
  householdViewer,
  listHouseholds,
  occasionsWithin,
  requirePeopleAccess,
  unhoused,
} from "@/lib/households-query";

/**
 * The family records.
 *
 * Gated on `manage_people` throughout — and 404, not 403, because whether this
 * church keeps household records at all is not something to confirm to
 * somebody who may not read them.
 */
export const dynamic = "force-dynamic";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Give a date as YYYY-MM-DD");

const createSchema = z.object({
  name: z.string().trim().max(120).optional(),
  address: z.string().max(500).nullish(),
  anniversary: isoDate.nullish(),
  notes: z.string().max(2000).nullish(),
  memberIds: z.array(z.string().min(1).max(60)).max(30).optional(),
});

const notFound = () => NextResponse.json({ error: "Not found" }, { status: 404 });

export async function GET(request: NextRequest) {
  try {
    if (!(await isPluginEnabled("households"))) return notFound();
    const user = await requirePeopleAccess();
    const viewer = await householdViewer(user);

    const url = new URL(request.url);
    const days = Number(url.searchParams.get("occasionDays") ?? 30);
    return NextResponse.json(
      {
        households: await listHouseholds(viewer),
        occasions: await occasionsWithin(Number.isFinite(days) ? Math.min(Math.max(days, 1), 365) : 30),
        unhoused: await unhoused(),
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!(await isPluginEnabled("households"))) return notFound();
    const user = await requirePeopleAccess();
    const body = createSchema.parse(await request.json());
    const household = await createHousehold(body);
    await logAudit(user.email, "create", "household", household.id, household.name);
    return NextResponse.json(household, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
