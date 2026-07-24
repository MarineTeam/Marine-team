import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { ensureAdmin, errorResponse } from "@/lib/api-guard";

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  slug: z
    .string()
    .min(1)
    .regex(/^[a-z0-9-]+$/)
    .optional(),
  position: z.number().int().optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await ensureAdmin();
    const { id } = await params;
    const body = updateSchema.parse(await request.json());
    const category = await prisma.category.update({ where: { id }, data: body });
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
    await ensureAdmin();
    const { id } = await params;
    await prisma.category.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
