import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/lib/api-guard";
import { isPluginEnabled } from "@/lib/plugins";
import { createFollowUp, listFollowUps, requireQueueAccess } from "@/lib/follow-ups-query";

/**
 * The follow-up queue.
 *
 * Any signed-in member may ask — and is answered with what is theirs. The
 * office sees the whole queue; everybody else sees only what they hold, which
 * is why this is not gated on a capability at the door.
 */
export const dynamic = "force-dynamic";

const createSchema = z.object({
  title: z.string().trim().min(1).max(200),
  note: z.string().max(2000).nullish(),
  personId: z.string().min(1).max(60).nullish(),
  assignedToId: z.string().min(1).max(60).nullish(),
  dueOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export async function GET(request: NextRequest) {
  try {
    if (!(await isPluginEnabled("follow-ups"))) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const { viewer } = await requireQueueAccess();
    const closed = new URL(request.url).searchParams.get("closed") === "1";
    return NextResponse.json(await listFollowUps(viewer, closed), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!(await isPluginEnabled("follow-ups"))) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const { user, viewer } = await requireQueueAccess();
    if (!viewer.manages) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const body = createSchema.parse(await request.json());
    return NextResponse.json(
      await createFollowUp({ ...body, dueOn: body.dueOn as never, byEmail: user.email }),
      { status: 201 },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
