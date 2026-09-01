import { NextRequest, NextResponse } from "next/server";
import { errorResponse } from "@/lib/api-guard";
import { logAudit } from "@/lib/audit";
import { materialise, sendNextBatch } from "@/lib/broadcast-send";
import { prisma } from "@/lib/db";
import { ensureCapability, ensureStaff } from "@/lib/permissions";

/**
 * Sends one batch, and says how much is left.
 *
 * The admin screen calls this in a loop, which is what gives a progress bar
 * without needing a job runner: each call is a short request that does a
 * bounded amount of work and records it. Anything left when the tab is closed
 * is picked up by the daily sweep.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await ensureStaff();
    await ensureCapability(user, "manage_users");
    const { id } = await context.params;

    const broadcast = await prisma.broadcast.findUnique({ where: { id } });
    if (!broadcast) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (broadcast.status === "CANCELLED" || broadcast.status === "SENT") {
      return NextResponse.json({ error: "That broadcast has already finished." }, { status: 409 });
    }

    // First call freezes the audience; later ones find it already frozen and
    // carry on, so a double-clicked button cannot double the list.
    const { created } = await materialise(broadcast);
    if (created > 0) {
      await logAudit(user.email, "update", "broadcast", id, `sending to ${created}`);
    }

    return NextResponse.json(await sendNextBatch(id));
  } catch (error) {
    return errorResponse(error);
  }
}
