-- Schedules: the rotas a group runs, from a spreadsheet or from the admin
-- interface. Ported from the calendar app.
CREATE TYPE "ScheduleSourceType" AS ENUM ('WEB', 'GOOGLE_SHEETS');
CREATE TYPE "SheetFormat" AS ENUM ('DATE_NAMES', 'NAME_COLUMNS');
CREATE TYPE "ScheduleSyncStatus" AS ENUM ('NEVER', 'RUNNING', 'SUCCESS', 'PARTIAL', 'FAILED');
CREATE TYPE "CalendarEventStatus" AS ENUM ('CONFIRMED', 'TENTATIVE', 'CANCELLED');

CREATE TABLE "Schedule" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "icon" TEXT NOT NULL DEFAULT 'calendar',
    "color" TEXT NOT NULL DEFAULT 'slate',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "sourceType" "ScheduleSourceType" NOT NULL DEFAULT 'WEB',
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Schedule_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Schedule_slug_key" ON "Schedule"("slug");
CREATE INDEX "Schedule_enabled_displayOrder_idx" ON "Schedule"("enabled", "displayOrder");
CREATE INDEX "Schedule_updatedAt_idx" ON "Schedule"("updatedAt");

CREATE TABLE "ScheduleSource" (
    "id" TEXT NOT NULL,
    "scheduleId" TEXT NOT NULL,
    "type" "ScheduleSourceType" NOT NULL,
    "spreadsheetId" TEXT,
    "sheetName" TEXT,
    "range" TEXT,
    "format" "SheetFormat",
    "parserConfig" JSONB NOT NULL DEFAULT '{}',
    "syncIntervalMinutes" INTEGER NOT NULL DEFAULT 60,
    "lastSyncedAt" TIMESTAMP(3),
    "lastSyncStatus" "ScheduleSyncStatus" NOT NULL DEFAULT 'NEVER',
    "lastSyncError" TEXT,
    "lastSyncHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScheduleSource_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ScheduleSource_scheduleId_key" ON "ScheduleSource"("scheduleId");

CREATE TABLE "Person" (
    "id" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "userId" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Person_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Person_normalizedName_key" ON "Person"("normalizedName");
CREATE UNIQUE INDEX "Person_userId_key" ON "Person"("userId");
CREATE INDEX "Person_active_displayName_idx" ON "Person"("active", "displayName");
CREATE INDEX "Person_updatedAt_idx" ON "Person"("updatedAt");

CREATE TABLE "PersonAlias" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PersonAlias_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PersonAlias_normalizedName_key" ON "PersonAlias"("normalizedName");
CREATE INDEX "PersonAlias_personId_idx" ON "PersonAlias"("personId");

CREATE TABLE "CalendarEvent" (
    "id" TEXT NOT NULL,
    "scheduleId" TEXT NOT NULL,
    "externalId" TEXT,
    "date" DATE NOT NULL,
    "endDate" DATE,
    "allDay" BOOLEAN NOT NULL DEFAULT true,
    "startTime" TEXT,
    "endTime" TEXT,
    "title" TEXT,
    "notes" TEXT,
    "location" TEXT,
    "status" "CalendarEventStatus" NOT NULL DEFAULT 'CONFIRMED',
    "recurrenceRule" TEXT,
    "recurrenceEndDate" DATE,
    "parentEventId" TEXT,
    "origin" "ScheduleSourceType" NOT NULL DEFAULT 'WEB',
    "sourceRow" INTEGER,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalendarEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CalendarEvent_scheduleId_externalId_key" ON "CalendarEvent"("scheduleId", "externalId");
CREATE INDEX "CalendarEvent_scheduleId_date_idx" ON "CalendarEvent"("scheduleId", "date");
CREATE INDEX "CalendarEvent_date_idx" ON "CalendarEvent"("date");
CREATE INDEX "CalendarEvent_updatedAt_idx" ON "CalendarEvent"("updatedAt");
CREATE INDEX "CalendarEvent_parentEventId_idx" ON "CalendarEvent"("parentEventId");

CREATE TABLE "CalendarEventPerson" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "role" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CalendarEventPerson_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CalendarEventPerson_eventId_personId_key" ON "CalendarEventPerson"("eventId", "personId");
CREATE INDEX "CalendarEventPerson_personId_idx" ON "CalendarEventPerson"("personId");
CREATE INDEX "CalendarEventPerson_eventId_position_idx" ON "CalendarEventPerson"("eventId", "position");

ALTER TABLE "ScheduleSource" ADD CONSTRAINT "ScheduleSource_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "Schedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Person" ADD CONSTRAINT "Person_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PersonAlias" ADD CONSTRAINT "PersonAlias_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "Schedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_parentEventId_fkey" FOREIGN KEY ("parentEventId") REFERENCES "CalendarEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CalendarEventPerson" ADD CONSTRAINT "CalendarEventPerson_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "CalendarEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CalendarEventPerson" ADD CONSTRAINT "CalendarEventPerson_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;
