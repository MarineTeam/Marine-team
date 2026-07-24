import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ensureAdmin, errorResponse } from "@/lib/api-guard";
import { getTargetDb } from "@/lib/admin-target";

const updateSchema = z.object({
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
  published: z.boolean().optional(),
  position: z.number().int().optional(),
});

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await ensureAdmin();
    const prisma = getTargetDb(request);
    const { id } = await params;
    const series = await prisma.series.findUniqueOrThrow({
      where: { id },
      include: {
        category: true,
        videos: { orderBy: { position: "asc" } },
        files: { orderBy: { position: "asc" } },
      },
    });
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
    await ensureAdmin();
    const prisma = getTargetDb(request);
    const { id } = await params;
    const body = updateSchema.parse(await request.json());
    const series = await prisma.series.update({ where: { id }, data: body });
    return NextResponse.json(series);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await ensureAdmin();
    const prisma = getTargetDb(request);
    const { id } = await params;
    await prisma.series.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
