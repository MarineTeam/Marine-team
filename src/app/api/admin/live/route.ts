import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { errorResponse } from "@/lib/api-guard";
import { ensureStaff, ensureCapability } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";

const createSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional().nullable(),
  embedUrl: z.string().url(),
  coverImageUrl: z.string().optional().nullable(),
  startAt: z.string(),
  endAt: z.string().optional().nullable(),
  published: z.boolean().optional(),
});

export async function GET() {
  try {
    await ensureStaff();
    const streams = await prisma.liveStream.findMany({ orderBy: { startAt: "desc" } });
    return NextResponse.json(streams);
  } catch (error) {
    return errorResponse(error);
  }
}

/** Live streams are global (not scoped to a category/series), so managing them needs a site-wide manage_videos grant. */
export async function POST(request: NextRequest) {
  try {
    const user = await ensureStaff();
    await ensureCapability(user, "manage_videos");
    const body = createSchema.parse(await request.json());
    const stream = await prisma.liveStream.create({
      data: {
        title: body.title,
        description: body.description || null,
        embedUrl: body.embedUrl,
        coverImageUrl: body.coverImageUrl || null,
        startAt: new Date(body.startAt),
        endAt: body.endAt ? new Date(body.endAt) : null,
        published: body.published ?? false,
      },
    });
    await logAudit(user.email, "create", "live-stream", stream.id, stream.title);
    revalidateTag("live-streams", { expire: 0 });
    return NextResponse.json(stream, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
