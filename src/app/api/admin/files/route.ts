import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { errorResponse } from "@/lib/api-guard";
import {
  ensureStaff,
  ensureSeriesRelatedAccess,
  getEditableScope,
  descendantCategoryIds,
} from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { bunnyStorageUpload } from "@/lib/bunny";

export async function GET() {
  try {
    const user = await ensureStaff();
    const scope = await getEditableScope(user);
    const where = scope.isAdmin
      ? {}
      : {
          seriesId: {
            in: [
              ...scope.seriesIds,
              ...(await prisma.series.findMany({
                where: { categoryId: { in: await descendantCategoryIds(scope.categoryIds) } },
                select: { id: true },
              })).map((s) => s.id),
            ],
          },
        };
    const files = await prisma.fileAsset.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: { series: true },
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
    const memberOnly = form.get("memberOnly") === "true";
    const published = form.get("published") !== "false";
    const resolvedSeriesId = typeof seriesId === "string" && seriesId ? seriesId : null;

    if (user.role !== "ADMIN" && !resolvedSeriesId) {
      return NextResponse.json({ error: "Choose a series" }, { status: 400 });
    }
    await ensureSeriesRelatedAccess(user, resolvedSeriesId);

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
