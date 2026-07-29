import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/lib/api-guard";
import { ensureStaff } from "@/lib/permissions";
import { applyVideoUpdate, removeVideo } from "@/app/api/admin/videos/[id]/route";

const bulkSchema = z.object({
  ids: z.array(z.string().min(1)).min(1),
  action: z.union([z.literal("publish"), z.literal("unpublish"), z.literal("delete"), z.literal("schedule")]),
  // Required (and only used) when action is "schedule".
  publishAt: z.string().optional(),
});

/**
 * One request for an admin's "apply to every selected video" action, instead
 * of the client firing one PATCH/DELETE per selected row (previously
 * bulkSetPublished/bulkDelete in video-manager.tsx). "schedule" sets
 * published + a future publishAt across the whole selection at once, instead
 * of setting it one video at a time.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await ensureStaff();
    const { ids, action, publishAt } = bulkSchema.parse(await request.json());
    if (action === "delete") {
      await Promise.all(ids.map((id) => removeVideo(user, id)));
    } else if (action === "schedule") {
      if (!publishAt) {
        return NextResponse.json({ error: "publishAt is required to schedule" }, { status: 400 });
      }
      await Promise.all(ids.map((id) => applyVideoUpdate(user, id, { published: true, publishAt })));
    } else {
      await Promise.all(ids.map((id) => applyVideoUpdate(user, id, { published: action === "publish" })));
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
