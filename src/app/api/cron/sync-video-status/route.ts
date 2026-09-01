import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { bunnyGetStreamVideo, mapBunnyStreamStatus } from "@/lib/bunny";

/** Keeps one cron run's Bunny API usage bounded, however big the library gets. */
const MP4_REFRESH_BATCH = 25;

/**
 * Runs on a schedule (see the "crons" entry in vercel.json) so a video stuck
 * in PROCESSING doesn't require an admin to remember to click "Sync from
 * Bunny" on it — polls Bunny for every non-trashed video still PROCESSING
 * and applies the same status/duration/thumbnail update the manual
 * per-video sync-status route does. Never touches `published`: this only
 * reconciles encoding state, an admin still decides when to publish.
 * Same CRON_SECRET bearer-token guard as notification-digest.
 *
 * It also re-checks MP4 fallback state for a batch of READY videos that
 * currently have none. That's the automatic half of recovering the case
 * Bunny's docs warn about: enabling MP4 Fallback doesn't retro-generate files
 * for existing uploads, so a video only becomes downloadable once it's
 * re-uploaded or repackaged, and something has to notice that it did. The
 * download endpoint deliberately doesn't re-ask Bunny on the member path, so
 * this is where a repaired video gets picked back up.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Forbidden" }, { status: 401 });
  }

  // Bunny's own, only: an imported video is never PROCESSING here, and if one
  // somehow were there is no encode to ask about.
  const stuck = await prisma.video.findMany({
    where: { status: "PROCESSING", deletedAt: null, source: "BUNNY", bunnyVideoId: { not: null } },
  });

  let updated = 0;
  const errors: string[] = [];
  for (const video of stuck) {
    try {
      const data = await bunnyGetStreamVideo(video.bunnyVideoId as string);
      const status = mapBunnyStreamStatus(data.status);
      if (status !== "PROCESSING") {
        await prisma.video.update({
          where: { id: video.id },
          data: {
            status,
            durationSeconds: data.length ?? undefined,
            thumbnailFileName: data.thumbnailFileName ?? null,
            hasMp4Fallback: data.hasMP4Fallback === true,
            mp4Resolutions: data.availableResolutions ?? null,
          },
        });
        updated++;
      }
    } catch (err) {
      errors.push(`${video.id}: ${err instanceof Error ? err.message : "unknown error"}`);
    }
  }

  // Oldest-checked first, so a large library cycles through rather than
  // re-asking about the same few videos every run.
  const withoutMp4 = await prisma.video.findMany({
    where: {
      status: "READY",
      deletedAt: null,
      // Bunny's own, only: an imported YouTube or Vimeo video has no encode
      // here to ask about, and asking would be a request per video per day
      // for an answer that cannot exist.
      source: "BUNNY",
      bunnyVideoId: { not: null },
      OR: [{ hasMp4Fallback: null }, { hasMp4Fallback: false }],
    },
    orderBy: { updatedAt: "asc" },
    take: MP4_REFRESH_BATCH,
    select: { id: true, bunnyVideoId: true },
  });

  let mp4Found = 0;
  for (const video of withoutMp4) {
    try {
      const data = await bunnyGetStreamVideo(video.bunnyVideoId as string);
      const hasMp4Fallback = data.hasMP4Fallback === true;
      await prisma.video.update({
        where: { id: video.id },
        data: { hasMp4Fallback, mp4Resolutions: data.availableResolutions ?? null },
      });
      if (hasMp4Fallback) mp4Found++;
    } catch (err) {
      errors.push(`${video.id} (mp4): ${err instanceof Error ? err.message : "unknown error"}`);
    }
  }

  return NextResponse.json({
    checked: stuck.length,
    updated,
    mp4Checked: withoutMp4.length,
    mp4Found,
    errors,
  });
}
