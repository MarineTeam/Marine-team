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
 * The primitive. `transcribeQueued` below is what the cron calls: it drains
 * as many of these as fit in the time a serverless function is allowed, which
 * is the honest bound rather than an arbitrary count.
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
    // A transcription service wants a file, and only a video stored here has
    // one we can hand it — an imported video's audio isn't ours to fetch.
    where: { transcriptStatus: "QUEUED", deletedAt: null, source: "BUNNY", bunnyVideoId: { not: null } },
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

    const source = await fetch(bunnyStreamMp4Url(video.bunnyVideoId as string, height));
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

export type DrainOutcome = {
  done: number;
  failed: number;
  /** Still queued when the run stopped. */
  remaining: number;
  /** Why it stopped. */
  stopped: "empty" | "out-of-time" | "not-configured";
  ms: number;
};

/**
 * Works through the queue for as long as there is time.
 *
 * This used to be one video per run, on an hourly cron. Vercel's Hobby plan
 * allows a cron only once a day (see vercel.json), and one video a day would
 * mean a church with forty untranscribed sermons waiting until Christmas — so
 * the bound moved from a count to the thing that was actually being protected:
 * the function's own time limit.
 *
 * It starts another video only if the slowest one so far would still fit in
 * what is left, which is the cheapest estimate that doesn't need to know how
 * long an unseen file is. The first is always attempted, even if it then
 * overruns — a run killed mid-transcription leaves the video RUNNING, and the
 * stale sweep at the top of `transcribeNextQueued` puts it back in the queue.
 */
export function hasTimeForAnother(elapsedMs: number, slowestMs: number, budgetMs: number): boolean {
  return elapsedMs + slowestMs <= budgetMs;
}

export async function transcribeQueued(budgetMs: number): Promise<DrainOutcome> {
  const started = Date.now();
  const totals = { done: 0, failed: 0 };
  let slowest = 0;
  let stopped: DrainOutcome["stopped"] = "empty";

  if (!transcribeConfig()) {
    return { ...totals, remaining: 0, stopped: "not-configured", ms: 0 };
  }

  for (;;) {
    // `slowest` is 0 on the first pass, so one is always attempted.
    if (!hasTimeForAnother(Date.now() - started, slowest, budgetMs)) {
      stopped = "out-of-time";
      break;
    }

    const before = Date.now();
    const outcome = await transcribeNextQueued();
    if (outcome.status === "idle") break;

    slowest = Math.max(slowest, Date.now() - before);
    if (outcome.status === "done") totals.done += 1;
    else totals.failed += 1;
  }

  return {
    ...totals,
    remaining: await prisma.video.count({ where: { transcriptStatus: "QUEUED", deletedAt: null } }),
    stopped,
    ms: Date.now() - started,
  };
}
