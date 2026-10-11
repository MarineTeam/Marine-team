-- Gift Aid.
--
-- A UK church may reclaim basic-rate tax on an eligible donation, adding 25% to
-- it. The giving feature recorded everything needed except the thing that
-- actually decides it: GivingFund.taxDeductible says the *fund* is eligible,
-- and HMRC's requirement is a declaration from the *individual*.
--
-- The donor's name and address are copied onto the declaration rather than read
-- through the household, because HMRC wants the address the declaration was
-- made from and a family that moves must not retroactively alter a claim
-- already submitted — and because Person holds one displayName where the claim
-- schedule wants a forename and a surname in separate columns.

CREATE TYPE "DeclarationMethod" AS ENUM ('PAPER', 'ONLINE', 'VERBAL');

CREATE TABLE "GiftAidDeclaration" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "madeOn" DATE NOT NULL,
    -- Whether it reaches back over gifts already given. HMRC's standard wording
    -- allows four years; a forward-only declaration is a real thing too.
    "coversPast" BOOLEAN NOT NULL DEFAULT true,
    "title" TEXT,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "houseNumber" TEXT NOT NULL,
    "postcode" TEXT NOT NULL,
    "how" "DeclarationMethod" NOT NULL DEFAULT 'PAPER',
    -- Withdrawn from this day FORWARD. Gifts before it stay claimable: a
    -- withdrawal is a statement about the future, and treating it as
    -- retroactive would mean repaying claims that were correct when made.
    "withdrawnOn" DATE,
    "withdrawnNote" TEXT,
    "recordedByEmail" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GiftAidDeclaration_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "GiftAidDeclaration_personId_madeOn_idx" ON "GiftAidDeclaration"("personId", "madeOn");
CREATE INDEX "GiftAidDeclaration_withdrawnOn_idx" ON "GiftAidDeclaration"("withdrawnOn");

ALTER TABLE "GiftAidDeclaration" ADD CONSTRAINT "GiftAidDeclaration_personId_fkey"
    FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- One submission to HMRC. A row per claim rather than a boolean per gift,
-- because "which claim took it, and when did we send it" is the question that
-- gets asked — and because stamping the gifts is what makes the idempotence
-- real.
CREATE TABLE "GiftAidClaim" (
    "id" TEXT NOT NULL,
    "from" DATE NOT NULL,
    "to" DATE NOT NULL,
    -- Minor units, like every other money column here.
    "donationTotal" INTEGER NOT NULL,
    "claimTotal" INTEGER NOT NULL,
    "giftCount" INTEGER NOT NULL,
    "submittedOn" DATE,
    "settledOn" DATE,
    "reference" TEXT,
    "createdByEmail" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GiftAidClaim_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "GiftAidClaim_from_to_idx" ON "GiftAidClaim"("from", "to");

-- Which claim took this gift. Null means unclaimed; SetNull rather than Cascade
-- so deleting a claim that was never sent releases its gifts for the next one
-- rather than deleting the donations.
ALTER TABLE "Gift" ADD COLUMN "giftAidClaimId" TEXT;
ALTER TABLE "Gift" ADD CONSTRAINT "Gift_giftAidClaimId_fkey"
    FOREIGN KEY ("giftAidClaimId") REFERENCES "GiftAidClaim"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- The claim builder's lookup: unclaimed, settled gifts in a span.
CREATE INDEX "Gift_giftAidClaimId_idx" ON "Gift"("giftAidClaimId");
