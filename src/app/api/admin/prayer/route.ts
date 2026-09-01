import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api-guard";
import { ensureCapability, ensureStaff } from "@/lib/permissions";
import { listPrayers } from "@/lib/prayer-query";

/**
 * The moderation queue.
 *
 * Uses the same read as the wall, with a moderator's viewer — so a moderator
 * sees everything, and still sees "Anonymous" where somebody asked for it. The
 * name is in the database if it is ever genuinely needed; it is not on a
 * screen that gets left open in a church office.
 */
export async function GET() {
  try {
    const user = await ensureStaff();
    await ensureCapability(user, "moderate_prayer");
    return NextResponse.json({
      requests: await listPrayers({ userId: user.id, moderates: true }, 300),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
