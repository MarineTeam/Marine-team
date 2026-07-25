import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { ensureAdmin, errorResponse } from "@/lib/api-guard";
import { bunnyListStreamVideos } from "@/lib/bunny";

/** Lists videos already in the Bunny Stream library that haven't been imported into the app yet. */
export async function GET() {
  try {
    await ensureAdmin();
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
