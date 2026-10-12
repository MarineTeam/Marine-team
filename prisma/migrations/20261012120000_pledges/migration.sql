-- Pledges and campaigns.
--
-- Giving records what arrived. It could not answer "we asked for £400,000,
-- where are we?", which is the question a building appeal is actually run on.
--
-- Three numbers follow a campaign and must never be conflated: the target, the
-- amount pledged, and the amount received. A pledge is a statement of intent,
-- not income, and nothing downstream adds one to a giving total. A church that
-- mistakes £400,000 pledged for £400,000 received signs a contract it cannot
-- pay for.

CREATE TYPE "PledgeSchedule" AS ENUM ('ONE_OFF', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'ANNUAL');
CREATE TYPE "PledgeStatus" AS ENUM ('ACTIVE', 'FULFILLED', 'CANCELLED');

CREATE TABLE "GivingCampaign" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    -- Minor units. Nullable: an appeal may genuinely name no figure, and a
    -- zero would read as a target already reached.
    "target" INTEGER,
    "fundId" TEXT NOT NULL,
    "startsOn" DATE NOT NULL,
    "endsOn" DATE,
    -- The church-wide total only. An individual pledge is never public.
    "publicTotals" BOOLEAN NOT NULL DEFAULT false,
    "closed" BOOLEAN NOT NULL DEFAULT false,
    "createdByEmail" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GivingCampaign_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GivingCampaign_slug_key" ON "GivingCampaign"("slug");
CREATE INDEX "GivingCampaign_closed_startsOn_idx" ON "GivingCampaign"("closed", "startsOn");

ALTER TABLE "GivingCampaign" ADD CONSTRAINT "GivingCampaign_fundId_fkey"
    FOREIGN KEY ("fundId") REFERENCES "GivingFund"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "Pledge" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    -- Attached to a household, because that is how a family decides to give and
    -- how the gift records already attribute. A pledge from somebody with no
    -- household falls back to the person, so both are nullable and the rules
    -- require one.
    "householdId" TEXT,
    "personId" TEXT,
    -- The whole promise, not the instalment: £50 a month for two years is
    -- 120000 here with a MONTHLY schedule.
    "amount" INTEGER NOT NULL,
    "schedule" "PledgeSchedule" NOT NULL DEFAULT 'ONE_OFF',
    "startsOn" DATE NOT NULL,
    "endsOn" DATE,
    "status" "PledgeStatus" NOT NULL DEFAULT 'ACTIVE',
    "note" TEXT,
    -- Defaults to false: a promise made in confidence stays in it, and the
    -- people most likely to pledge largest are the most likely to care.
    "nameMayBeShown" BOOLEAN NOT NULL DEFAULT false,
    "recordedByEmail" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Pledge_pkey" PRIMARY KEY ("id")
);

-- One live pledge per household per campaign: a second is a change of mind,
-- which edits the first rather than adding to it.
CREATE UNIQUE INDEX "Pledge_campaignId_householdId_key" ON "Pledge"("campaignId", "householdId");
CREATE INDEX "Pledge_campaignId_status_idx" ON "Pledge"("campaignId", "status");
CREATE INDEX "Pledge_personId_idx" ON "Pledge"("personId");

ALTER TABLE "Pledge" ADD CONSTRAINT "Pledge_campaignId_fkey"
    FOREIGN KEY ("campaignId") REFERENCES "GivingCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- SetNull on both: deleting a household is a statement about a family unit, and
-- must not erase the record that somebody promised something.
ALTER TABLE "Pledge" ADD CONSTRAINT "Pledge_householdId_fkey"
    FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Pledge" ADD CONSTRAINT "Pledge_personId_fkey"
    FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;
