-- A full group can still take names.
--
-- WAITLIST sits before REQUESTED, not beside it: a name on the list is not yet
-- in front of the leader. A place opening moves the longest-waiting one to
-- REQUESTED, because the leader's yes is what the address travels with.
ALTER TYPE "GroupMemberStatus" ADD VALUE 'WAITLIST';

ALTER TABLE "SmallGroup" ADD COLUMN "waitlist" BOOLEAN NOT NULL DEFAULT true;
