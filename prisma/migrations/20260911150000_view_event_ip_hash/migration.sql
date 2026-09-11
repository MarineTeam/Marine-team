-- A throttle key for /api/view-events: an HMAC of the viewer's address, never
-- the address itself, blanked after a day. See src/lib/view-key.ts.
ALTER TABLE "ViewEvent" ADD COLUMN "ipHash" TEXT;

CREATE INDEX "ViewEvent_ipHash_createdAt_idx" ON "ViewEvent"("ipHash", "createdAt");
