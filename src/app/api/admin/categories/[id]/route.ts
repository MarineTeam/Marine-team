import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { ensureAdmin, errorResponse } from "@/lib/api-guard";
import { logAudit } from "@/lib/audit";

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  slug: z
    .string()
    .min(1)
    .regex(/^[a-z0-9-]+$/)
    .optional(),
  parentId: z.string().optional().nullable(),
  position: z.number().int().optional(),
  pinned: z.boolean().optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const admin = await ensureAdmin();
    const { id } = await params;
    const body = updateSchema.parse(await request.json());
    if (body.parentId === id) {
      return NextResponse.json(
        { error: "A category can't be its own parent" },
        { status: 400 },
      );
    }
    const category = await prisma.category.update({ where: { id }, data: body });
    await logAudit(admin.email, "update", "category", category.id, JSON.stringify(body));
    return NextResponse.json(category);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const admin = await ensureAdmin();
    const { id } = await params;
    const category = await prisma.category.delete({ where: { id } });
    await logAudit(admin.email, "delete", "category", id, category.name);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
