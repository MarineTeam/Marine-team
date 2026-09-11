import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/lib/api-guard";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { ensureCapability, ensureStaff } from "@/lib/permissions";
import { slugify } from "@/lib/slug";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  slug: z.string().trim().max(80).optional(),
  description: z.string().max(2000).nullish(),
  published: z.boolean().optional(),
  seriesId: z.string().max(60).nullish(),
  videoId: z.string().max(60).nullish(),
  /**
   * The whole list, in order. Replaced wholesale rather than patched per row:
   * a guide is a short document somebody edits as a document, and reordering
   * it by sending diffs is a worse API for the one screen that uses it.
   */
  items: z
    .array(
      z.object({
        kind: z.enum(["QUESTION", "SCRIPTURE", "NOTE", "LEADER_NOTE"]),
        body: z.string().trim().min(1).max(4000),
        reference: z.string().trim().max(200).nullish(),
      }),
    )
    .max(100)
    .optional(),
});

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await ensureStaff();
    await ensureCapability(user, "manage_events");
    const { id } = await context.params;
    const guide = await prisma.discussionGuide.findUnique({
      where: { id },
      include: { items: { orderBy: { position: "asc" } } },
    });
    if (!guide) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ guide });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await ensureStaff();
    await ensureCapability(user, "manage_events");
    const { id } = await context.params;
    const body = patchSchema.parse(await request.json());

    const guide = await prisma.$transaction(async (tx) => {
      const updated = await tx.discussionGuide.update({
        where: { id },
        data: {
          ...(body.title !== undefined ? { title: body.title } : {}),
          ...(body.slug ? { slug: slugify(body.slug) || undefined } : {}),
          ...(body.description !== undefined ? { description: body.description?.trim() || null } : {}),
          ...(body.published !== undefined ? { published: body.published } : {}),
          ...(body.seriesId !== undefined ? { seriesId: body.seriesId } : {}),
          ...(body.videoId !== undefined ? { videoId: body.videoId } : {}),
        },
      });

      if (body.items) {
        // In one transaction, so a guide is never briefly empty for whoever
        // opens it mid-save.
        await tx.discussionGuideItem.deleteMany({ where: { guideId: id } });
        await tx.discussionGuideItem.createMany({
          data: body.items.map((item, index) => ({
            guideId: id,
            kind: item.kind,
            body: item.body,
            reference: item.reference?.trim() || null,
            position: index,
          })),
        });
      }
      return updated;
    });

    await logAudit(user.email, "update", "discussion-guide", guide.id, guide.title);
    return NextResponse.json({ guide });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await ensureStaff();
    await ensureCapability(user, "manage_events");
    const { id } = await context.params;
    const guide = await prisma.discussionGuide.delete({ where: { id } });
    await logAudit(user.email, "delete", "discussion-guide", guide.id, guide.title);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
