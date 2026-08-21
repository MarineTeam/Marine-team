import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { errorResponse } from "@/lib/api-guard";
import { ensureStaff } from "@/lib/permissions";
import { bunnyListStorageFiles } from "@/lib/bunny";

/**
 * Files sitting in Bunny Storage that no FileAsset row points at yet — the
 * ones uploaded straight to Bunny to get around this app's 4MB serverless
 * upload cap. Mirrors the videos' bunny-library route.
 */
export async function GET() {
  try {
    await ensureStaff();
    const [{ objects }, existing] = await Promise.all([
      bunnyListStorageFiles(),
      // Deliberately unfiltered, trashed rows included: a soft-deleted
      // file's storage object survives until the trash is purged, so
      // treating it as unimported would offer a duplicate of something the
      // app still knows about and can restore.
      prisma.fileAsset.findMany({ select: { bunnyPath: true } }),
    ]);

    const known = new Set(existing.map((f) => f.bunnyPath));
    return NextResponse.json(objects.filter((object) => !known.has(object.path)));
  } catch (error) {
    return errorResponse(error);
  }
}
