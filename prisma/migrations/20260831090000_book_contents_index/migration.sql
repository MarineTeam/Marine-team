-- A hymnal's hymns live in its PDF's embedded bookmarks, which only a browser
-- with that PDF open can resolve — so a category holding six scanned books
-- could not be searched at all. Nobody waits for six PDFs to be parsed to
-- find out which one has "It Is Well".
--
-- An admin now resolves each book's contents once (in a browser, since that
-- is where pdf.js runs) and the result lands here, where one query reaches
-- every book in a section. `page` is a PDF page, like everything else stored
-- about a position in a book: the printed number is derived for display, so
-- correcting a book's page offset relabels these without reindexing.

-- AlterTable
ALTER TABLE "FileAsset" ADD COLUMN "contentsIndexedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "BookHymn" (
    "id" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "number" INTEGER,
    "page" INTEGER NOT NULL,
    "depth" INTEGER NOT NULL DEFAULT 0,
    "position" INTEGER NOT NULL,

    CONSTRAINT "BookHymn_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BookHymn_fileId_idx" ON "BookHymn"("fileId");

-- CreateIndex
CREATE INDEX "BookHymn_number_idx" ON "BookHymn"("number");

-- CreateIndex
CREATE INDEX "BookHymn_title_idx" ON "BookHymn"("title");

-- AddForeignKey
ALTER TABLE "BookHymn" ADD CONSTRAINT "BookHymn_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "FileAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
