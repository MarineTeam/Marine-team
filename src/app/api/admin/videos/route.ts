import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { ensureAdmin, errorResponse } from "@/lib/api-guard";
import { bunnyCreateStreamVideo, bunnyStreamTusSignature } from "@/lib/bunny";

const createSchema = z.object({
  title: z.string().min(1),
  slug: z
    .string()
    .min(1)
    .regex(/^[a-z0-9-]+$/, "slug must be lowercase letters, numbers, and hyphens"),
  seriesId: z.string().optional().nullable(),
});

export async function GET() {
  try {
    await ensureAdmin();
    const videos = await prisma.video.findMany({
      orderBy: { createdAt: "desc" },
      include: { series: true },
    });
    return NextResponse.json(videos);
  } catch (error) {
    return errorResponse(error);
  }
}

/** Creates the DB row + a placeholder in Bunny Stream, then returns TUS upload credentials. */
export async function POST(request: NextRequest) {
  try {
    await ensureAdmin();
    const body = createSchema.parse(await request.json());

    const bunnyVideoId = await bunnyCreateStreamVideo(body.title);
    const video = await prisma.video.create({
      data: {
        title: body.title,
        slug: body.slug,
        seriesId: body.seriesId ?? null,
        bunnyVideoId,
        bunnyLibraryId: process.env.BUNNY_STREAM_LIBRARY_ID!,
      },
    });

    const upload = bunnyStreamTusSignature(bunnyVideoId);
    return NextResponse.json({ video, upload }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
