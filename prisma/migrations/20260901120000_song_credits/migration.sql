-- BookHymnLyric now holds more than lyrics — the credits a licence return and
-- a projector both need — so it is renamed for what it is. Renamed rather
-- than replaced so nothing typed into it is lost.
ALTER TABLE "BookHymnLyric" RENAME TO "BookHymnDetail";
ALTER INDEX "BookHymnLyric_pkey" RENAME TO "BookHymnDetail_pkey";
ALTER INDEX "BookHymnLyric_fileId_number_key" RENAME TO "BookHymnDetail_fileId_number_key";
ALTER INDEX "BookHymnLyric_fileId_idx" RENAME TO "BookHymnDetail_fileId_idx";
ALTER TABLE "BookHymnDetail" RENAME CONSTRAINT "BookHymnLyric_fileId_fkey" TO "BookHymnDetail_fileId_fkey";

-- A hymn can now have credits without anybody having typed its words.
ALTER TABLE "BookHymnDetail" ALTER COLUMN "lyricsText" DROP NOT NULL;

ALTER TABLE "BookHymnDetail" ADD COLUMN "ccliNumber" TEXT;
ALTER TABLE "BookHymnDetail" ADD COLUMN "author" TEXT;
ALTER TABLE "BookHymnDetail" ADD COLUMN "copyright" TEXT;
ALTER TABLE "BookHymnDetail" ADD COLUMN "musicalKey" TEXT;
ALTER TABLE "BookHymnDetail" ADD COLUMN "tempoBpm" INTEGER;

-- The same credits for a hymn that is its own file.
ALTER TABLE "FileAsset" ADD COLUMN "ccliNumber" TEXT;
ALTER TABLE "FileAsset" ADD COLUMN "songAuthor" TEXT;
ALTER TABLE "FileAsset" ADD COLUMN "songCopyright" TEXT;
ALTER TABLE "FileAsset" ADD COLUMN "musicalKey" TEXT;
ALTER TABLE "FileAsset" ADD COLUMN "tempoBpm" INTEGER;
