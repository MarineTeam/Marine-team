-- Televisions signed in to an account, by way of a code on the screen.
CREATE TYPE "TvDeviceStatus" AS ENUM ('PENDING', 'APPROVED', 'DENIED', 'LINKED', 'REVOKED');

CREATE TABLE "TvDevice" (
    "id" TEXT NOT NULL,
    "userCode" TEXT NOT NULL,
    "deviceCodeHash" TEXT NOT NULL,
    "status" "TvDeviceStatus" NOT NULL DEFAULT 'PENDING',
    "deviceName" TEXT NOT NULL,
    "deviceKind" TEXT,
    "userId" TEXT,
    "tokenHash" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "approvedAt" TIMESTAMP(3),
    "linkedAt" TIMESTAMP(3),
    "lastSeenAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TvDevice_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TvDevice_userCode_key" ON "TvDevice"("userCode");
CREATE UNIQUE INDEX "TvDevice_deviceCodeHash_key" ON "TvDevice"("deviceCodeHash");
CREATE UNIQUE INDEX "TvDevice_tokenHash_key" ON "TvDevice"("tokenHash");
CREATE INDEX "TvDevice_userId_status_idx" ON "TvDevice"("userId", "status");
CREATE INDEX "TvDevice_expiresAt_idx" ON "TvDevice"("expiresAt");

ALTER TABLE "TvDevice" ADD CONSTRAINT "TvDevice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
