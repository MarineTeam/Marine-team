-- Something for a group to work through after a sermon.
--
-- LEADER_NOTE is the point of the enum: the visible shape of a guide (see
-- lib/guides.ts) has no field a leader note can be rendered from, so a page
-- cannot print one by forgetting to check.

CREATE TYPE "GuideItemKind" AS ENUM ('QUESTION', 'SCRIPTURE', 'NOTE', 'LEADER_NOTE');

CREATE TABLE "DiscussionGuide" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "seriesId" TEXT,
    "videoId" TEXT,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DiscussionGuide_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DiscussionGuide_slug_key" ON "DiscussionGuide"("slug");
CREATE INDEX "DiscussionGuide_published_updatedAt_idx" ON "DiscussionGuide"("published", "updatedAt");
CREATE INDEX "DiscussionGuide_seriesId_idx" ON "DiscussionGuide"("seriesId");
CREATE INDEX "DiscussionGuide_videoId_idx" ON "DiscussionGuide"("videoId");

CREATE TABLE "DiscussionGuideItem" (
    "id" TEXT NOT NULL,
    "guideId" TEXT NOT NULL,
    "kind" "GuideItemKind" NOT NULL DEFAULT 'QUESTION',
    "body" TEXT NOT NULL,
    "reference" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "DiscussionGuideItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DiscussionGuideItem_guideId_position_idx" ON "DiscussionGuideItem"("guideId", "position");

ALTER TABLE "SmallGroupMeeting" ADD COLUMN "guideId" TEXT;
CREATE INDEX "SmallGroupMeeting_guideId_idx" ON "SmallGroupMeeting"("guideId");

-- SET NULL throughout: deleting a sermon must not delete the study written
-- around it, and deleting a guide must not delete the record that a group met.
ALTER TABLE "DiscussionGuide" ADD CONSTRAINT "DiscussionGuide_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "Series"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DiscussionGuide" ADD CONSTRAINT "DiscussionGuide_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "Video"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DiscussionGuideItem" ADD CONSTRAINT "DiscussionGuideItem_guideId_fkey" FOREIGN KEY ("guideId") REFERENCES "DiscussionGuide"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SmallGroupMeeting" ADD CONSTRAINT "SmallGroupMeeting_guideId_fkey" FOREIGN KEY ("guideId") REFERENCES "DiscussionGuide"("id") ON DELETE SET NULL ON UPDATE CASCADE;
