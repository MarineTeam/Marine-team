import type { Prisma, VideoFeed } from "@prisma/client";
import { prisma } from "@/lib/db";
import { uniqueSlug } from "@/lib/slug";
import { fetchFeed, FeedError, sourceOf, type SourceVideo } from "@/lib/video-feeds";

/**
 * Importing what a source has, without undoing what somebody did here.
 *
 * The rule that shapes this file: **a sync must never overwrite an edit made
 * in the app.** A church imports a stream titled "Sunday Service 12/10/25 ||
 * FULL SERVICE", renames it to "The Cost of Discipleship", files it under a
 * series, and adds the scripture references. If the next night's sync writes
 * YouTube's title back, all of that is gone and nobody knows why.
 *
 * So each imported field is stored twice: the live one, and what the source
 * said last time. A field is only updated when the live value still equals
 * what was imported — which is exactly "nobody has touched this". It is a
 * three-way merge, and it is the only honest way to run a sync against data a
 * person can also edit.
 */

export type SyncOutcome = {
  feedId: string;
  status: "SUCCESS" | "UNCHANGED" | "FAILED" | "NOT_CONFIGURED";
  imported: number;
  updated: number;
  skipped: number;
  error: string | null;
};

/**
 * Whether a re-sync may replace this field.
 *
 * Null `imported` means the row predates the record of what was imported — an
 * import from before this was tracked, or a hand-made row. Left alone, because
 * "we don't know whether anybody edited it" must not resolve to "overwrite".
 */
export function mayOverwrite(live: string | null, imported: string | null): boolean {
  if (imported === null) return false;
  return (live ?? "") === imported;
}

/** What of a source's version of a video may be written over ours. */
export function mergeImported(
  existing: { title: string; description: string | null; importedTitle: string | null; importedDescription: string | null },
  incoming: SourceVideo,
): { title?: string; description?: string | null; importedTitle: string; importedDescription: string } {
  return {
    ...(mayOverwrite(existing.title, existing.importedTitle) ? { title: incoming.title } : {}),
    ...(mayOverwrite(existing.description, existing.importedDescription)
      ? { description: incoming.description }
      : {}),
    // Always updated, even when the live field is left alone: this is the
    // record of what the source says now, and the next comparison needs it to
    // be current or an edit made today looks like an edit for ever.
    importedTitle: incoming.title,
    importedDescription: incoming.description,
  };
}

/** Runs one feed. Never throws for a source problem — it records it. */
export async function syncFeed(feed: VideoFeed): Promise<SyncOutcome> {
  const base: SyncOutcome = {
    feedId: feed.id,
    status: "SUCCESS",
    imported: 0,
    updated: 0,
    skipped: 0,
    error: null,
  };

  let result;
  try {
    result = await fetchFeed(feed.kind, feed.externalId, feed.lookBack);
  } catch (error) {
    const message = error instanceof FeedError ? error.message : "Couldn't read that source.";
    await prisma.videoFeed.update({
      where: { id: feed.id },
      data: { lastSyncedAt: new Date(), lastSyncStatus: "FAILED", lastError: message.slice(0, 500) },
    });
    return { ...base, status: "FAILED", error: message };
  }

  // Nothing has changed upstream, so nothing is written — the same saving the
  // schedules sync makes, for the same reason.
  if (result.fingerprint === feed.fingerprint) {
    await prisma.videoFeed.update({
      where: { id: feed.id },
      data: { lastSyncedAt: new Date(), lastSyncStatus: "UNCHANGED", lastError: null },
    });
    return { ...base, status: "UNCHANGED", skipped: result.videos.length };
  }

  const source = sourceOf(feed.kind);
  const existing = await prisma.video.findMany({
    where: { source, externalId: { in: result.videos.map((video) => video.externalId) } },
    select: { id: true, title: true, description: true, importedTitle: true, importedDescription: true, externalId: true },
  });
  const byExternalId = new Map(existing.map((video) => [video.externalId, video]));

  const takenSlugs = new Set(
    (await prisma.video.findMany({ select: { slug: true } })).map((video) => video.slug),
  );

  for (const incoming of result.videos) {
    const found = byExternalId.get(incoming.externalId);

    if (found) {
      const merged = mergeImported(found, incoming);
      // Only the record-keeping changed, which is not worth reporting as an
      // update to somebody reading the sync log.
      const touched = "title" in merged || "description" in merged;
      await prisma.video.update({
        where: { id: found.id },
        data: {
          ...merged,
          externalThumbnailUrl: incoming.thumbnailUrl,
          ...(incoming.durationSeconds ? { durationSeconds: incoming.durationSeconds } : {}),
        },
      });
      if (touched) base.updated += 1;
      else base.skipped += 1;
      continue;
    }

    const slug = uniqueSlug(incoming.title, takenSlugs, `video-${incoming.externalId}`);
    takenSlugs.add(slug);

    const data: Prisma.VideoUncheckedCreateInput = {
      title: incoming.title,
      slug,
      description: incoming.description,
      source,
      externalId: incoming.externalId,
      externalUrl:
        source === "YOUTUBE"
          ? `https://www.youtube.com/watch?v=${incoming.externalId}`
          : `https://vimeo.com/${incoming.externalId}`,
      externalThumbnailUrl: incoming.thumbnailUrl,
      importedTitle: incoming.title,
      importedDescription: incoming.description,
      durationSeconds: incoming.durationSeconds,
      // An imported video has nothing to encode, so it is ready by definition.
      status: "READY",
      // Off unless the feed says otherwise: a church that streams its whole
      // service does not want the twenty minutes of an empty stage before it
      // starts appearing on its own site.
      published: feed.autoPublish,
      // The source's own publish date, so an imported archive sorts by when
      // it was preached rather than by when it was imported.
      publishAt: incoming.publishedAt,
      feedId: feed.id,
      seriesId: feed.seriesId,
      categoryId: feed.categoryId,
    };
    await prisma.video.create({ data });
    base.imported += 1;
  }

  await prisma.videoFeed.update({
    where: { id: feed.id },
    data: {
      lastSyncedAt: new Date(),
      lastSyncStatus: "SUCCESS",
      lastError: null,
      fingerprint: result.fingerprint,
    },
  });
  return base;
}

/** Every feed that is switched on. */
export async function syncAllFeeds(): Promise<SyncOutcome[]> {
  const feeds = await prisma.videoFeed.findMany({ where: { enabled: true } });
  const outcomes: SyncOutcome[] = [];
  for (const feed of feeds) {
    // One at a time: these are rate-limited third-party APIs, and a church
    // has three feeds rather than three hundred.
    outcomes.push(await syncFeed(feed));
  }
  return outcomes;
}
