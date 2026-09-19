-- Replies to the texts this app sends. Threaded by number rather than by
-- account: most of the people a church texts have no account, and a reply from
-- an unrecognised number is still a reply somebody needs to read.
CREATE TYPE "SmsDirection" AS ENUM ('INBOUND', 'OUTBOUND');

CREATE TABLE "SmsMessage" (
    "id" TEXT NOT NULL,
    "direction" "SmsDirection" NOT NULL,
    "phone" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "userId" TEXT,
    "personId" TEXT,
    "providerId" TEXT,
    "readAt" TIMESTAMP(3),
    "sentByEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SmsMessage_pkey" PRIMARY KEY ("id")
);

-- Makes delivery idempotent: a gateway that retries must not put the same
-- reply in the inbox twice.
CREATE UNIQUE INDEX "SmsMessage_providerId_key" ON "SmsMessage"("providerId");
CREATE INDEX "SmsMessage_phone_createdAt_idx" ON "SmsMessage"("phone", "createdAt");
CREATE INDEX "SmsMessage_readAt_createdAt_idx" ON "SmsMessage"("readAt", "createdAt");

ALTER TABLE "SmsMessage" ADD CONSTRAINT "SmsMessage_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SmsMessage" ADD CONSTRAINT "SmsMessage_personId_fkey"
    FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;
