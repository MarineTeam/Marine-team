-- Cached Bunny Stream MP4-fallback metadata, so the download endpoint can
-- decide from Postgres instead of calling Bunny on every request.
--
-- Both nullable and left NULL for existing rows on purpose: NULL means "never
-- synced from Bunny", which the download endpoint treats as a cue to fetch
-- once and backfill, rather than as "this video has no MP4".

-- AlterTable
ALTER TABLE "Video" ADD COLUMN     "hasMp4Fallback" BOOLEAN;

-- AlterTable
ALTER TABLE "Video" ADD COLUMN     "mp4Resolutions" TEXT;
