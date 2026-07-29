import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { errorResponse } from "@/lib/api-guard";
import { ensureStaff, ensureContentAccess } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { bunnyDeleteStreamVideo } from "@/lib/bunny";
import { isPluginEnabled } from "@/lib/plugins";
import { notifySubscribers } from "@/lib/push";
import { getSubscriberUserIdsForSeries, getSubscriberUserIdsForCategory } from "@/lib/content";
import type { User } from "@prisma/client";

export const updateSchema = z
  .object({
    title: z.string().min(1).optional(),
    slug: z
      .string()
      .min(1)
      .regex(/^[a-z0-9-]+$/)
      .optional(),
    description: z.string().optional(),
    seriesId: z.string().optional().nullable(),
    categoryId: z.string().optional().nullable(),
    memberOnly: z.boolean().optional(),
    hidden: z.boolean().optional(),
    published: z.boolean().optional(),
    publishAt: z.string().nullable().optional(),
    unpublishAt: z.string().nullable().optional(),
    isPremiere: z.boolean().optional(),
    position: z.number().int().optional(),
  })
  .refine((body) => !(body.seriesId && body.categoryId), {
    message: "Choose either a series or a category, not both",
  });

function normalizeData(body: z.infer<typeof updateSchema>) {
  return {
    ...body,
    // Assigning one of series/category clears the other, keeping them mutually exclusive.
    categoryId: body.seriesId ? null : body.categoryId,
    seriesId: body.categoryId ? null : body.seriesId,
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

/**
 * Shared by the single-item PATCH below and the bulk route, so a bulk publish
 * toggle runs this same permission-checked, notification-triggering logic in
 * one request instead of the client firing one PATCH per selected video.
 */
export async function applyVideoUpdate(user: User, id: string, body: z.infer<typeof updateSchema>) {
  const existing = await prisma.video.findUniqueOrThrow({ where: { id } });
  await ensureContentAccess(user, { seriesId: existing.seriesId, categoryId: existing.categoryId });
  if (body.seriesId !== undefined || body.categoryId !== undefined) {
    await ensureContentAccess(user, { seriesId: body.seriesId ?? null, categoryId: body.categoryId ?? null });
  }
  const video = await prisma.video.update({
    where: { id },
    data: normalizeData(body),
    include: { series: true },
  });
  await logAudit(user.email, "update", "video", video.id, JSON.stringify(body));

  const justPublished = existing.published === false && body.published === true;
  if (justPublished && video.status === "READY") {
    const categoryId = video.series?.categoryId ?? video.categoryId ?? null;
    if (await isPluginEnabled("notifications", categoryId)) {
      await notifySubscribers({
        title: "New video published",
        body: video.title,
        url: `/videos/${video.slug}`,
      });
    }
    if (await isPluginEnabled("subscriptions", categoryId)) {
      const subscriberIds = video.seriesId
        ? await getSubscriberUserIdsForSeries(video.seriesId, categoryId)
        : video.categoryId
          ? await getSubscriberUserIdsForCategory(video.categoryId)
          : [];
      if (subscriberIds.length > 0) {
        await notifySubscribers(
          { title: `New video in ${video.series?.title ?? "a category you follow"}`, body: video.title, url: `/videos/${video.slug}` },
          subscriberIds,
        );
      }
    }
  }

  return video;
}

/** Shared by the single-item DELETE below and the bulk route. */
export async function removeVideo(user: User, id: string) {
  const video = await prisma.video.findUniqueOrThrow({ where: { id } });
  await ensureContentAccess(user, { seriesId: video.seriesId, categoryId: video.categoryId });
  await bunnyDeleteStreamVideo(video.bunnyVideoId);
  await prisma.video.delete({ where: { id } });
  await logAudit(user.email, "delete", "video", id, video.title);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await ensureStaff();
    const { id } = await params;
    const body = updateSchema.parse(await request.json());
    const video = await applyVideoUpdate(user, id, body);
    return NextResponse.json(video);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await ensureStaff();
    const { id } = await params;
    await removeVideo(user, id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
