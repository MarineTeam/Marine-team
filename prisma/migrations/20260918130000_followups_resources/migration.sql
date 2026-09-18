-- Follow-ups: the missing half of the pastoral data the app already collects.
-- Resources: the hall, the minibus, the projector, and refusing to book one twice.
CREATE TYPE "FollowUpSource" AS ENUM ('FORM', 'EVENT', 'GROUP_ABSENCE', 'MANUAL');
CREATE TYPE "FollowUpStatus" AS ENUM ('OPEN', 'DONE', 'DISMISSED');
CREATE TYPE "ResourceKind" AS ENUM ('ROOM', 'VEHICLE', 'EQUIPMENT');

CREATE TABLE "FollowUp" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "note" TEXT,
    "personId" TEXT,
    "householdId" TEXT,
    "assignedToId" TEXT,
    "status" "FollowUpStatus" NOT NULL DEFAULT 'OPEN',
    "source" "FollowUpSource" NOT NULL DEFAULT 'MANUAL',
    "sourceRef" TEXT,
    "dueOn" DATE NOT NULL,
    "outcome" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdByEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "FollowUp_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Resource" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "ResourceKind" NOT NULL DEFAULT 'ROOM',
    "capacity" INTEGER,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Resource_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ResourceBooking" (
    "id" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "eventId" TEXT,
    "title" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "createdByEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ResourceBooking_pkey" PRIMARY KEY ("id")
);

-- One job per prompt: the nightly sweep must not raise a second card for the
-- same submission every time it runs.
CREATE UNIQUE INDEX "FollowUp_source_sourceRef_key" ON "FollowUp"("source", "sourceRef");
CREATE INDEX "FollowUp_status_dueOn_idx" ON "FollowUp"("status", "dueOn");
CREATE INDEX "FollowUp_assignedToId_status_dueOn_idx" ON "FollowUp"("assignedToId", "status", "dueOn");
CREATE INDEX "FollowUp_personId_idx" ON "FollowUp"("personId");
CREATE INDEX "Resource_active_position_idx" ON "Resource"("active", "position");
CREATE INDEX "ResourceBooking_resourceId_startsAt_endsAt_idx" ON "ResourceBooking"("resourceId", "startsAt", "endsAt");
CREATE INDEX "ResourceBooking_eventId_idx" ON "ResourceBooking"("eventId");

ALTER TABLE "FollowUp" ADD CONSTRAINT "FollowUp_personId_fkey"
    FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FollowUp" ADD CONSTRAINT "FollowUp_householdId_fkey"
    FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FollowUp" ADD CONSTRAINT "FollowUp_assignedToId_fkey"
    FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ResourceBooking" ADD CONSTRAINT "ResourceBooking_resourceId_fkey"
    FOREIGN KEY ("resourceId") REFERENCES "Resource"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- Cascade: cancelling the event frees the hall.
ALTER TABLE "ResourceBooking" ADD CONSTRAINT "ResourceBooking_eventId_fkey"
    FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
