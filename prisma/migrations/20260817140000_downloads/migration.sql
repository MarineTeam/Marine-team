-- CreateEnum
CREATE TYPE "DownloadPlatform" AS ENUM ('WEB', 'PWA', 'BOTH');

-- CreateEnum
CREATE TYPE "DownloadAudience" AS ENUM ('ALL_MEMBERS', 'SPECIFIC');

-- AlterTable
ALTER TABLE "Category" ADD COLUMN     "downloadEnabled" BOOLEAN;

-- AlterTable
ALTER TABLE "Series" ADD COLUMN     "downloadEnabled" BOOLEAN;

-- AlterTable
ALTER TABLE "Video" ADD COLUMN     "downloadEnabled" BOOLEAN;

-- CreateTable
CREATE TABLE "DownloadPolicy" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "platform" "DownloadPlatform" NOT NULL DEFAULT 'BOTH',
    "audience" "DownloadAudience" NOT NULL DEFAULT 'ALL_MEMBERS',
    "maxDeviceGb" INTEGER NOT NULL DEFAULT 8,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DownloadPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DownloadPolicyGroup" (
    "id" TEXT NOT NULL,
    "policyId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,

    CONSTRAINT "DownloadPolicyGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DownloadPolicyUser" (
    "id" TEXT NOT NULL,
    "policyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "DownloadPolicyUser_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DownloadPolicyGroup_groupId_idx" ON "DownloadPolicyGroup"("groupId");

-- CreateIndex
CREATE UNIQUE INDEX "DownloadPolicyGroup_policyId_groupId_key" ON "DownloadPolicyGroup"("policyId", "groupId");

-- CreateIndex
CREATE INDEX "DownloadPolicyUser_userId_idx" ON "DownloadPolicyUser"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "DownloadPolicyUser_policyId_userId_key" ON "DownloadPolicyUser"("policyId", "userId");

-- AddForeignKey
ALTER TABLE "DownloadPolicyGroup" ADD CONSTRAINT "DownloadPolicyGroup_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "DownloadPolicy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DownloadPolicyGroup" ADD CONSTRAINT "DownloadPolicyGroup_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "PermissionGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DownloadPolicyUser" ADD CONSTRAINT "DownloadPolicyUser_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "DownloadPolicy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DownloadPolicyUser" ADD CONSTRAINT "DownloadPolicyUser_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
