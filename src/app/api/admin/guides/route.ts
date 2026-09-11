import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/lib/api-guard";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { nextGuideSlug } from "@/lib/guides-query";
import { ensureCapability, ensureStaff } from "@/lib/permissions";

/** Writing discussion guides. Same gate as the rest of church life. */
export const dynamic = "force-dynamic";

const createSchema = z.object({
  title: z.string().trim().min(1).max(200),
  seriesId: z.string().max(60).nullish(),
  videoId: z.string().max(60).nullish(),
});

export async function GET() {
  try {
    const user = await ensureStaff();
    await ensureCapability(user, "manage_events");
    const guides = await prisma.discussionGuide.findMany({
      orderBy: { updatedAt: "desc" },
      include: { _count: { select: { items: true, meetings: true } } },
    });
    return NextResponse.json({
      guides: guides.map((guide) => ({
        id: guide.id,
        slug: guide.slug,
        title: guide.title,
        published: guide.published,
        items: guide._count.items,
        usedBy: guide._count.meetings,
      })),
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await ensureStaff();
    await ensureCapability(user, "manage_events");
    const body = createSchema.parse(await request.json());
    const guide = await prisma.discussionGuide.create({
      data: {
        title: body.title,
        slug: await nextGuideSlug(body.title),
        seriesId: body.seriesId ?? null,
        videoId: body.videoId ?? null,
      },
    });
    await logAudit(user.email, "create", "discussion-guide", guide.id, guide.title);
    return NextResponse.json({ guide }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
