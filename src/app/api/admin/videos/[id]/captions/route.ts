import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { errorResponse } from "@/lib/api-guard";
import { ensureStaff, ensureContentAccess } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { bunnyAddCaption, bunnyDeleteCaption, bunnyGetStreamVideo } from "@/lib/bunny";

// Bunny's caption files are short text tracks, nowhere near the thumbnail
// image upload's size, but capped for the same request-body reason.
const MAX_CAPTION_BYTES = 1 * 1024 * 1024;

async function loadVideo(id: string) {
  const user = await ensureStaff();
  const video = await prisma.video.findUniqueOrThrow({ where: { id } });
  await ensureContentAccess(user, { seriesId: video.seriesId, categoryId: video.categoryId });
  return { user, video };
}

/** Current caption tracks for a video, read live from Bunny (source of truth — nothing is cached in our DB). */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { video } = await loadVideo(id);
    const bunnyVideo = await bunnyGetStreamVideo(video.bunnyVideoId);
    return NextResponse.json({ captions: bunnyVideo.captions ?? [] });
  } catch (error) {
    return errorResponse(error);
  }
}

/** Adds (or replaces, by srclang) a caption track from an uploaded .vtt/.srt file. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { user, video } = await loadVideo(id);

    const form = await request.formData();
    const file = form.get("file");
    const srclang = form.get("srclang");
    const label = form.get("label");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Missing captions file" }, { status: 400 });
    }
    if (typeof srclang !== "string" || srclang.trim().length === 0) {
      return NextResponse.json({ error: "Missing srclang (e.g. \"en\")" }, { status: 400 });
    }
    if (file.size > MAX_CAPTION_BYTES) {
      return NextResponse.json(
        { error: `Captions file exceeds ${MAX_CAPTION_BYTES / 1024 / 1024}MB upload limit` },
        { status: 400 },
      );
    }

    const text = await file.text();
    await bunnyAddCaption(video.bunnyVideoId, srclang.trim(), typeof label === "string" && label.trim() ? label.trim() : srclang.trim(), text);
    await logAudit(user.email, "update", "video", video.id, `add caption (${srclang})`);

    const bunnyVideo = await bunnyGetStreamVideo(video.bunnyVideoId);
    return NextResponse.json({ captions: bunnyVideo.captions ?? [] });
  } catch (error) {
    return errorResponse(error);
  }
}

/** Removes a caption track by srclang (?srclang=en). */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { user, video } = await loadVideo(id);
    const srclang = request.nextUrl.searchParams.get("srclang");
    if (!srclang) return NextResponse.json({ error: "Missing srclang" }, { status: 400 });

    await bunnyDeleteCaption(video.bunnyVideoId, srclang);
    await logAudit(user.email, "update", "video", video.id, `delete caption (${srclang})`);

    const bunnyVideo = await bunnyGetStreamVideo(video.bunnyVideoId);
    return NextResponse.json({ captions: bunnyVideo.captions ?? [] });
  } catch (error) {
    return errorResponse(error);
  }
}
