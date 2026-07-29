import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/current-user";
import { isPluginEnabled } from "@/lib/plugins";
import { getComments } from "@/lib/content";

const querySchema = z.object({
  type: z.enum(["series", "video"]),
  id: z.string().min(1),
});

const postSchema = z.object({
  type: z.enum(["series", "video"]),
  id: z.string().min(1),
  body: z.string().trim().min(1).max(2000),
  parentId: z.string().min(1).optional(),
});

/** Public: anyone who can see the series/video's page can read its comments. */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const { type, id } = querySchema.parse({
    type: searchParams.get("type"),
    id: searchParams.get("id"),
  });

  return NextResponse.json(await getComments(type, id));
}

/** Posting a comment requires being an authorized, logged-in user. */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { type, id, body, parentId } = postSchema.parse(await request.json());

  const categoryId =
    type === "series"
      ? (await prisma.series.findUnique({ where: { id }, select: { categoryId: true } }))?.categoryId ?? null
      : (await prisma.video.findUnique({ where: { id }, select: { series: { select: { categoryId: true } } } }))
          ?.series?.categoryId ?? null;
  if (!(await isPluginEnabled("comments", categoryId))) {
    return NextResponse.json({ error: "Comments are disabled here" }, { status: 403 });
  }

  // Threading is one level deep: a reply to a reply attaches to that
  // reply's own top-level parent instead, so `replies` never nests further.
  let resolvedParentId: string | undefined;
  if (parentId) {
    const parent = await prisma.comment.findUnique({
      where: { id: parentId },
      select: { id: true, parentId: true, seriesId: true, videoId: true },
    });
    if (!parent || (type === "series" ? parent.seriesId !== id : parent.videoId !== id)) {
      return NextResponse.json({ error: "Comment not found" }, { status: 404 });
    }
    resolvedParentId = parent.parentId ?? parent.id;
  }

  const comment = await prisma.comment.create({
    data: {
      userId: user.id,
      body,
      seriesId: type === "series" ? id : undefined,
      videoId: type === "video" ? id : undefined,
      parentId: resolvedParentId,
    },
    include: { user: { select: { id: true, name: true, displayName: true, email: true, picture: true } } },
  });
  return NextResponse.json(comment, { status: 201 });
}
