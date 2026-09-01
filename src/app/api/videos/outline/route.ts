import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { errorResponse } from "@/lib/api-guard";
import { getCurrentUser } from "@/lib/current-user";
import { fingerprintOutline } from "@/lib/outline";

/**
 * A member's answers to a talk's fill-in-the-blank sheet.
 *
 * Saved as they type (debounced by the panel), because the point is to be
 * filling this in during the talk — an explicit Save button is one more thing
 * to remember while listening, and forgetting it would lose the lot.
 *
 * The outline's fingerprint is taken from the *server's* copy rather than
 * trusted from the browser, so a stale tab can't stamp today's answers with
 * yesterday's version and hide the fact that the sheet changed underneath.
 */
const schema = z.object({
  videoId: z.string().min(1).max(60),
  // Keyed by the gap's position; only the ones actually filled in.
  answers: z.record(z.string().regex(/^\d{1,3}$/), z.string().max(500)),
});

export async function PUT(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Log in to keep your notes" }, { status: 401 });

    const body = schema.parse(await request.json());
    if (Object.keys(body.answers).length > 200) {
      return NextResponse.json({ error: "Too many answers" }, { status: 400 });
    }

    const video = await prisma.video.findUnique({
      where: { id: body.videoId },
      select: { id: true, noteOutline: true },
    });
    if (!video?.noteOutline) {
      return NextResponse.json({ error: "This talk has no note sheet" }, { status: 404 });
    }

    const outlineVersion = fingerprintOutline(video.noteOutline);
    await prisma.sermonOutlineAnswer.upsert({
      where: { userId_videoId: { userId: user.id, videoId: video.id } },
      create: { userId: user.id, videoId: video.id, answers: body.answers, outlineVersion },
      update: { answers: body.answers, outlineVersion },
    });

    return NextResponse.json({ ok: true, outlineVersion });
  } catch (error) {
    return errorResponse(error);
  }
}
