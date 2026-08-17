import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/current-user";
import { errorResponse } from "@/lib/api-guard";
import {
  clearNotifications,
  deleteNotification,
  getNotifications,
  markNotificationsRead,
} from "@/lib/inbox";

const patchSchema = z.object({
  /** Specific notifications to mark read; omit to mark the whole inbox read. */
  ids: z.array(z.string()).max(200).optional(),
});

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    return NextResponse.json(await getNotifications(user.id));
  } catch (error) {
    return errorResponse(error);
  }
}

/** Marks notifications read — the given ones, or everything unread. */
export async function PATCH(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { ids } = patchSchema.parse(await request.json().catch(() => ({})));
    await markNotificationsRead(user.id, ids);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}

/** Deletes one notification (`?id=`), or empties the inbox when no id is given. */
export async function DELETE(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const id = request.nextUrl.searchParams.get("id");
    if (id) await deleteNotification(user.id, id);
    else await clearNotifications(user.id);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
