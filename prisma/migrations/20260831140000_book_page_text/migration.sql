-- The text of a book's pages, read from its text layer or off the image.
ALTER TABLE "FileAsset" ADD COLUMN "textIndexedAt" TIMESTAMP(3);

CREATE TABLE "BookPage" (
    "id" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "page" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "source" TEXT NOT NULL,

    CONSTRAINT "BookPage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BookPage_fileId_page_key" ON "BookPage"("fileId", "page");

CREATE INDEX "BookPage_fileId_idx" ON "BookPage"("fileId");

ALTER TABLE "BookPage" ADD CONSTRAINT "BookPage_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "FileAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
