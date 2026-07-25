import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/current-user";

const querySchema = z.object({
  type: z.enum(["series", "video"]),
  id: z.string().min(1),
});

const postSchema = z.object({
  type: z.enum(["series", "video"]),
  id: z.string().min(1),
  body: z.string().trim().min(1).max(2000),
});

/** Public: anyone who can see the series/video's page can read its comments. */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const { type, id } = querySchema.parse({
    type: searchParams.get("type"),
    id: searchParams.get("id"),
  });

  const comments = await prisma.comment.findMany({
    where: type === "series" ? { seriesId: id } : { videoId: id },
    include: { user: { select: { id: true, name: true, email: true, picture: true } } },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(comments);
}

/** Posting a comment requires being an authorized, logged-in user. */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { type, id, body } = postSchema.parse(await request.json());
  const comment = await prisma.comment.create({
    data: {
      userId: user.id,
      body,
      seriesId: type === "series" ? id : undefined,
      videoId: type === "video" ? id : undefined,
    },
    include: { user: { select: { id: true, name: true, email: true, picture: true } } },
  });
  return NextResponse.json(comment, { status: 201 });
}
