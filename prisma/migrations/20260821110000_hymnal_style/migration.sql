-- AlterTable
ALTER TABLE "Category" ADD COLUMN     "hymnalStyle" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Series" ADD COLUMN     "abbreviation" TEXT;

-- AlterTable
ALTER TABLE "FileAsset" ADD COLUMN     "pageNumber" INTEGER,
ADD COLUMN     "groupLabel" TEXT,
ADD COLUMN     "lyricsText" TEXT;
