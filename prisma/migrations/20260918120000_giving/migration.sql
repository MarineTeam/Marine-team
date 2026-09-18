-- Giving. No card number, expiry or token is stored here and none reaches the
-- app: payment happens on the processor's hosted page and the webhook returns
-- an amount, a fund and an opaque reference. Amounts are minor units as
-- integers — money through a binary fraction fails to add up in December.
CREATE TYPE "GiftSource" AS ENUM ('ONLINE', 'CASH', 'CHEQUE', 'BANK_TRANSFER', 'OTHER');
CREATE TYPE "GiftStatus" AS ENUM ('SETTLED', 'REFUNDED');

CREATE TABLE "GivingFund" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "taxDeductible" BOOLEAN NOT NULL DEFAULT true,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "GivingFund_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Gift" (
    "id" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'GBP',
    "fundId" TEXT NOT NULL,
    "giverId" TEXT,
    "householdId" TEXT,
    "source" "GiftSource" NOT NULL DEFAULT 'ONLINE',
    "status" "GiftStatus" NOT NULL DEFAULT 'SETTLED',
    "externalId" TEXT,
    "givenAt" TIMESTAMP(3) NOT NULL,
    "message" TEXT,
    "note" TEXT,
    "recordedByEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Gift_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GivingFund_slug_key" ON "GivingFund"("slug");
CREATE INDEX "GivingFund_active_position_idx" ON "GivingFund"("active", "position");
-- The unique reference is what makes the webhook idempotent: the same event
-- delivered twice records one gift.
CREATE UNIQUE INDEX "Gift_externalId_key" ON "Gift"("externalId");
CREATE INDEX "Gift_givenAt_idx" ON "Gift"("givenAt");
CREATE INDEX "Gift_fundId_givenAt_idx" ON "Gift"("fundId", "givenAt");
CREATE INDEX "Gift_householdId_givenAt_idx" ON "Gift"("householdId", "givenAt");
CREATE INDEX "Gift_giverId_givenAt_idx" ON "Gift"("giverId", "givenAt");
CREATE INDEX "Gift_status_givenAt_idx" ON "Gift"("status", "givenAt");

ALTER TABLE "Gift" ADD CONSTRAINT "Gift_fundId_fkey"
    FOREIGN KEY ("fundId") REFERENCES "GivingFund"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- SetNull on both: deleting a person must never silently change what the
-- accounts say was received.
ALTER TABLE "Gift" ADD CONSTRAINT "Gift_giverId_fkey"
    FOREIGN KEY ("giverId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Gift" ADD CONSTRAINT "Gift_householdId_fkey"
    FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE SET NULL ON UPDATE CASCADE;
