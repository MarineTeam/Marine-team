-- A hymnal book is now a single PDF whose embedded bookmarks are its table
-- of contents, and whose cover is drawn from its own first page. That
-- supersedes the hand-entered hymn metadata added hours earlier in
-- 20260821110000_hymnal_style: nothing typed these in, and nothing reads
-- them any more.

-- AlterTable
ALTER TABLE "FileAsset" DROP COLUMN "pageNumber",
DROP COLUMN "groupLabel",
DROP COLUMN "lyricsText";

-- AlterTable
ALTER TABLE "Series" DROP COLUMN "abbreviation";
