import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { errorResponse } from "@/lib/api-guard";
import { ensureStaff, ensureCapability, ensureCategoryAccess } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  slug: z
    .string()
    .min(1)
    .regex(/^[a-z0-9-]+$/)
    .optional(),
  description: z.string().optional(),
  coverImageUrl: z.string().url().optional().or(z.literal("")),
  tags: z.array(z.string().min(1)).optional(),
  memberOnly: z.boolean().optional(),
  // Tri-state: null clears the override and goes back to inheriting.
  downloadEnabled: z.boolean().nullable().optional(),
  hidden: z.boolean().optional(),
  published: z.boolean().optional(),
  publishAt: z.string().nullable().optional(),
  unpublishAt: z.string().nullable().optional(),
  featured: z.boolean().optional(),
  requireSequential: z.boolean().optional(),
  hymnalStyle: z.boolean().optional(),
  parentId: z.string().optional().nullable(),
  position: z.number().int().optional(),
  pinned: z.boolean().optional(),
});

function normalizeData(body: z.infer<typeof updateSchema>) {
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

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await ensureStaff();
    const { id } = await params;
    // Same access model as the admin category detail page (canEditCategory):
    // a CategoryEditor grant or scoped content-management group is enough to
    // edit a category's own fields, not just the stricter site-wide
    // "manage_categories" capability used for structural changes.
    await ensureCategoryAccess(user, id);
    const body = updateSchema.parse(await request.json());
    if (body.parentId === id) {
      return NextResponse.json(
        { error: "A category can't be its own parent" },
        { status: 400 },
      );
    }
    const category = await prisma.category.update({ where: { id }, data: normalizeData(body) });
    await logAudit(user.email, "update", "category", category.id, JSON.stringify(body));
    revalidateTag("categories", { expire: 0 });
    return NextResponse.json(category);
  } catch (error) {
    return errorResponse(error);
  }
}

/** Soft delete — moves the category to /admin/trash instead of removing it, so it can be restored. */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await ensureStaff();
    await ensureCapability(user, "manage_categories");
    const { id } = await params;
    const category = await prisma.category.update({ where: { id }, data: { deletedAt: new Date() } });
    await logAudit(user.email, "trash", "category", id, category.name);
    revalidateTag("categories", { expire: 0 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
