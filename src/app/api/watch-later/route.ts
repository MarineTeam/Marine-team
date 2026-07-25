import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/current-user";
import { isPluginEnabled } from "@/lib/plugins";

const schema = z.object({
  type: z.enum(["series", "video"]),
  id: z.string().min(1),
});

/** Toggles a logged-in user's Watch Later queue entry for a series or video, returning the new state. */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { type, id } = schema.parse(await request.json());

  if (type === "series") {
    const series = await prisma.series.findUnique({ where: { id }, select: { categoryId: true } });
    if (!series) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (!(await isPluginEnabled("watch-later", series.categoryId))) {
      return NextResponse.json({ error: "Watch Later is disabled here" }, { status: 403 });
    }
    const existing = await prisma.seriesWatchLater.findUnique({
      where: { userId_seriesId: { userId: user.id, seriesId: id } },
    });
    if (existing) {
      await prisma.seriesWatchLater.delete({ where: { id: existing.id } });
      return NextResponse.json({ queued: false });
    }
    await prisma.seriesWatchLater.create({ data: { userId: user.id, seriesId: id } });
    return NextResponse.json({ queued: true });
  }

  const video = await prisma.video.findUnique({
    where: { id },
    select: { series: { select: { categoryId: true } } },
  });
  if (!video) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!(await isPluginEnabled("watch-later", video.series?.categoryId ?? null))) {
    return NextResponse.json({ error: "Watch Later is disabled here" }, { status: 403 });
  }

  const existing = await prisma.videoWatchLater.findUnique({
    where: { userId_videoId: { userId: user.id, videoId: id } },
  });
  if (existing) {
    await prisma.videoWatchLater.delete({ where: { id: existing.id } });
    return NextResponse.json({ queued: false });
  }
  await prisma.videoWatchLater.create({ data: { userId: user.id, videoId: id } });
  return NextResponse.json({ queued: true });
}
