import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { errorResponse } from "@/lib/api-guard";
import { ensureStaff, ensureContentAccess } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { bunnyListStorageFiles, bunnyStoragePublicUrl } from "@/lib/bunny";

/** Capped well under the serverless time budget; the UI imports in batches rather than one huge request. */
const MAX_IMPORT = 100;

const importSchema = z
  .object({
    files: z
      .array(z.object({ path: z.string().min(1), title: z.string().min(1) }))
      .min(1)
      .max(MAX_IMPORT),
    seriesId: z.string().optional().nullable(),
    categoryId: z.string().optional().nullable(),
  })
  .refine((body) => !(body.seriesId && body.categoryId), {
    message: "Choose either a series or a category, not both",
  });

/** Attaches files already in Bunny Storage (uploaded outside the app) to new DB rows. */
export async function POST(request: NextRequest) {
  try {
    const user = await ensureStaff();
    const body = importSchema.parse(await request.json());
    if (user.role !== "ADMIN" && !body.seriesId && !body.categoryId) {
      return NextResponse.json({ error: "Choose a series or a category" }, { status: 400 });
    }
    await ensureContentAccess(user, {
      seriesId: body.seriesId ?? null,
      categoryId: body.categoryId ?? null,
    });

    // Every path is checked against a live listing rather than trusted from
    // the request: it both keeps a typo'd or stale path from becoming a row
    // that points at nothing, and is where the real size and content type
    // come from, instead of letting the client assert them.
    const objects = await bunnyListStorageFiles();
    const byPath = new Map(objects.map((object) => [object.path, object]));

    const known = new Set(
      (
        await prisma.fileAsset.findMany({
          where: { bunnyPath: { in: body.files.map((f) => f.path) } },
          select: { bunnyPath: true },
        })
      ).map((f) => f.bunnyPath),
    );

    const missing = body.files.filter((f) => !byPath.has(f.path)).map((f) => f.path);
    if (missing.length > 0) {
      return NextResponse.json(
        { error: `Not found in Bunny Storage: ${missing.slice(0, 5).join(", ")}` },
        { status: 400 },
      );
    }

    // Already-imported paths are skipped rather than rejected: two admins
    // importing overlapping selections shouldn't fail the whole batch.
    const toCreate = body.files.filter((f) => !known.has(f.path));

    const created = await Promise.all(
      toCreate.map((file) => {
        const object = byPath.get(file.path)!;
        return prisma.fileAsset.create({
          data: {
            title: file.title,
            bunnyPath: object.path,
            url: bunnyStoragePublicUrl(object.path),
            sizeBytes: object.sizeBytes,
            mimeType: object.contentType,
            seriesId: body.seriesId ?? null,
            categoryId: body.categoryId ?? null,
          },
        });
      }),
    );

    for (const file of created) {
      await logAudit(user.email, "import", "file", file.id, file.title);
    }

    return NextResponse.json(
      { imported: created.length, skipped: body.files.length - created.length },
      { status: 201 },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
