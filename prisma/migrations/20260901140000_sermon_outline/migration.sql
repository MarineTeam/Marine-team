-- A fill-in-the-blank note outline for a talk, and each member's answers.
ALTER TABLE "Video" ADD COLUMN "noteOutline" TEXT;

CREATE TABLE "SermonOutlineAnswer" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "answers" JSONB NOT NULL,
    "outlineVersion" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SermonOutlineAnswer_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SermonOutlineAnswer_userId_videoId_key" ON "SermonOutlineAnswer"("userId", "videoId");

CREATE INDEX "SermonOutlineAnswer_videoId_idx" ON "SermonOutlineAnswer"("videoId");

ALTER TABLE "SermonOutlineAnswer" ADD CONSTRAINT "SermonOutlineAnswer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SermonOutlineAnswer" ADD CONSTRAINT "SermonOutlineAnswer_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "Video"("id") ON DELETE CASCADE ON UPDATE CASCADE;
