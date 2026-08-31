import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/current-user";
import { isPluginEnabled } from "@/lib/plugins";

const schema = z.object({
  type: z.enum(["series", "video", "file"]),
  id: z.string().min(1),
});

/**
 * Toggles a logged-in user's bookmark of a series, video or file on/off,
 * returning the new state.
 *
 * A file is usually a hymn, which is the one people most want a list of —
 * and, like the other two, it answers to the favourites plugin as its own
 * section has it set.
 */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { type, id } = schema.parse(await request.json());

  if (type === "series") {
    const series = await prisma.series.findUnique({ where: { id }, select: { categoryId: true } });
    if (!series) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (!(await isPluginEnabled("favorites", series.categoryId))) {
      return NextResponse.json({ error: "Favorites are disabled here" }, { status: 403 });
    }
    const existing = await prisma.seriesFavorite.findUnique({
      where: { userId_seriesId: { userId: user.id, seriesId: id } },
    });
    if (existing) {
      await prisma.seriesFavorite.delete({ where: { id: existing.id } });
      return NextResponse.json({ favorited: false });
    }
    await prisma.seriesFavorite.create({ data: { userId: user.id, seriesId: id } });
    return NextResponse.json({ favorited: true });
  }

  if (type === "file") {
    const file = await prisma.fileAsset.findUnique({
      where: { id },
      select: { categoryId: true, series: { select: { categoryId: true } } },
    });
    if (!file) return NextResponse.json({ error: "Not found" }, { status: 404 });
    // A file hangs off either a series or a category; the plugin is scoped to
    // whichever it is (see getPluginStates).
    if (!(await isPluginEnabled("favorites", file.categoryId ?? file.series?.categoryId ?? null))) {
      return NextResponse.json({ error: "Favorites are disabled here" }, { status: 403 });
    }
    const existing = await prisma.fileFavorite.findUnique({
      where: { userId_fileId: { userId: user.id, fileId: id } },
    });
    if (existing) {
      await prisma.fileFavorite.delete({ where: { id: existing.id } });
      return NextResponse.json({ favorited: false });
    }
    await prisma.fileFavorite.create({ data: { userId: user.id, fileId: id } });
    return NextResponse.json({ favorited: true });
  }

  const video = await prisma.video.findUnique({
    where: { id },
    select: { series: { select: { categoryId: true } } },
  });
  if (!video) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!(await isPluginEnabled("favorites", video.series?.categoryId ?? null))) {
    return NextResponse.json({ error: "Favorites are disabled here" }, { status: 403 });
  }

  const existing = await prisma.videoFavorite.findUnique({
    where: { userId_videoId: { userId: user.id, videoId: id } },
  });
  if (existing) {
    await prisma.videoFavorite.delete({ where: { id: existing.id } });
    return NextResponse.json({ favorited: false });
  }
  await prisma.videoFavorite.create({ data: { userId: user.id, videoId: id } });
  return NextResponse.json({ favorited: true });
}
