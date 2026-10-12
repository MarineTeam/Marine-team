-- Restricted funds, and the balances that make them mean something.
--
-- The app already recorded income per fund and expenditure per fund and never
-- subtracted one from the other, so it held every number needed to answer "how
-- much of the building fund is left?" and could not answer it.
--
-- A restricted fund is money given for a stated purpose and nothing else. In
-- England and Wales that is a trust, and spending it elsewhere is a breach
-- rather than an irregularity — committed, as a rule, not by dishonesty but by
-- one bank account and no per-fund balance anywhere.
--
-- Default false: every fund that exists today was created without anybody
-- being asked, so calling them restricted would be inventing a legal
-- restriction on the church's behalf. A treasurer marks the ones that are.
ALTER TABLE "GivingFund" ADD COLUMN "restricted" BOOLEAN NOT NULL DEFAULT false;

-- Money moved between funds: the escape hatch the balances need, and the one
-- place they can be wrong on purpose. "authority" is NOT NULL because moving
-- money out of a restricted fund is the thing somebody has to explain years
-- later, and "the trustees agreed on 4 March" is the explanation.
CREATE TABLE "FundTransfer" (
    "id" TEXT NOT NULL,
    "fromFundId" TEXT NOT NULL,
    "toFundId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "movedOn" DATE NOT NULL,
    "authority" TEXT NOT NULL,
    "note" TEXT,
    "recordedByEmail" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FundTransfer_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "FundTransfer_fromFundId_movedOn_idx" ON "FundTransfer"("fromFundId", "movedOn");
CREATE INDEX "FundTransfer_toFundId_movedOn_idx" ON "FundTransfer"("toFundId", "movedOn");

-- Restricted, not cascading: a fund is closed rather than deleted precisely so
-- that a past statement can still name where the money went, and a transfer
-- whose source had vanished would be a hole in exactly that record.
ALTER TABLE "FundTransfer" ADD CONSTRAINT "FundTransfer_fromFundId_fkey"
    FOREIGN KEY ("fromFundId") REFERENCES "GivingFund"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FundTransfer" ADD CONSTRAINT "FundTransfer_toFundId_fkey"
    FOREIGN KEY ("toFundId") REFERENCES "GivingFund"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
