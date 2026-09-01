-- Chat beside a live stream, and the two things moderating it needs.
ALTER TABLE "LiveStream" ADD COLUMN "chatEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "LiveStream" ADD COLUMN "chatSlowMode" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "LiveChatMessage" (
    "id" TEXT NOT NULL,
    "streamId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "authorName" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LiveChatMessage_pkey" PRIMARY KEY ("id")
);

-- The poll: everything on this stream after the last id seen.
CREATE INDEX "LiveChatMessage_streamId_id_idx" ON "LiveChatMessage"("streamId", "id");
CREATE INDEX "LiveChatMessage_userId_idx" ON "LiveChatMessage"("userId");

CREATE TABLE "LiveChatMute" (
    "id" TEXT NOT NULL,
    "streamId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "mutedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LiveChatMute_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LiveChatMute_streamId_userId_key" ON "LiveChatMute"("streamId", "userId");

ALTER TABLE "LiveChatMessage" ADD CONSTRAINT "LiveChatMessage_streamId_fkey" FOREIGN KEY ("streamId") REFERENCES "LiveStream"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LiveChatMessage" ADD CONSTRAINT "LiveChatMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LiveChatMute" ADD CONSTRAINT "LiveChatMute_streamId_fkey" FOREIGN KEY ("streamId") REFERENCES "LiveStream"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LiveChatMute" ADD CONSTRAINT "LiveChatMute_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
