-- What language a sermon or a series is actually in, which is a different
-- question from what language the app's own screens are in.
ALTER TABLE "Series" ADD COLUMN "language" TEXT;
ALTER TABLE "Video" ADD COLUMN "language" TEXT;

-- Filtering "everything in Spanish" scans these, and both tables are the
-- large ones on a real site.
CREATE INDEX "Series_language_idx" ON "Series"("language");
CREATE INDEX "Video_language_idx" ON "Video"("language");
