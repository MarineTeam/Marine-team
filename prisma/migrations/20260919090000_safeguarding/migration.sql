-- Safeguarding clearance.
--
-- What a church may keep is the *fact* that somebody saw a document, on what
-- date, and what it cleared the volunteer to do until — not the document. So
-- there is no column here for a disclosure number, an offence or a scan; see
-- the comment on VolunteerClearance in schema.prisma.

CREATE TYPE "ClearanceKind" AS ENUM ('BACKGROUND_CHECK', 'REFERENCES', 'TRAINING');

CREATE TABLE "VolunteerClearance" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "ClearanceKind" NOT NULL,
    "verifiedOn" DATE NOT NULL,
    "expiresOn" DATE NOT NULL,
    "verifiedById" TEXT,
    "verifiedByEmail" TEXT NOT NULL,
    "reference" TEXT,
    "withdrawnAt" TIMESTAMP(3),
    "withdrawnReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VolunteerClearance_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "VolunteerClearance_userId_kind_idx" ON "VolunteerClearance"("userId", "kind");
-- The chase list walks this: everything running out, soonest first.
CREATE INDEX "VolunteerClearance_expiresOn_idx" ON "VolunteerClearance"("expiresOn");

-- Cascade on the volunteer: a deleted account takes its own records with it.
ALTER TABLE "VolunteerClearance" ADD CONSTRAINT "VolunteerClearance_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- SetNull on the verifier, with the email kept alongside: removing the
-- safeguarding officer's account must not erase the record of what they saw.
ALTER TABLE "VolunteerClearance" ADD CONSTRAINT "VolunteerClearance_verifiedById_fkey"
    FOREIGN KEY ("verifiedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- What a team requires. Empty for most teams: coffee does not need a
-- criminal-records check, and a church that requires one for everything ends
-- up with a list nobody maintains.
ALTER TABLE "ServiceTeam" ADD COLUMN "requiredClearances" "ClearanceKind"[] DEFAULT ARRAY[]::"ClearanceKind"[];

-- Site-wide settings, a singleton like AuthSettings and BrandSettings. The
-- desk requirement starts empty so switching this on is a decision, not a
-- Sunday morning where nobody can open the desk because no records exist yet.
CREATE TABLE "SafeguardingSettings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "checkinDeskRequires" "ClearanceKind"[] DEFAULT ARRAY[]::"ClearanceKind"[],
    "warnDays" INTEGER NOT NULL DEFAULT 60,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SafeguardingSettings_pkey" PRIMARY KEY ("id")
);

-- An expiry becomes a job in the follow-up queue like anything else.
ALTER TYPE "FollowUpSource" ADD VALUE 'CLEARANCE';
