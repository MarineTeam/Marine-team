-- A hymn somebody opened. Separate from ViewEvent, which counts series and
-- videos; a hymn is neither, and can be a number inside a book.
CREATE TABLE "HymnLookup" (
    "id" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "number" INTEGER,
    "source" TEXT NOT NULL,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HymnLookup_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "HymnLookup_createdAt_idx" ON "HymnLookup"("createdAt");

CREATE INDEX "HymnLookup_fileId_number_createdAt_idx" ON "HymnLookup"("fileId", "number", "createdAt");

ALTER TABLE "HymnLookup" ADD CONSTRAINT "HymnLookup_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "FileAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
