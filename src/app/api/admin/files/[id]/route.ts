import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { ensureAdmin, errorResponse } from "@/lib/api-guard";
import { bunnyStorageDelete } from "@/lib/bunny";

const updateSchema = z.object({
  title: z.string().min(1).optional(),
  seriesId: z.string().optional().nullable(),
  memberOnly: z.boolean().optional(),
  published: z.boolean().optional(),
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
    const file = await prisma.fileAsset.update({ where: { id }, data: body });
    return NextResponse.json(file);
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
    const file = await prisma.fileAsset.findUniqueOrThrow({ where: { id } });
    await bunnyStorageDelete(file.bunnyPath);
    await prisma.fileAsset.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
