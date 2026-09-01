import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/lib/api-guard";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { ensureCapability, ensureStaff } from "@/lib/permissions";

const patchSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  externalId: z.string().trim().min(1).max(200).optional(),
  seriesId: z.string().nullish(),
  categoryId: z.string().nullish(),
  autoPublish: z.boolean().optional(),
  lookBack: z.number().int().min(1).max(50).optional(),
  enabled: z.boolean().optional(),
});

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await ensureStaff();
    await ensureCapability(user, "manage_videos");
    const { id } = await context.params;
    const body = patchSchema.parse(await request.json());

    const feed = await prisma.videoFeed.update({
      where: { id },
      data: {
        ...body,
        // Filing is mutually exclusive, the same rule a video itself follows.
        ...(body.seriesId ? { categoryId: null } : {}),
        ...(body.categoryId ? { seriesId: null } : {}),
        // Changing what is read invalidates the record of what was read, or
        // the next sync would decide nothing had changed and import nothing.
        ...(body.externalId ? { fingerprint: null } : {}),
      },
    });
    await logAudit(user.email, "update", "video-feed", feed.id, feed.name);
    return NextResponse.json({ feed });
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * Removing a feed, and leaving what it brought in.
 *
 * The videos stay: they have been filed, renamed, given scripture references
 * and watched. Deleting them because the *source* was tidied up would be the
 * surprising reading of "remove this feed".
 */
export async function DELETE(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await ensureStaff();
    await ensureCapability(user, "manage_videos");
    const { id } = await context.params;
    const feed = await prisma.videoFeed.delete({ where: { id } });
    await logAudit(user.email, "delete", "video-feed", feed.id, feed.name);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
