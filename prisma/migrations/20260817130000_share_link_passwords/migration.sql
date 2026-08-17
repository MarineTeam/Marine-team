-- AlterTable
ALTER TABLE "ShareLink" ADD COLUMN     "passwordHash" TEXT,
ADD COLUMN     "failedUnlockAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lastFailedUnlockAt" TIMESTAMP(3);
