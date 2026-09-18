import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/lib/api-guard";
import { logAudit } from "@/lib/audit";
import { isPluginEnabled } from "@/lib/plugins";
import { bookingsBetween, createResource, listResources, requireDiaryAccess } from "@/lib/resources-query";

/** Rooms, vehicles and equipment, and what is booked this fortnight. */
export const dynamic = "force-dynamic";

const schema = z.object({
  name: z.string().trim().min(1).max(120),
  kind: z.enum(["ROOM", "VEHICLE", "EQUIPMENT"]).optional(),
  capacity: z.number().int().min(0).max(100000).nullish(),
  notes: z.string().max(1000).nullish(),
});

export async function GET(request: NextRequest) {
  try {
    if (!(await isPluginEnabled("resources"))) return NextResponse.json({ error: "Not found" }, { status: 404 });
    await requireDiaryAccess();
    const url = new URL(request.url);
    const from = new Date(url.searchParams.get("from") ?? Date.now());
    const to = new Date(url.searchParams.get("to") ?? from.getTime() + 14 * 24 * 60 * 60 * 1000);
    return NextResponse.json(
      { resources: await listResources(), bookings: await bookingsBetween(from, to) },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!(await isPluginEnabled("resources"))) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const user = await requireDiaryAccess();
    const resource = await createResource(schema.parse(await request.json()));
    await logAudit(user.email, "create", "resource", resource.id, resource.name);
    return NextResponse.json(resource, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
