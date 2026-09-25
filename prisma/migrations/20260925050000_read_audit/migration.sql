-- Who looked at something that identifies a person.
--
-- Writes have been logged since the beginning; this is the other half, and for
-- the data this app has grown into it is the half that matters. "Who has been
-- through my record" is a question a church may have to answer.
--
-- It does not repeat what was read: `kind` names a screen, and there is no
-- column for an amount, an address or a note. That is what stops an oversight
-- record becoming a second, more widely readable copy of the data it exists to
-- protect. `subjectId` is not a foreign key — the subject may be a household, a
-- group or a session, and a log that cascades away with its subject loses
-- exactly the entries somebody would later ask about.

CREATE TABLE "DataAccessLog" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "actorEmail" TEXT NOT NULL,
    "subjectId" TEXT,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DataAccessLog_pkey" PRIMARY KEY ("id")
);

-- The retention sweep.
CREATE INDEX "DataAccessLog_at_idx" ON "DataAccessLog"("at");
-- "Who has been through this record?" — the query a complaint starts with.
CREATE INDEX "DataAccessLog_subjectId_at_idx" ON "DataAccessLog"("subjectId", "at");
-- "What has this person been reading?"
CREATE INDEX "DataAccessLog_actorEmail_at_idx" ON "DataAccessLog"("actorEmail", "at");
-- The coalescing lookup, run on every audited read.
CREATE INDEX "DataAccessLog_kind_actorEmail_at_idx" ON "DataAccessLog"("kind", "actorEmail", "at");
