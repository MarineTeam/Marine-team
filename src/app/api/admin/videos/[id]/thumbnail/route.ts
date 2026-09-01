import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { errorResponse } from "@/lib/api-guard";
import { ensureStaff, ensureContentAccess } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import {
  bunnySetStreamThumbnail,
  bunnyStorageUpload,
  bunnyStorageSignedUrl,
  bunnyGetStreamVideo,
} from "@/lib/bunny";

const urlSchema = z.object({ thumbnailUrl: z.string().url() });

// Vercel Hobby serverless functions cap request bodies at 4.5MB.
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

/**
 * Sets a video's thumbnail, either from a URL (JSON body) or an uploaded
 * image (multipart form). An upload goes to Bunny Storage first, then that
 * URL is handed to the same Bunny Stream "set thumbnail" call as the URL
 * path — so both admin choices converge on one Bunny API call.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await ensureStaff();
    const { id } = await params;
    const video = await prisma.video.findUniqueOrThrow({ where: { id } });
    // Bunny-only: an imported video's thumbnail is the source's, and this
    // route would have nothing to upload it to.
    if (!video.bunnyVideoId) {
      return NextResponse.json(
        { error: "That video isn't stored here, so its thumbnail comes from the source." },
        { status: 400 },
      );
    }
    const bunnyVideoId = video.bunnyVideoId;
    await ensureContentAccess(user, { seriesId: video.seriesId, categoryId: video.categoryId });

    const contentType = request.headers.get("content-type") ?? "";
    let sourceUrl: string;

    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const file = form.get("file");
      if (!(file instanceof File)) {
        return NextResponse.json({ error: "Missing image file" }, { status: 400 });
      }
      if (file.size > MAX_UPLOAD_BYTES) {
        return NextResponse.json(
          { error: `Image exceeds ${MAX_UPLOAD_BYTES / 1024 / 1024}MB upload limit` },
          { status: 400 },
        );
      }
      const buffer = Buffer.from(await file.arrayBuffer());
      const bunnyPath = `thumbnails/${video.id}-${crypto.randomUUID()}`;
      await bunnyStorageUpload(bunnyPath, buffer, file.type);
      // Signed, short-lived: Bunny Stream fetches this once, immediately, to
      // ingest the image — it's never stored or shown to anyone afterward.
      sourceUrl = bunnyStorageSignedUrl(bunnyPath);
    } else {
      const body = urlSchema.parse(await request.json());
      sourceUrl = body.thumbnailUrl;
    }

    await bunnySetStreamThumbnail(bunnyVideoId, sourceUrl);
    // Setting a custom thumbnail changes Bunny's stored file name, so read it
    // back rather than assuming the "thumbnail.jpg" default.
    const bunnyVideo = await bunnyGetStreamVideo(bunnyVideoId);
    const updated = await prisma.video.update({
      where: { id },
      data: { thumbnailFileName: bunnyVideo.thumbnailFileName ?? null },
    });
    await logAudit(user.email, "update", "video", video.id, "set thumbnail");
    return NextResponse.json(updated);
  } catch (error) {
    return errorResponse(error);
  }
}
