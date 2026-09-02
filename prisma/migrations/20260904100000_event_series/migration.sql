-- Repeating events: the rule and the template each date is stamped from.
--
-- A series is not itself an event; every date it produces is an ordinary
-- "Event" row with its own sign-up list. Hence the FK below is SET NULL:
-- stopping a series repeating must never delete somebody's place.

CREATE TABLE "EventSeries" (
    "id" TEXT NOT NULL,
    "rule" TEXT NOT NULL,
    "timeZone" TEXT NOT NULL DEFAULT 'UTC',
    "startDate" DATE NOT NULL,
    "startTime" TEXT,
    "durationMinutes" INTEGER,
    "allDay" BOOLEAN NOT NULL DEFAULT false,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "location" TEXT,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "memberOnly" BOOLEAN NOT NULL DEFAULT false,
    "registration" BOOLEAN NOT NULL DEFAULT false,
    "capacity" INTEGER,
    "waitlist" BOOLEAN NOT NULL DEFAULT true,
    "maxGuests" INTEGER NOT NULL DEFAULT 0,
    "opensDaysBefore" INTEGER,
    "closesDaysBefore" INTEGER,
    "generatedThrough" DATE,
    "excludedDates" DATE[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventSeries_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "EventSeries_generatedThrough_idx" ON "EventSeries"("generatedThrough");

ALTER TABLE "Event" ADD COLUMN "seriesId" TEXT;
ALTER TABLE "Event" ADD COLUMN "occurrenceDate" DATE;

-- One row per date per series, so generating again is idempotent rather than
-- doubling the diary.
CREATE UNIQUE INDEX "Event_seriesId_occurrenceDate_key" ON "Event"("seriesId", "occurrenceDate");

ALTER TABLE "Event" ADD CONSTRAINT "Event_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "EventSeries"("id") ON DELETE SET NULL ON UPDATE CASCADE;
