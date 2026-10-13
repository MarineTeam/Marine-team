-- The membership roll, as an append-only log rather than a flag.
--
-- A boolean on Person would answer "are they a member now?" and nothing else.
-- The question an annual return and a denominational audit actually ask is
-- "who was on the roll on 31 December?", and a flag somebody has since
-- overwritten cannot answer it at all — so the roll is derived from the events
-- and the events are kept for ever.
--
-- One enum rather than a kind and a reason, because the direction IS the
-- reason: a baptism is a joining, a death is a leaving. Two columns would
-- invite the pair that cannot happen.
CREATE TYPE "MembershipChange" AS ENUM (
    'BAPTISM', 'PROFESSION', 'TRANSFER_IN', 'RESTORED',
    'DEATH', 'TRANSFER_OUT', 'REQUEST', 'LAPSED'
);

CREATE TABLE "MembershipEvent" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "change" "MembershipChange" NOT NULL,
    -- The day it took effect, not the day it was typed: a revision held in
    -- March records lapses dated to the previous 31 December.
    "on" DATE NOT NULL,
    "congregation" TEXT,
    -- Read one person at a time, never in a list. Why somebody left a church
    -- is the most sensitive line in this table.
    "note" TEXT,
    "recordedByEmail" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MembershipEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MembershipEvent_personId_on_idx" ON "MembershipEvent"("personId", "on");
-- The roll-at-a-date walk reads every event up to a cutoff, across everybody.
CREATE INDEX "MembershipEvent_on_idx" ON "MembershipEvent"("on");

-- Cascade: a person deleted outright takes their roll history with them. The
-- app soft-deletes people (Person.deletedAt), so this fires only on a genuine
-- hard delete, where leaving orphaned membership events would be worse.
ALTER TABLE "MembershipEvent" ADD CONSTRAINT "MembershipEvent_personId_fkey"
    FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;
