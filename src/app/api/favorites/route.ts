import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/current-user";

const schema = z.object({
  type: z.enum(["series", "video"]),
  id: z.string().min(1),
});

/** Toggles a logged-in user's bookmark of a series or video on/off, returning the new state. */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { type, id } = schema.parse(await request.json());

  if (type === "series") {
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
