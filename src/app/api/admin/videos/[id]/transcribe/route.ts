import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { errorResponse } from "@/lib/api-guard";
import { ensureStaff, ensureCapability } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { transcribeConfig } from "@/lib/transcribe";

/**
 * Asks for this video to be transcribed.
 *
 * It queues rather than transcribes: an hour of audio takes minutes, which is
 * longer than a request may live, so the work happens in
 * /api/cron/transcribe. What this route owns is the decision and the audit
 * entry.
 */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await ensureStaff();
    await ensureCapability(user, "manage_videos");
    const { id } = await params;

    if (!transcribeConfig()) {
      return NextResponse.json(
        { error: "No transcription service is configured (TRANSCRIBE_API_URL)." },
        { status: 409 },
      );
    }

    const video = await prisma.video.findUnique({
      where: { id },
      select: { id: true, title: true, transcriptStatus: true },
    });
    if (!video) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (video.transcriptStatus === "RUNNING") {
      return NextResponse.json({ error: "This one is being transcribed now." }, { status: 409 });
    }

    await prisma.video.update({
      where: { id },
      // Cleared, not kept: the queue is ordered by when a video last started,
      // and a fresh request belongs at the back rather than at its old place.
      data: { transcriptStatus: "QUEUED", transcriptError: null, transcriptStartedAt: null },
    });

    await logAudit(user.email, "queue-transcription", "video", id, video.title);
    return NextResponse.json({ ok: true, status: "QUEUED" });
  } catch (error) {
    return errorResponse(error);
  }
}
