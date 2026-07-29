import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/lib/api-guard";
import { ensureStaff } from "@/lib/permissions";
import { applyFileUpdate, removeFile } from "@/app/api/admin/files/[id]/route";

const bulkSchema = z.object({
  ids: z.array(z.string().min(1)).min(1),
  action: z.union([z.literal("publish"), z.literal("unpublish"), z.literal("delete")]),
});

/**
 * One request for an admin's "apply to every selected file" action, instead
 * of the client firing one PATCH/DELETE per selected row (previously
 * bulkSetPublished/bulkDelete in file-manager.tsx).
 */
export async function POST(request: NextRequest) {
  try {
    const user = await ensureStaff();
    const { ids, action } = bulkSchema.parse(await request.json());
    if (action === "delete") {
      await Promise.all(ids.map((id) => removeFile(user, id)));
    } else {
      await Promise.all(ids.map((id) => applyFileUpdate(user, id, { published: action === "publish" })));
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
