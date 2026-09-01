import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { errorResponse } from "@/lib/api-guard";
import { ensureStaff, ensureCapability } from "@/lib/permissions";
import { bunnyListStorageFiles, bunnyListStreamVideos } from "@/lib/bunny";

/**
 * Rows whose underlying Bunny object is gone — a file deleted from the
 * storage zone, or a video removed from the Stream library — leaving the
 * app advertising something it can no longer serve.
 *
 * The mirror of the storage import, which finds the opposite: objects in
 * Bunny that no row points at.
 *
 * Site-wide by design (hence the stricter capability than the import's
 * ensureStaff): this reconciles the whole library, and a scoped editor
 * seeing only their own section would draw the wrong conclusion from a
 * partial answer.
 */
export async function GET() {
  try {
    const user = await ensureStaff();
    await ensureCapability(user, "manage_files");

    const [storage, streamVideos, files, videos] = await Promise.all([
      bunnyListStorageFiles(),
      bunnyListStreamVideos(),
      // Trashed rows are excluded: they're already off the site, and their
      // objects are expected to disappear once the trash is purged.
      prisma.fileAsset.findMany({
        where: { deletedAt: null },
        select: {
          id: true,
          title: true,
          bunnyPath: true,
          series: { select: { title: true } },
          category: { select: { name: true } },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.video.findMany({
        where: { deletedAt: null },
        select: {
          id: true,
          title: true,
          bunnyVideoId: true,
          series: { select: { title: true } },
          category: { select: { name: true } },
        },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    const storagePaths = new Set(storage.objects.map((object) => object.path));
    const streamIds = new Set(streamVideos.map((video) => video.guid));

    return NextResponse.json({
      // A truncated walk can't prove absence, so the file half is reported
      // as unknown rather than as a list of things safe to delete. The
      // Stream listing pages to completion, so videos are always sound.
      storageTruncated: storage.truncated,
      files: storage.truncated ? [] : files.filter((f) => !storagePaths.has(f.bunnyPath)),
      // Only Bunny's own can be orphaned in Bunny. An imported video has no
      // id to look for, and listing it here would read as "delete this".
      videos: videos.filter((v) => v.bunnyVideoId !== null && !streamIds.has(v.bunnyVideoId)),
      checked: { files: files.length, videos: videos.length },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
