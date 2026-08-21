-- A hymnal book can now also be a series whose files are its individual
-- hymns, one per file — the shape dropped in 20260821120000, restored
-- alongside (not instead of) whole-book PDFs.
--
-- hymnPerFile is what tells the two apart: a series holding several files
-- is a shelf of complete books when false, and one book's hymns when true.
-- Nothing in the files themselves distinguishes the cases, so it's an
-- explicit choice rather than something inferred.

-- AlterTable
ALTER TABLE "Series" ADD COLUMN "hymnPerFile" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "FileAsset" ADD COLUMN "pageNumber" INTEGER,
ADD COLUMN "groupLabel" TEXT,
ADD COLUMN "lyricsText" TEXT;
