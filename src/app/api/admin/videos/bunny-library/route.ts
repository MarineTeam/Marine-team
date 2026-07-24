import { NextRequest, NextResponse } from "next/server";
import { ensureAdmin, errorResponse } from "@/lib/api-guard";
import { getTargetDb } from "@/lib/admin-target";
import { bunnyListStreamVideos } from "@/lib/bunny";

/** Lists videos already in the Bunny Stream library that haven't been imported into the app yet. */
export async function GET(request: NextRequest) {
  try {
    await ensureAdmin();
    const prisma = getTargetDb(request);
    const [bunnyVideos, importedVideos] = await Promise.all([
      bunnyListStreamVideos(),
      prisma.video.findMany({ select: { bunnyVideoId: true } }),
    ]);

    const importedIds = new Set(importedVideos.map((v) => v.bunnyVideoId));
    const unimported = bunnyVideos.filter((v) => !importedIds.has(v.guid));

    return NextResponse.json(unimported);
  } catch (error) {
    return errorResponse(error);
  }
}
