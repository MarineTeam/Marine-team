-- The members' directory: opt-in, and off by default.
--
-- The default is the feature. A directory somebody is in because they never
-- found the setting is a directory built without consent. Being listed
-- publishes a name; each contact detail is its own separate yes.
ALTER TABLE "User" ADD COLUMN "directoryListed" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "directoryShowEmail" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "directoryShowPhone" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "directoryNote" TEXT;

-- The directory lists authorized members who opted in, ordered by name.
CREATE INDEX "User_directoryListed_authorized_idx" ON "User"("directoryListed", "authorized");
