import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { errorResponse } from "@/lib/api-guard";
import { ensureStaff, ensureContentAccess } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { syncPodcastMirror } from "@/lib/podcast-mirror";
import type { User } from "@prisma/client";

export const updateSchema = z
  .object({
    title: z.string().min(1).optional(),
    seriesId: z.string().optional().nullable(),
    categoryId: z.string().optional().nullable(),
    memberOnly: z.boolean().optional(),
    hidden: z.boolean().optional(),
    published: z.boolean().optional(),
    publishAt: z.string().nullable().optional(),
    unpublishAt: z.string().nullable().optional(),
    position: z.number().int().optional(),
    pageNumber: z.number().int().nullable().optional(),
    groupLabel: z.string().nullable().optional(),
    lyricsText: z.string().nullable().optional(),
    // How many PDF pages precede the book's printed page 1. Not nullable:
    // the column defaults to 0, and "no front matter" is the same answer
    // as "nobody has set this" — see lib/page-offset.ts. Unbounded in both
    // directions, since a scan can start partway into a book.
    pageOffset: z.number().int().optional(),
    // A generated cover thumbnail. Constrained to an inline image rather
    // than accepted as free text: this is rendered straight into an <img>
    // on public pages, so a `data:text/html` or remote URL sneaking in here
    // would be someone else's problem later. The cap is well above what
    // derivePdfBookCard produces at COVER_WIDTH and well below anything
    // that would bloat a listing.
    coverDataUrl: z
      .string()
      .regex(/^data:image\/(jpeg|png);base64,[A-Za-z0-9+/=]+$/, "must be an inline JPEG or PNG")
      .max(256 * 1024)
      .nullable()
      .optional(),
    hymnCount: z.number().int().min(0).nullable().optional(),
    podcastPublished: z.boolean().optional(),
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

/** Shared by the single-item PATCH below and the bulk route. */
export async function applyFileUpdate(user: User, id: string, body: z.infer<typeof updateSchema>) {
  const existing = await prisma.fileAsset.findUniqueOrThrow({ where: { id } });
  await ensureContentAccess(user, { seriesId: existing.seriesId, categoryId: existing.categoryId });
  if (body.seriesId !== undefined || body.categoryId !== undefined) {
    await ensureContentAccess(user, { seriesId: body.seriesId ?? null, categoryId: body.categoryId ?? null });
  }
  const file = await prisma.fileAsset.update({ where: { id }, data: normalizeData(body) });
  await logAudit(user.email, "update", "file", file.id, JSON.stringify(body));
  // Runs after every file edit, not just a podcastPublished toggle: making a
  // file members-only, unpublishing it, moving it to another series or
  // scheduling it out all change whether its public copy may exist.
  await syncPodcastMirror(file.id);
  return file;
}

/**
 * Shared by the single-item DELETE below and the bulk route. Soft delete
 * only — the Bunny Storage object isn't removed until the trash entry is
 * permanently purged from /admin/trash.
 */
export async function removeFile(user: User, id: string) {
  const file = await prisma.fileAsset.findUniqueOrThrow({ where: { id } });
  await ensureContentAccess(user, { seriesId: file.seriesId, categoryId: file.categoryId });
  await prisma.fileAsset.update({ where: { id }, data: { deletedAt: new Date() } });
  await logAudit(user.email, "trash", "file", id, file.title);
  // Trashing is a soft delete, but it must still pull the public copy: a
  // trashed episode is gone from the site and has no business staying
  // readable on an unauthenticated URL until someone purges the trash.
  await syncPodcastMirror(id);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await ensureStaff();
    const { id } = await params;
    const body = updateSchema.parse(await request.json());
    const file = await applyFileUpdate(user, id, body);
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
    const user = await ensureStaff();
    const { id } = await params;
    await removeFile(user, id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
