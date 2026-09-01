-- Teams, who is on them, who is scheduled for what, and when people are away.
CREATE TYPE "AssignmentStatus" AS ENUM ('INVITED', 'ACCEPTED', 'DECLINED');

CREATE TABLE "ServiceTeam" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServiceTeam_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ServiceTeamMember" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "position" TEXT,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServiceTeamMember_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ServiceTeamMember_teamId_userId_key" ON "ServiceTeamMember"("teamId", "userId");
CREATE INDEX "ServiceTeamMember_userId_idx" ON "ServiceTeamMember"("userId");

CREATE TABLE "ServiceAssignment" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "position" TEXT NOT NULL DEFAULT '',
    "status" "AssignmentStatus" NOT NULL DEFAULT 'INVITED',
    "note" TEXT,
    "respondedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServiceAssignment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ServiceAssignment_planId_userId_position_key" ON "ServiceAssignment"("planId", "userId", "position");
CREATE INDEX "ServiceAssignment_planId_idx" ON "ServiceAssignment"("planId");
CREATE INDEX "ServiceAssignment_userId_status_idx" ON "ServiceAssignment"("userId", "status");

CREATE TABLE "ServiceBlockout" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServiceBlockout_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ServiceBlockout_userId_startDate_idx" ON "ServiceBlockout"("userId", "startDate");

ALTER TABLE "ServiceTeamMember" ADD CONSTRAINT "ServiceTeamMember_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "ServiceTeam"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ServiceTeamMember" ADD CONSTRAINT "ServiceTeamMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ServiceAssignment" ADD CONSTRAINT "ServiceAssignment_planId_fkey" FOREIGN KEY ("planId") REFERENCES "ServicePlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ServiceAssignment" ADD CONSTRAINT "ServiceAssignment_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "ServiceTeam"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ServiceAssignment" ADD CONSTRAINT "ServiceAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ServiceBlockout" ADD CONSTRAINT "ServiceBlockout_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
