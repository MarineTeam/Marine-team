import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/lib/api-guard";
import { logAudit } from "@/lib/audit";
import { isPluginEnabled } from "@/lib/plugins";
import { attributeGift, requireGivingAccess } from "@/lib/giving-query";

/** Attaching an anonymous gift to whoever turns out to have given it. */
export const dynamic = "force-dynamic";

const patchSchema = z.object({ giverId: z.string().min(1).max(60).nullable() });

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    if (!(await isPluginEnabled("giving"))) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const user = await requireGivingAccess();
    const { id } = await context.params;
    const { giverId } = patchSchema.parse(await request.json());
    const gift = await attributeGift(id, giverId);
    await logAudit(user.email, "update", "gift", id, giverId ? `attributed to ${giverId}` : "made anonymous");
    return NextResponse.json(gift);
  } catch (error) {
    return errorResponse(error);
  }
}
