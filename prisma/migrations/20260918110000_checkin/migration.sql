-- Children's check-in. The security code is per household per session, so
-- siblings in different rooms carry one code between them; see lib/checkin.ts.
CREATE TABLE "CheckinSession" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "room" TEXT,
    "minAge" INTEGER,
    "maxAge" INTEGER,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CheckinSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CheckinRecord" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "broughtById" TEXT,
    "securityCode" TEXT NOT NULL,
    "checkedInAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "checkedOutAt" TIMESTAMP(3),
    "releasedToId" TEXT,
    "checkedInByEmail" TEXT,
    "releasedByEmail" TEXT,
    "overrideReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CheckinRecord_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CheckinSession_date_idx" ON "CheckinSession"("date");
CREATE INDEX "CheckinSession_closedAt_date_idx" ON "CheckinSession"("closedAt", "date");
-- One child per room per day: two volunteers scanning the same family at once
-- must not produce two labels for one child.
CREATE UNIQUE INDEX "CheckinRecord_sessionId_childId_key" ON "CheckinRecord"("sessionId", "childId");
CREATE INDEX "CheckinRecord_sessionId_checkedOutAt_idx" ON "CheckinRecord"("sessionId", "checkedOutAt");
CREATE INDEX "CheckinRecord_childId_idx" ON "CheckinRecord"("childId");

ALTER TABLE "CheckinRecord" ADD CONSTRAINT "CheckinRecord_sessionId_fkey"
    FOREIGN KEY ("sessionId") REFERENCES "CheckinSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CheckinRecord" ADD CONSTRAINT "CheckinRecord_childId_fkey"
    FOREIGN KEY ("childId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CheckinRecord" ADD CONSTRAINT "CheckinRecord_broughtById_fkey"
    FOREIGN KEY ("broughtById") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CheckinRecord" ADD CONSTRAINT "CheckinRecord_releasedToId_fkey"
    FOREIGN KEY ("releasedToId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;
