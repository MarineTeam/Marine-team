-- Videos that live at YouTube or Vimeo rather than in this app's Bunny library.
CREATE TYPE "VideoSource" AS ENUM ('BUNNY', 'YOUTUBE', 'VIMEO');
CREATE TYPE "VideoFeedKind" AS ENUM ('YOUTUBE_CHANNEL', 'YOUTUBE_PLAYLIST', 'VIMEO_USER', 'VIMEO_SHOWCASE');

CREATE TABLE "VideoFeed" (
    "id" TEXT NOT NULL,
    "kind" "VideoFeedKind" NOT NULL,
    "externalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "seriesId" TEXT,
    "categoryId" TEXT,
    "autoPublish" BOOLEAN NOT NULL DEFAULT false,
    "lookBack" INTEGER NOT NULL DEFAULT 25,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastSyncedAt" TIMESTAMP(3),
    "lastSyncStatus" TEXT,
    "lastError" TEXT,
    "fingerprint" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VideoFeed_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "VideoFeed_kind_externalId_key" ON "VideoFeed"("kind", "externalId");

ALTER TABLE "Video" ADD COLUMN "source" "VideoSource" NOT NULL DEFAULT 'BUNNY';
ALTER TABLE "Video" ADD COLUMN "externalId" TEXT;
ALTER TABLE "Video" ADD COLUMN "externalUrl" TEXT;
ALTER TABLE "Video" ADD COLUMN "externalThumbnailUrl" TEXT;
ALTER TABLE "Video" ADD COLUMN "importedTitle" TEXT;
ALTER TABLE "Video" ADD COLUMN "importedDescription" TEXT;
ALTER TABLE "Video" ADD COLUMN "feedId" TEXT;

-- Nullable now: a YouTube video has no Bunny id, and everything that reads
-- these is a Bunny-only capability (downloads, captions, MP4 renditions,
-- encode status). Existing rows all have real values, so nothing is lost.
ALTER TABLE "Video" ALTER COLUMN "bunnyVideoId" DROP NOT NULL;
ALTER TABLE "Video" ALTER COLUMN "bunnyLibraryId" DROP NOT NULL;

CREATE INDEX "Video_feedId_idx" ON "Video"("feedId");
-- One row per video per source, so a re-sync updates rather than duplicates.
CREATE UNIQUE INDEX "Video_source_externalId_key" ON "Video"("source", "externalId");

ALTER TABLE "Video" ADD CONSTRAINT "Video_feedId_fkey" FOREIGN KEY ("feedId") REFERENCES "VideoFeed"("id") ON DELETE SET NULL ON UPDATE CASCADE;
