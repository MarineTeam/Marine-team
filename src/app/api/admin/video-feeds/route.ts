import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/lib/api-guard";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { ensureCapability, ensureStaff } from "@/lib/permissions";
import { feedUnavailableReason } from "@/lib/video-feeds";

const KINDS = ["YOUTUBE_CHANNEL", "YOUTUBE_PLAYLIST", "VIMEO_USER", "VIMEO_SHOWCASE"] as const;

const createSchema = z.object({
  kind: z.enum(KINDS),
  externalId: z.string().trim().min(1).max(200),
  name: z.string().trim().min(1).max(200),
});

export async function GET() {
  try {
    const user = await ensureStaff();
    await ensureCapability(user, "manage_videos");
    const feeds = await prisma.videoFeed.findMany({
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { videos: true } } },
    });
    return NextResponse.json({
      feeds: feeds.map(({ _count, ...feed }) => ({
        ...feed,
        videoCount: _count.videos,
        // Per feed rather than site-wide: a church may have a Vimeo token and
        // no YouTube key, and the screen should say which one is missing.
        unavailable: feedUnavailableReason(feed.kind),
      })),
      series: await prisma.series.findMany({ select: { id: true, title: true }, orderBy: { title: "asc" } }),
      categories: await prisma.category.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await ensureStaff();
    await ensureCapability(user, "manage_videos");
    const body = createSchema.parse(await request.json());
    const feed = await prisma.videoFeed.create({ data: body });
    await logAudit(user.email, "create", "video-feed", feed.id, feed.name);
    return NextResponse.json(feed, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
