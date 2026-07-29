-- CreateEnum
CREATE TYPE "SlugAliasType" AS ENUM ('SERIES', 'VIDEO');

-- Note: the *_trgm_idx DROP INDEX statements Prisma generated here were
-- removed — see the README/FEATURES.md caveat about the trigram indexes
-- having no schema.prisma representation.

-- AlterTable
ALTER TABLE "Category" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "FileAsset" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Series" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Video" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "SermonNote" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "timestampSeconds" INTEGER NOT NULL DEFAULT 0,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SermonNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SlugAlias" (
    "id" TEXT NOT NULL,
    "type" "SlugAliasType" NOT NULL,
    "oldSlug" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SlugAlias_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SermonNote_userId_videoId_idx" ON "SermonNote"("userId", "videoId");

-- CreateIndex
CREATE INDEX "SlugAlias_targetId_idx" ON "SlugAlias"("targetId");

-- CreateIndex
CREATE UNIQUE INDEX "SlugAlias_type_oldSlug_key" ON "SlugAlias"("type", "oldSlug");

-- AddForeignKey
ALTER TABLE "SermonNote" ADD CONSTRAINT "SermonNote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SermonNote" ADD CONSTRAINT "SermonNote_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "Video"("id") ON DELETE CASCADE ON UPDATE CASCADE;
