-- Two things a hymnal-shaped library had no room for.
--
-- FileFavorite: series and videos have been favouritable since the beginning,
-- but a hymn is a file, and files weren't — so the one thing members look up
-- most was the one thing they couldn't keep a list of.
--
-- ServicePlan / ServicePlanItem: the running order for a service. Not a
-- Playlist, which is a member's own, holds videos, and has no date; this is
-- staff-published and everyone in the building opens the same copy. An item
-- is either a hymn that is its own file, or a number inside a whole-book PDF
-- — hymnNumber holds the number that goes up on the board, and the page it
-- lands on is resolved from the book's own contents when someone opens it,
-- so nobody has to know which PDF page that is.

-- CreateTable
CREATE TABLE "FileFavorite" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FileFavorite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServicePlan" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "serviceDate" TIMESTAMP(3),
    "notes" TEXT,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServicePlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServicePlanItem" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "hymnNumber" INTEGER,
    "note" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServicePlanItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FileFavorite_fileId_idx" ON "FileFavorite"("fileId");

-- CreateIndex
CREATE UNIQUE INDEX "FileFavorite_userId_fileId_key" ON "FileFavorite"("userId", "fileId");

-- CreateIndex
CREATE INDEX "ServicePlan_serviceDate_idx" ON "ServicePlan"("serviceDate");

-- CreateIndex
CREATE INDEX "ServicePlanItem_planId_idx" ON "ServicePlanItem"("planId");

-- CreateIndex
CREATE INDEX "ServicePlanItem_fileId_idx" ON "ServicePlanItem"("fileId");

-- AddForeignKey
ALTER TABLE "FileFavorite" ADD CONSTRAINT "FileFavorite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FileFavorite" ADD CONSTRAINT "FileFavorite_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "FileAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServicePlanItem" ADD CONSTRAINT "ServicePlanItem_planId_fkey" FOREIGN KEY ("planId") REFERENCES "ServicePlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServicePlanItem" ADD CONSTRAINT "ServicePlanItem_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "FileAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
