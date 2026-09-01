import { NextRequest, NextResponse } from "next/server";
import { errorResponse } from "@/lib/api-guard";
import { logAudit } from "@/lib/audit";
import { cancelRegistration, notifyPromoted } from "@/lib/events";
import { ensureCapability, ensureStaff } from "@/lib/permissions";

/**
 * An organiser taking somebody off the list — because they phoned to say they
 * can't come, which is how most cancellations actually arrive.
 *
 * Same path as the member cancelling themselves, so the waiting list moves and
 * whoever moves up is told, whichever end it came from.
 */
export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ registrationId: string }> },
) {
  try {
    const user = await ensureStaff();
    await ensureCapability(user, "manage_events");
    const { registrationId } = await context.params;

    const { cancelled, promoted } = await cancelRegistration(registrationId, {
      userId: user.id,
      isStaff: true,
    });
    await notifyPromoted(promoted);
    await logAudit(user.email, "delete", "event-registration", cancelled.id, cancelled.name);
    return NextResponse.json({ ok: true, promoted: promoted.length });
  } catch (error) {
    return errorResponse(error);
  }
}
