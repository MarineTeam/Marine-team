-- Asking somebody else to take your rota slot.
--
-- Flags on the assignment rather than a swap table of its own: what is asked
-- for is this slot, and covering it means the slot changes hands.
ALTER TABLE "ServiceAssignment" ADD COLUMN "coverWanted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ServiceAssignment" ADD COLUMN "coverNote" TEXT;
ALTER TABLE "ServiceAssignment" ADD COLUMN "coverAskedAt" TIMESTAMP(3);
ALTER TABLE "ServiceAssignment" ADD COLUMN "coveredForId" TEXT;
ALTER TABLE "ServiceAssignment" ADD COLUMN "coveredAt" TIMESTAMP(3);

CREATE INDEX "ServiceAssignment_teamId_coverWanted_idx" ON "ServiceAssignment"("teamId", "coverWanted");

-- SET NULL, not CASCADE: deleting the account of somebody who was covered for
-- must not delete the rota slot the person who covered is still on.
ALTER TABLE "ServiceAssignment" ADD CONSTRAINT "ServiceAssignment_coveredForId_fkey" FOREIGN KEY ("coveredForId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
