import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/current-user";
import { isPluginEnabled } from "@/lib/plugins";
import {
  getSeriesReactionSummary,
  getVideoReactionSummary,
  getUserSeriesReaction,
  getUserVideoReaction,
} from "@/lib/content";

const querySchema = z.object({ type: z.enum(["series", "video"]), id: z.string().min(1) });
const postSchema = z.object({
  type: z.enum(["series", "video"]),
  id: z.string().min(1),
  value: z.enum(["LIKE", "DISLIKE"]).nullable(),
});

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const { type, id } = querySchema.parse({
    type: searchParams.get("type"),
    id: searchParams.get("id"),
  });
  const user = await getCurrentUser();

  const summary = type === "series" ? await getSeriesReactionSummary(id) : await getVideoReactionSummary(id);
  const mine = user
    ? type === "series"
      ? await getUserSeriesReaction(user.id, id)
      : await getUserVideoReaction(user.id, id)
    : null;

  return NextResponse.json({ ...summary, mine });
}

/** Sets, changes, or clears (value: null) a logged-in user's like/dislike on a series or video. */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { type, id, value } = postSchema.parse(await request.json());

  const categoryId =
    type === "series"
      ? (await prisma.series.findUnique({ where: { id }, select: { categoryId: true } }))?.categoryId ?? null
      : (await prisma.video.findUnique({ where: { id }, select: { series: { select: { categoryId: true } } } }))
          ?.series?.categoryId ?? null;
  if (!(await isPluginEnabled("likes-dislikes", categoryId))) {
    return NextResponse.json({ error: "Likes/dislikes are disabled here" }, { status: 403 });
  }

  if (value === null) {
    if (type === "series") {
      await prisma.reaction.deleteMany({ where: { userId: user.id, seriesId: id } });
    } else {
      await prisma.reaction.deleteMany({ where: { userId: user.id, videoId: id } });
    }
  } else if (type === "series") {
    await prisma.reaction.upsert({
      where: { userId_seriesId: { userId: user.id, seriesId: id } },
      create: { userId: user.id, seriesId: id, type: value },
      update: { type: value },
    });
  } else {
    await prisma.reaction.upsert({
      where: { userId_videoId: { userId: user.id, videoId: id } },
      create: { userId: user.id, videoId: id, type: value },
      update: { type: value },
    });
  }

  const summary = type === "series" ? await getSeriesReactionSummary(id) : await getVideoReactionSummary(id);
  return NextResponse.json({ ...summary, mine: value });
}
