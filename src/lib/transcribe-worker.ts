import { prisma } from "@/lib/db";
import { bunnyStreamMp4Url, selectMp4Height } from "@/lib/bunny";
import { TranscribeError, transcribeAudio, transcribeConfig } from "@/lib/transcribe";

/**
 * An attempt that started this long ago is taken to have died.
 *
 * A serverless function killed at its timeout writes nothing, so a video can
 * be left in RUNNING with nobody coming back for it. Half an hour is well
 * past any real transcription and well short of somebody noticing by hand.
 */
const STALE_AFTER_MS = 30 * 60 * 1000;

export type TranscribeOutcome =
  | { status: "done"; videoId: string; characters: number }
  | { status: "failed"; videoId: string; reason: string }
  | { status: "idle" };

/**
 * Transcribes one queued video, if there is one.
 *
 * Deliberately one per call. Transcribing an hour of audio takes minutes even
 * on a fast service, so a loop over a whole library would be a request that
 * never returns; a cron that does one at a time gets through a backlog
 * without any single run being long.
 */
export async function transcribeNextQueued(): Promise<TranscribeOutcome> {
  const config = transcribeConfig();
  if (!config) return { status: "idle" };

  // Anything left RUNNING by a run that died is queued again, ahead of the
  // rest — it has already waited once.
  await prisma.video.updateMany({
    where: {
      transcriptStatus: "RUNNING",
      transcriptStartedAt: { lt: new Date(Date.now() - STALE_AFTER_MS) },
    },
    data: { transcriptStatus: "QUEUED" },
  });

  const video = await prisma.video.findFirst({
    where: { transcriptStatus: "QUEUED", deletedAt: null },
    orderBy: { transcriptStartedAt: { sort: "asc", nulls: "first" } },
    select: { id: true, title: true, bunnyVideoId: true, mp4Resolutions: true },
  });
  if (!video) return { status: "idle" };

  await prisma.video.update({
    where: { id: video.id },
    data: { transcriptStatus: "RUNNING", transcriptStartedAt: new Date(), transcriptError: null },
  });

  const fail = async (reason: string): Promise<TranscribeOutcome> => {
    await prisma.video.update({
      where: { id: video.id },
      data: { transcriptStatus: "FAILED", transcriptError: reason.slice(0, 500) },
    });
    return { status: "failed", videoId: video.id, reason };
  };

  try {
    // The MP4 rendition, which is the only form of a video this app can hand
    // to anything: HLS is segments, and a transcription service wants a file.
    const height = selectMp4Height(video.mp4Resolutions);
    if (!height) {
      return await fail(
        "This video has no MP4 rendition yet, so there is no file to send. Enable MP4 Fallback in Bunny and re-sync it.",
      );
    }

    const source = await fetch(bunnyStreamMp4Url(video.bunnyVideoId, height));
    if (!source.ok) return await fail(`Couldn't fetch the video's audio (${source.status}).`);

    const audio = await source.blob();
    const text = await transcribeAudio(config, audio, `${video.bunnyVideoId}.mp4`);

    await prisma.video.update({
      where: { id: video.id },
      data: { transcript: text, transcriptStatus: "DONE", transcriptError: null },
    });
    return { status: "done", videoId: video.id, characters: text.length };
  } catch (error) {
    return await fail(
      error instanceof TranscribeError
        ? error.message
        : error instanceof Error
          ? error.message
          : "Transcription failed.",
    );
  }
}
