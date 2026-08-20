-- Per-address opt-out of the organization-membership check, for inviting a
-- guest without relaxing AUTHORIZATION_MODE for everyone. Defaults to false
-- for every existing row, so no current deployment's behavior changes: an
-- address only skips the organization check once an admin explicitly flags
-- it, one address at a time.

-- AlterTable
ALTER TABLE "AuthorizedEmail" ADD COLUMN     "organizationExempt" BOOLEAN NOT NULL DEFAULT false;
