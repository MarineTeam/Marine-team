-- The prayer wall: requests, their moderation state, and who has prayed.
CREATE TYPE "PrayerVisibility" AS ENUM ('EVERYONE', 'MEMBERS', 'LEADERS');
CREATE TYPE "PrayerStatus" AS ENUM ('PENDING', 'APPROVED', 'ANSWERED', 'HIDDEN');

CREATE TABLE "PrayerRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "name" TEXT,
    "body" TEXT NOT NULL,
    "anonymous" BOOLEAN NOT NULL DEFAULT false,
    "visibility" "PrayerVisibility" NOT NULL DEFAULT 'MEMBERS',
    "status" "PrayerStatus" NOT NULL DEFAULT 'PENDING',
    "answeredNote" TEXT,
    "answeredAt" TIMESTAMP(3),
    "moderatedBy" TEXT,
    "moderatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PrayerRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PrayerRequest_status_createdAt_idx" ON "PrayerRequest"("status", "createdAt");
CREATE INDEX "PrayerRequest_userId_idx" ON "PrayerRequest"("userId");

CREATE TABLE "PrayerIntercession" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PrayerIntercession_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PrayerIntercession_requestId_userId_key" ON "PrayerIntercession"("requestId", "userId");
CREATE INDEX "PrayerIntercession_requestId_idx" ON "PrayerIntercession"("requestId");

ALTER TABLE "PrayerRequest" ADD CONSTRAINT "PrayerRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PrayerIntercession" ADD CONSTRAINT "PrayerIntercession_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "PrayerRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PrayerIntercession" ADD CONSTRAINT "PrayerIntercession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
