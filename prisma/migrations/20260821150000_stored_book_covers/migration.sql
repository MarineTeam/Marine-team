-- Book covers and hymn counts were derived in every visitor's browser, by
-- opening the PDF to draw its first page and read its bookmarks. Deriving
-- them once and storing them makes a book grid cost a page load instead of
-- a PDF fetch per card.
--
-- Nothing is back-filled: an absent cover falls back to deriving it live,
-- exactly as before, so this is only ever an improvement once an admin runs
-- "Generate covers".

-- AlterTable
ALTER TABLE "FileAsset" ADD COLUMN "coverDataUrl" TEXT,
ADD COLUMN "hymnCount" INTEGER;
