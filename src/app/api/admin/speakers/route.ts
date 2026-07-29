import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { errorResponse } from "@/lib/api-guard";
import { ensureStaff, ensureCapability } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";

const speakerSchema = z.object({
  name: z.string().min(1),
  slug: z
    .string()
    .min(1)
    .regex(/^[a-z0-9-]+$/, "slug must be lowercase letters, numbers, and hyphens"),
  bio: z.string().optional().nullable(),
  photoUrl: z.string().optional().nullable(),
});

export async function GET() {
  try {
    await ensureStaff();
    const speakers = await prisma.speaker.findMany({ orderBy: { position: "asc" } });
    return NextResponse.json(speakers);
  } catch (error) {
    return errorResponse(error);
  }
}

/** The Speaker directory is global (not scoped to a category/series), so managing it needs a site-wide manage_videos grant. */
export async function POST(request: NextRequest) {
  try {
    const user = await ensureStaff();
    await ensureCapability(user, "manage_videos");
    const body = speakerSchema.parse(await request.json());
    const count = await prisma.speaker.count();
    const speaker = await prisma.speaker.create({
      data: { ...body, bio: body.bio || null, photoUrl: body.photoUrl || null, position: count },
    });
    await logAudit(user.email, "create", "speaker", speaker.id, speaker.name);
    return NextResponse.json(speaker, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
