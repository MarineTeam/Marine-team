-- What the church holds and owes that no transaction implies.
--
-- A receipts-and-payments charity files two statements: the receipts and
-- payments account, and a statement of assets and liabilities. Most of the
-- second is already derivable — cash is the closing balance, what is owed to
-- suppliers is the approved-and-unpaid expenses, what HMRC owes is the
-- submitted-and-unsettled Gift Aid claims — but the building, the minibus and
-- the loan are facts nothing in this app can work out. They get typed in.
CREATE TYPE "HoldingKind" AS ENUM ('ASSET', 'LIABILITY');

CREATE TABLE "Holding" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "HoldingKind" NOT NULL,
    "amount" INTEGER NOT NULL,
    -- The year end this figure describes, not a single current value: a
    -- building valued in 2024 is not evidence of its 2026 value.
    "asAt" DATE NOT NULL,
    -- Null is unrestricted. The hall belongs to the church, not to the appeal
    -- that built it, unless somebody says otherwise.
    "fundId" TEXT,
    "note" TEXT,
    "recordedByEmail" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Holding_pkey" PRIMARY KEY ("id")
);

-- One figure per item per year end: a second would double the building.
CREATE UNIQUE INDEX "Holding_name_asAt_key" ON "Holding"("name", "asAt");
CREATE INDEX "Holding_asAt_idx" ON "Holding"("asAt");

-- SetNull rather than Cascade: closing a fund must not delete the record of
-- what the church owned, which is the figure a past statement was built on.
ALTER TABLE "Holding" ADD CONSTRAINT "Holding_fundId_fkey"
    FOREIGN KEY ("fundId") REFERENCES "GivingFund"("id") ON DELETE SET NULL ON UPDATE CASCADE;
