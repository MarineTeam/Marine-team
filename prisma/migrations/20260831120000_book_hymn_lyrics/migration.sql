-- The words of a hymn inside a whole-book PDF.
--
-- Keyed by (file, number) rather than by a BookHymn row, because that table
-- is replaced whole on every reindex and these are typed by hand.
CREATE TABLE "BookHymnLyric" (
    "id" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "lyricsText" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BookHymnLyric_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BookHymnLyric_fileId_number_key" ON "BookHymnLyric"("fileId", "number");

CREATE INDEX "BookHymnLyric_fileId_idx" ON "BookHymnLyric"("fileId");

ALTER TABLE "BookHymnLyric" ADD CONSTRAINT "BookHymnLyric_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "FileAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
