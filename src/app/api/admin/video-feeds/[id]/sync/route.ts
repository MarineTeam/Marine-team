import { NextRequest, NextResponse } from "next/server";
import { errorResponse } from "@/lib/api-guard";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { ensureCapability, ensureStaff } from "@/lib/permissions";
import { syncFeed } from "@/lib/video-feed-sync";

/** "Import now", for somebody who has just added a feed and wants to see it work. */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await ensureStaff();
    await ensureCapability(user, "manage_videos");
    const { id } = await context.params;

    const feed = await prisma.videoFeed.findUnique({ where: { id } });
    if (!feed) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const outcome = await syncFeed(feed);
    await logAudit(user.email, "update", "video-feed", id, `sync: ${outcome.status}`);
    return NextResponse.json(outcome);
  } catch (error) {
    return errorResponse(error);
  }
}
