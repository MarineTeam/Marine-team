import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { errorResponse } from "@/lib/api-guard";
import {
  ensureStaff,
  ensureContentAccess,
  getEditableScope,
  descendantCategoryIds,
} from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { bunnyStorageUpload } from "@/lib/bunny";

export async function GET() {
  try {
    const user = await ensureStaff();
    const scope = await getEditableScope(user);
    let where: Prisma.FileAssetWhereInput = { deletedAt: null };
    if (!scope.isAdmin) {
      const categoryIds = await descendantCategoryIds(scope.categoryIds);
      where = {
        deletedAt: null,
        OR: [
          {
            seriesId: {
              in: [
                ...scope.seriesIds,
                ...(await prisma.series.findMany({
                  where: { categoryId: { in: categoryIds } },
                  select: { id: true },
                })).map((s) => s.id),
              ],
            },
          },
          { categoryId: { in: categoryIds } },
        ],
      };
    }
    const files = await prisma.fileAsset.findMany({
      where,
      // Reorder writes `position`, so the list has to read it back or the
      // arrows and drag-handle appear to do nothing. createdAt breaks the
      // ties: every row sits at the default 0 until something is moved, and
      // an untouched list should still read newest-first.
      orderBy: [{ position: "asc" }, { createdAt: "desc" }],
      include: { series: true, category: true },
    });
    return NextResponse.json(files);
  } catch (error) {
    return errorResponse(error);
  }
}

// Vercel Hobby serverless functions cap request bodies at 4.5MB, so this
// route only fits small handouts (PDFs, slides). Larger files should be
// uploaded straight to Bunny Storage from the dashboard and linked by URL.
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

export async function POST(request: NextRequest) {
  try {
    const user = await ensureStaff();
    const form = await request.formData();
    const file = form.get("file");
    const title = form.get("title");
    const seriesId = form.get("seriesId");
    const categoryId = form.get("categoryId");
    const memberOnly = form.get("memberOnly") === "true";
    const published = form.get("published") !== "false";
    const resolvedSeriesId = typeof seriesId === "string" && seriesId ? seriesId : null;
    const resolvedCategoryId = typeof categoryId === "string" && categoryId ? categoryId : null;

    if (resolvedSeriesId && resolvedCategoryId) {
      return NextResponse.json({ error: "Choose either a series or a category, not both" }, { status: 400 });
    }
    if (user.role !== "ADMIN" && !resolvedSeriesId && !resolvedCategoryId) {
      return NextResponse.json({ error: "Choose a series or a category" }, { status: 400 });
    }
    await ensureContentAccess(user, { seriesId: resolvedSeriesId, categoryId: resolvedCategoryId });

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Missing file" }, { status: 400 });
    }
    if (typeof title !== "string" || !title.trim()) {
      return NextResponse.json({ error: "Missing title" }, { status: 400 });
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        { error: `File exceeds ${MAX_UPLOAD_BYTES / 1024 / 1024}MB upload limit` },
        { status: 400 },
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const bunnyPath = `files/${crypto.randomUUID()}-${file.name}`;
    const url = await bunnyStorageUpload(bunnyPath, buffer, file.type);

    const created = await prisma.fileAsset.create({
      data: {
        title,
        bunnyPath,
        url,
        sizeBytes: file.size,
        mimeType: file.type || null,
        seriesId: resolvedSeriesId,
        categoryId: resolvedCategoryId,
        memberOnly,
        published,
      },
    });
    await logAudit(user.email, "create", "file", created.id, created.title);
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
