import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { errorResponse } from "@/lib/api-guard";
import { ensureStaff, ensureCapability } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { isPluginEnabled } from "@/lib/plugins";
import { notifySubscribers } from "@/lib/push";

const updateSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
  embedUrl: z.string().url().optional(),
  coverImageUrl: z.string().optional().nullable(),
  startAt: z.string().optional(),
  endAt: z.string().optional().nullable(),
  published: z.boolean().optional(),
  /// Off by default on a new stream: a carol service streamed to the wider
  /// world is not automatically a place a church wants an unattended comment
  /// box. See lib/live-chat.ts for when an enabled chat is actually open.
  chatEnabled: z.boolean().optional(),
  /// Seconds between one person's messages. Raised when a stream gets busy.
  chatSlowMode: z.number().int().min(0).max(300).optional(),
});

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await ensureStaff();
    await ensureCapability(user, "manage_videos");
    const { id } = await params;
    const body = updateSchema.parse(await request.json());
    const existing = await prisma.liveStream.findUniqueOrThrow({ where: { id } });

    const stream = await prisma.liveStream.update({
      where: { id },
      data: {
        ...body,
        startAt: body.startAt ? new Date(body.startAt) : undefined,
        endAt: body.endAt === undefined ? undefined : body.endAt ? new Date(body.endAt) : null,
      },
    });
    await logAudit(user.email, "update", "live-stream", stream.id, JSON.stringify(body));
    revalidateTag("live-streams", { expire: 0 });

    const justPublished = existing.published === false && stream.published === true;
    if (justPublished && (await isPluginEnabled("live-streaming"))) {
      await notifySubscribers({
        title: "Live now",
        body: stream.title,
        url: "/live",
      });
    }

    return NextResponse.json(stream);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await ensureStaff();
    await ensureCapability(user, "manage_videos");
    const { id } = await params;
    const stream = await prisma.liveStream.findUniqueOrThrow({ where: { id } });
    await prisma.liveStream.delete({ where: { id } });
    await logAudit(user.email, "delete", "live-stream", id, stream.title);
    revalidateTag("live-streams", { expire: 0 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
