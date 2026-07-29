import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { errorResponse } from "@/lib/api-guard";
import { ensureStaff, ensureCategoryAccess, getEditableScope, descendantCategoryIds } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";

const seriesSchema = z.object({
  title: z.string().min(1),
  slug: z
    .string()
    .min(1)
    .regex(/^[a-z0-9-]+$/, "slug must be lowercase letters, numbers, and hyphens"),
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
});

function normalizeSeriesData(body: z.infer<typeof seriesSchema>) {
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

export async function GET() {
  try {
    const user = await ensureStaff();
    const scope = await getEditableScope(user);
    const where = scope.isAdmin
      ? {}
      : {
          OR: [
            { id: { in: scope.seriesIds } },
            { categoryId: { in: await descendantCategoryIds(scope.categoryIds) } },
          ],
        };
    const series = await prisma.series.findMany({
      where,
      orderBy: [{ pinned: "desc" }, { position: "asc" }],
      include: { category: true, _count: { select: { videos: true, files: true } } },
    });
    return NextResponse.json(series);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await ensureStaff();
    const body = seriesSchema.parse(await request.json());
    if (user.role !== "ADMIN") {
      if (!body.categoryId) {
        return NextResponse.json({ error: "Choose a category" }, { status: 400 });
      }
      await ensureCategoryAccess(user, body.categoryId);
    }
    const series = await prisma.series.create({ data: normalizeSeriesData(body) });
    await logAudit(user.email, "create", "series", series.id, series.title);
    revalidateTag("series", { expire: 0 });
    return NextResponse.json(series, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
