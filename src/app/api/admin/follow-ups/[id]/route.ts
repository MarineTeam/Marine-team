import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/lib/api-guard";
import { isPluginEnabled } from "@/lib/plugins";
import { assignFollowUp, closeFollowUp, reopenFollowUp, requireQueueAccess } from "@/lib/follow-ups-query";

/** Picking one up, closing it, or putting it back. */
export const dynamic = "force-dynamic";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("assign"), assignedToId: z.string().min(1).max(60).nullable() }),
  z.object({
    action: z.literal("close"),
    status: z.enum(["DONE", "DISMISSED"]),
    outcome: z.string().max(2000).optional(),
  }),
  z.object({ action: z.literal("reopen") }),
]);

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    if (!(await isPluginEnabled("follow-ups"))) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const { viewer } = await requireQueueAccess();
    const { id } = await context.params;
    const body = schema.parse(await request.json());

    switch (body.action) {
      case "assign":
        return NextResponse.json(await assignFollowUp(id, body.assignedToId, viewer));
      case "close":
        return NextResponse.json(await closeFollowUp(id, body.status, body.outcome, viewer));
      case "reopen":
        return NextResponse.json(await reopenFollowUp(id, viewer));
    }
  } catch (error) {
    return errorResponse(error);
  }
}
