-- Small groups, their leaders, and the people who ask to join.
CREATE TYPE "GroupRole" AS ENUM ('LEADER', 'MEMBER');
CREATE TYPE "GroupMemberStatus" AS ENUM ('REQUESTED', 'ACTIVE', 'DECLINED');

CREATE TABLE "SmallGroup" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "meetsWhen" TEXT,
    "area" TEXT,
    "address" TEXT,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "openToJoin" BOOLEAN NOT NULL DEFAULT true,
    "capacity" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SmallGroup_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SmallGroup_slug_key" ON "SmallGroup"("slug");
CREATE INDEX "SmallGroup_published_idx" ON "SmallGroup"("published");

CREATE TABLE "SmallGroupMember" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "GroupRole" NOT NULL DEFAULT 'MEMBER',
    "status" "GroupMemberStatus" NOT NULL DEFAULT 'REQUESTED',
    "note" TEXT,
    "respondedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SmallGroupMember_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SmallGroupMember_groupId_userId_key" ON "SmallGroupMember"("groupId", "userId");
CREATE INDEX "SmallGroupMember_userId_status_idx" ON "SmallGroupMember"("userId", "status");
CREATE INDEX "SmallGroupMember_groupId_status_idx" ON "SmallGroupMember"("groupId", "status");

ALTER TABLE "SmallGroupMember" ADD CONSTRAINT "SmallGroupMember_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "SmallGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SmallGroupMember" ADD CONSTRAINT "SmallGroupMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
