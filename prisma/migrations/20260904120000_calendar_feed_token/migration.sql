-- The secret in a member's personal calendar-feed URL. A calendar app cannot
-- log in, so the URL is the credential: generated on request, and replaced
-- rather than repaired.
ALTER TABLE "User" ADD COLUMN "calendarToken" TEXT;
CREATE UNIQUE INDEX "User_calendarToken_key" ON "User"("calendarToken");
