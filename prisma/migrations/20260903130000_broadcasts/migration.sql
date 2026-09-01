-- Bulk email and SMS: a message, the audience resolved into rows, and consent.
CREATE TYPE "BroadcastAudience" AS ENUM ('EVERYONE', 'PERMISSION_GROUP', 'EVENT', 'SMALL_GROUP', 'TEAM');
CREATE TYPE "BroadcastStatus" AS ENUM ('DRAFT', 'SENDING', 'SENT', 'CANCELLED');
CREATE TYPE "BroadcastChannel" AS ENUM ('EMAIL', 'SMS', 'PUSH');
CREATE TYPE "DeliveryStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'SKIPPED');

ALTER TABLE "User" ADD COLUMN "phone" TEXT;
ALTER TABLE "User" ADD COLUMN "smsOptIn" BOOLEAN NOT NULL DEFAULT false;
-- On by default: somebody who turned off "a new sermon is up" has not asked to
-- miss "no service tomorrow, the road is closed".
ALTER TABLE "User" ADD COLUMN "broadcastEmails" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE "Broadcast" (
    "id" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "channels" "BroadcastChannel"[],
    "audience" "BroadcastAudience" NOT NULL DEFAULT 'EVERYONE',
    "audienceId" TEXT,
    "audienceName" TEXT,
    "status" "BroadcastStatus" NOT NULL DEFAULT 'DRAFT',
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),

    CONSTRAINT "Broadcast_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Broadcast_status_createdAt_idx" ON "Broadcast"("status", "createdAt");

CREATE TABLE "BroadcastRecipient" (
    "id" TEXT NOT NULL,
    "broadcastId" TEXT NOT NULL,
    "userId" TEXT,
    "channel" "BroadcastChannel" NOT NULL,
    "address" TEXT NOT NULL,
    "name" TEXT,
    "status" "DeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "error" TEXT,
    "sentAt" TIMESTAMP(3),

    CONSTRAINT "BroadcastRecipient_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BroadcastRecipient_broadcastId_channel_address_key" ON "BroadcastRecipient"("broadcastId", "channel", "address");
CREATE INDEX "BroadcastRecipient_broadcastId_status_idx" ON "BroadcastRecipient"("broadcastId", "status");

ALTER TABLE "BroadcastRecipient" ADD CONSTRAINT "BroadcastRecipient_broadcastId_fkey" FOREIGN KEY ("broadcastId") REFERENCES "Broadcast"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BroadcastRecipient" ADD CONSTRAINT "BroadcastRecipient_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
