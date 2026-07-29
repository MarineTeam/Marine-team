import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { errorResponse } from "@/lib/api-guard";
import { ensureStaff, ensureSeriesAccess, ensureCategoryAccess } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { fireWebhooks } from "@/lib/webhooks";
import { recordSlugAlias } from "@/lib/content";

export const updateSchema = z.object({
  title: z.string().min(1).optional(),
  slug: z
    .string()
    .min(1)
    .regex(/^[a-z0-9-]+$/)
    .optional(),
  description: z.string().optional(),
  coverImageUrl: z.string().url().optional().or(z.literal("")),
  categoryId: z.string().optional().nullable(),
  memberOnly: z.boolean().optional(),
  hidden: z.boolean().optional(),
  published: z.boolean().optional(),
  publishAt: z.string().nullable().optional(),
  unpublishAt: z.string().nullable().optional(),
  featured: z.boolean().optional(),
  pinned: z.boolean().optional(),
  tags: z.array(z.string().min(1)).optional(),
  position: z.number().int().optional(),
  requireSequential: z.boolean().optional(),
});

function normalizeSeriesData(body: z.infer<typeof updateSchema>) {
  return {
    ...body,
    tags: body.tags?.map((t) => t.trim().toLowerCase()).filter(Boolean),
    publishAt:
      body.publishAt === undefined ? undefined : body.publishAt === null ? null : new Date(body.publishAt),
    unpublishAt:
      body.unpublishAt === undefined
        ? undefined
        : body.unpublishAt === null
          ? null
          : new Date(body.unpublishAt),
  };
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await ensureStaff();
    const { id } = await params;
    const series = await prisma.series.findUniqueOrThrow({
      where: { id },
      include: {
        category: true,
        videos: { orderBy: { position: "asc" } },
        files: { orderBy: { position: "asc" } },
      },
    });
    await ensureSeriesAccess(user, series);
    return NextResponse.json(series);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await ensureStaff();
    const { id } = await params;
    const existing = await prisma.series.findUniqueOrThrow({ where: { id } });
    await ensureSeriesAccess(user, existing);
    const body = updateSchema.parse(await request.json());
    if (body.categoryId !== undefined && user.role !== "ADMIN") {
      if (body.categoryId === null) {
        return NextResponse.json({ error: "Choose a category" }, { status: 400 });
      }
      await ensureCategoryAccess(user, body.categoryId);
    }
    const series = await prisma.series.update({ where: { id }, data: normalizeSeriesData(body) });
    await logAudit(user.email, "update", "series", series.id, JSON.stringify(body));
    revalidateTag("series", { expire: 0 });
    if (body.slug) await recordSlugAlias("SERIES", existing.slug, body.slug, series.id);

    if (existing.published === false && series.published === true) {
      await fireWebhooks("series.published", {
        id: series.id,
        title: series.title,
        slug: series.slug,
        url: `/series/${series.slug}`,
      });
    }

    return NextResponse.json(series);
  } catch (error) {
    return errorResponse(error);
  }
}

/** Soft delete — moves the series to /admin/trash instead of removing it, so it can be restored. */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await ensureStaff();
    const { id } = await params;
    const existing = await prisma.series.findUniqueOrThrow({ where: { id } });
    await ensureSeriesAccess(user, existing);
    await prisma.series.update({ where: { id }, data: { deletedAt: new Date() } });
    await logAudit(user.email, "trash", "series", id, existing.title);
    revalidateTag("series", { expire: 0 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
