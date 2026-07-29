import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { errorResponse } from "@/lib/api-guard";
import { ensureStaff, ensureCapability } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  slug: z
    .string()
    .min(1)
    .regex(/^[a-z0-9-]+$/)
    .optional(),
  bio: z.string().optional().nullable(),
  photoUrl: z.string().optional().nullable(),
  position: z.number().int().optional(),
});

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await ensureStaff();
    await ensureCapability(user, "manage_videos");
    const { id } = await params;
    const body = updateSchema.parse(await request.json());
    const speaker = await prisma.speaker.update({ where: { id }, data: body });
    await logAudit(user.email, "update", "speaker", speaker.id, JSON.stringify(body));
    return NextResponse.json(speaker);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await ensureStaff();
    await ensureCapability(user, "manage_videos");
    const { id } = await params;
    const speaker = await prisma.speaker.findUniqueOrThrow({ where: { id } });
    await prisma.speaker.delete({ where: { id } });
    await logAudit(user.email, "delete", "speaker", id, speaker.name);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
