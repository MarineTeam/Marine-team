-- CreateEnum
CREATE TYPE "AnnouncementAudience" AS ENUM ('ALL', 'GUESTS', 'MEMBERS');

-- Note: the *_trgm_idx DROP INDEX statements Prisma generated here were
-- removed — see the README/FEATURES.md caveat about the trigram indexes
-- having no schema.prisma representation.

-- AlterTable
ALTER TABLE "Announcement" ADD COLUMN     "audience" "AnnouncementAudience" NOT NULL DEFAULT 'ALL',
ADD COLUMN     "expiresAt" TIMESTAMP(3),
ADD COLUMN     "publishAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Playlist" ADD COLUMN     "public" BOOLEAN NOT NULL DEFAULT false;
