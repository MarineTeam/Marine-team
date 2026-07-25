import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/current-user";
import { isPluginEnabled } from "@/lib/plugins";
import {
  getSeriesRatingSummary,
  getVideoRatingSummary,
  getUserSeriesRating,
  getUserVideoRating,
} from "@/lib/content";

const querySchema = z.object({ type: z.enum(["series", "video"]), id: z.string().min(1) });
const postSchema = z.object({
  type: z.enum(["series", "video"]),
  id: z.string().min(1),
  value: z.number().int().min(1).max(5),
});

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const { type, id } = querySchema.parse({
    type: searchParams.get("type"),
    id: searchParams.get("id"),
  });
  const user = await getCurrentUser();

  const summary = type === "series" ? await getSeriesRatingSummary(id) : await getVideoRatingSummary(id);
  const mine = user
    ? type === "series"
      ? await getUserSeriesRating(user.id, id)
      : await getUserVideoRating(user.id, id)
    : null;

  return NextResponse.json({ ...summary, mine });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { type, id, value } = postSchema.parse(await request.json());

  const categoryId =
    type === "series"
      ? (await prisma.series.findUnique({ where: { id }, select: { categoryId: true } }))?.categoryId ?? null
      : (await prisma.video.findUnique({ where: { id }, select: { series: { select: { categoryId: true } } } }))
          ?.series?.categoryId ?? null;
  if (!(await isPluginEnabled("ratings", categoryId))) {
    return NextResponse.json({ error: "Ratings are disabled here" }, { status: 403 });
  }

  if (type === "series") {
    await prisma.rating.upsert({
      where: { userId_seriesId: { userId: user.id, seriesId: id } },
      create: { userId: user.id, seriesId: id, value },
      update: { value },
    });
  } else {
    await prisma.rating.upsert({
      where: { userId_videoId: { userId: user.id, videoId: id } },
      create: { userId: user.id, videoId: id, value },
      update: { value },
    });
  }

  const summary = type === "series" ? await getSeriesRatingSummary(id) : await getVideoRatingSummary(id);
  return NextResponse.json({ ...summary, mine: value });
}
