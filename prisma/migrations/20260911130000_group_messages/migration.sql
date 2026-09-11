-- A small group's own thread, between meetings.
--
-- Not live chat, which opens around a stream and closes after it. As private as
-- the group's address, and for the same reason: only people actually in the
-- group may read it.
CREATE TABLE "GroupMessage" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "authorName" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GroupMessage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "GroupMessage_groupId_id_idx" ON "GroupMessage"("groupId", "id");
CREATE INDEX "GroupMessage_userId_idx" ON "GroupMessage"("userId");

ALTER TABLE "GroupMessage" ADD CONSTRAINT "GroupMessage_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "SmallGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GroupMessage" ADD CONSTRAINT "GroupMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Keeps them in the group but stops the thread notifying them.
ALTER TABLE "SmallGroupMember" ADD COLUMN "muted" BOOLEAN NOT NULL DEFAULT false;
