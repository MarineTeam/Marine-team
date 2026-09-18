import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/lib/api-guard";
import { logAudit } from "@/lib/audit";
import { isPluginEnabled } from "@/lib/plugins";
import { requireDiaryAccess, updateResource } from "@/lib/resources-query";

export const dynamic = "force-dynamic";

const schema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  kind: z.enum(["ROOM", "VEHICLE", "EQUIPMENT"]).optional(),
  capacity: z.number().int().min(0).max(100000).nullish(),
  notes: z.string().max(1000).nullish(),
  active: z.boolean().optional(),
});

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    if (!(await isPluginEnabled("resources"))) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const user = await requireDiaryAccess();
    const { id } = await context.params;
    const resource = await updateResource(id, schema.parse(await request.json()));
    await logAudit(user.email, "update", "resource", id, resource.name);
    return NextResponse.json(resource);
  } catch (error) {
    return errorResponse(error);
  }
}
