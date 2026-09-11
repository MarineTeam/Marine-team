-- One evening a small group met, and who was there.
--
-- A meeting is a row rather than a computed date because a group's schedule is
-- free text and always will be. APOLOGIES is deliberately not ABSENT: a group
-- that cannot tell "let us know" from "vanished" chases the wrong person.

CREATE TYPE "AttendanceStatus" AS ENUM ('PRESENT', 'APOLOGIES', 'ABSENT');

CREATE TABLE "SmallGroupMeeting" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "topic" TEXT,
    "visitorCount" INTEGER NOT NULL DEFAULT 0,
    "cancelled" BOOLEAN NOT NULL DEFAULT false,
    "leaderNotes" TEXT,
    "recordedByEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SmallGroupMeeting_pkey" PRIMARY KEY ("id")
);

-- One meeting per group per day: two leaders opening the form at once must not
-- produce two rolls that each hold half the answers.
CREATE UNIQUE INDEX "SmallGroupMeeting_groupId_date_key" ON "SmallGroupMeeting"("groupId", "date");
CREATE INDEX "SmallGroupMeeting_groupId_date_idx" ON "SmallGroupMeeting"("groupId", "date");

CREATE TABLE "GroupAttendance" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "AttendanceStatus" NOT NULL DEFAULT 'PRESENT',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GroupAttendance_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GroupAttendance_meetingId_userId_key" ON "GroupAttendance"("meetingId", "userId");
CREATE INDEX "GroupAttendance_userId_idx" ON "GroupAttendance"("userId");

ALTER TABLE "SmallGroupMeeting" ADD CONSTRAINT "SmallGroupMeeting_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "SmallGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GroupAttendance" ADD CONSTRAINT "GroupAttendance_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "SmallGroupMeeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GroupAttendance" ADD CONSTRAINT "GroupAttendance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
