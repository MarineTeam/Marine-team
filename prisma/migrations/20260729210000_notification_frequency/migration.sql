-- CreateEnum
CREATE TYPE "NotificationFrequency" AS ENUM ('INSTANT', 'DAILY');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "notificationFrequency" "NotificationFrequency" NOT NULL DEFAULT 'INSTANT';

-- CreateTable
CREATE TABLE "PendingNotification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "url" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PendingNotification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PendingNotification_userId_idx" ON "PendingNotification"("userId");

-- AddForeignKey
ALTER TABLE "PendingNotification" ADD CONSTRAINT "PendingNotification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
