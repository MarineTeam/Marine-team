import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { errorResponse } from "@/lib/api-guard";
import { ensureStaff, ensureContentAccess } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { bunnyStorageDelete } from "@/lib/bunny";
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
  return file;
}

/** Shared by the single-item DELETE below and the bulk route. */
export async function removeFile(user: User, id: string) {
  const file = await prisma.fileAsset.findUniqueOrThrow({ where: { id } });
  await ensureContentAccess(user, { seriesId: file.seriesId, categoryId: file.categoryId });
  await bunnyStorageDelete(file.bunnyPath);
  await prisma.fileAsset.delete({ where: { id } });
  await logAudit(user.email, "delete", "file", id, file.title);
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
