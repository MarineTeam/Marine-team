import { prisma } from "@/lib/db";
import {
  bunnyPublicStorageConfigured,
  bunnyPublicStorageCopyFrom,
  bunnyPublicStorageDelete,
  bunnyStorageSignedUrl,
} from "@/lib/bunny";

/**
 * Mirroring podcast audio into the separate public storage zone.
 *
 * The public zone is the one place a file is reachable with no session at
 * all, because podcast apps can't log in and an enclosure URL has to keep
 * working for years. Everything here exists to make sure only files that
 * genuinely should be public ever get there, and that they leave again the
 * moment that stops being true.
 *
 * The honest limit, worth stating once: publishing a podcast episode is not
 * reversible in the way the rest of this app's access control is. Once an
 * episode is out, listeners' apps have already downloaded the file —
 * unmirroring stops new downloads and removes it from the feed, but cannot
 * recall what has already been fetched. That's inherent to podcasting.
 */

/** The fields eligibility depends on — a plain shape so the rule below stays pure and testable. */
export type MirrorCandidate = {
  podcastPublished: boolean;
  published: boolean;
  hidden: boolean;
  deletedAt: Date | null;
  publishAt: Date | null;
  unpublishAt: Date | null;
  memberOnly: boolean;
  mimeType: string | null;
  series: { memberOnly: boolean; published: boolean; hidden: boolean; deletedAt: Date | null } | null;
};

/**
 * Whether a file should currently exist in the public zone.
 *
 * Every condition is a reason a file must NOT be publicly readable, checked
 * fresh rather than inferred from whatever was true when the admin first
 * ticked the box. `podcastPublished` is necessary but never sufficient: it
 * records intent, and this decides whether that intent is currently allowed.
 *
 * Deliberately requires a series: a podcast episode belongs to a show. A
 * file attached straight to a category has no feed to appear in, so it has
 * no reason to be in the public zone.
 */
export function isMirrorEligible(file: MirrorCandidate, now = new Date()): boolean {
  if (!file.podcastPublished) return false;
  if (!file.published || file.hidden || file.deletedAt) return false;
  if (file.memberOnly) return false;
  if (!file.mimeType?.startsWith("audio/")) return false;

  // Scheduled but not yet live, or already expired.
  if (file.publishAt && file.publishAt > now) return false;
  if (file.unpublishAt && file.unpublishAt <= now) return false;

  const series = file.series;
  if (!series) return false;
  if (series.memberOnly || !series.published || series.hidden || series.deletedAt) return false;

  return true;
}

/** Where a mirrored file lives in the public zone. Prefixed so the zone's contents are self-describing. */
export function publicPathFor(fileId: string, bunnyPath: string): string {
  const name = bunnyPath.split("/").pop() || fileId;
  return `podcast/${fileId}/${name}`;
}

/**
 * Brings one file's public-zone presence in line with whether it's eligible,
 * copying it in or deleting it out as needed. Safe to call after any change
 * that might have altered eligibility, including ones that didn't.
 *
 * Never throws: this runs as a side effect of admin edits, and a Bunny
 * outage shouldn't fail the edit itself. A failed copy leaves publicPath
 * null, so the feed simply omits the episode rather than advertising a URL
 * that isn't there — failing closed in both directions.
 */
export async function syncPodcastMirror(fileId: string): Promise<void> {
  if (!bunnyPublicStorageConfigured()) return;

  try {
    const file = await prisma.fileAsset.findUnique({
      where: { id: fileId },
      include: {
        series: { select: { memberOnly: true, published: true, hidden: true, deletedAt: true } },
      },
    });
    if (!file) return;

    const shouldBePublic = isMirrorEligible(file);

    if (shouldBePublic && !file.publicPath) {
      const target = publicPathFor(file.id, file.bunnyPath);
      await bunnyPublicStorageCopyFrom(
        bunnyStorageSignedUrl(file.bunnyPath),
        target,
        file.mimeType ?? undefined,
      );
      // Written only after the copy succeeds, so publicPath is always a
      // location that actually holds bytes.
      await prisma.fileAsset.update({ where: { id: file.id }, data: { publicPath: target } });
      return;
    }

    if (!shouldBePublic && file.publicPath) {
      // Cleared first, then deleted: if the delete fails, the file is
      // already absent from the feed and can be swept up later. Clearing
      // after a failed delete would leave it public with nothing pointing
      // at it — public and forgotten is the worse of the two.
      const stale = file.publicPath;
      await prisma.fileAsset.update({ where: { id: file.id }, data: { publicPath: null } });
      await bunnyPublicStorageDelete(stale);
    }
  } catch (error) {
    console.error(`Podcast mirror sync failed for file ${fileId}:`, error);
  }
}

/**
 * Re-syncs every file in a series. Used when something about the *series*
 * changes audience or visibility — flipping it members-only has to pull all
 * of its episodes out of the public zone, not just the one being edited.
 */
export async function syncSeriesPodcastMirror(seriesId: string): Promise<void> {
  if (!bunnyPublicStorageConfigured()) return;

  // Only files that are mirrored or want to be — no need to walk a series'
  // whole file list to re-decide "no" for a PDF.
  const files = await prisma.fileAsset.findMany({
    where: { seriesId, OR: [{ podcastPublished: true }, { publicPath: { not: null } }] },
    select: { id: true },
  });
  for (const file of files) await syncPodcastMirror(file.id);
}

/** Removes a file's public copy outright, for permanent deletion where there's no row left to reconcile. */
export async function purgePodcastMirror(publicPath: string | null): Promise<void> {
  if (!publicPath || !bunnyPublicStorageConfigured()) return;
  try {
    await bunnyPublicStorageDelete(publicPath);
  } catch (error) {
    console.error(`Podcast mirror purge failed for ${publicPath}:`, error);
  }
}
