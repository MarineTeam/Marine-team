-- CreateEnum
CREATE TYPE "AuthorizedEmailStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "AccessDenialReason" AS ENUM ('NOT_ORG_MEMBER', 'EMAIL_NOT_AUTHORIZED', 'NOT_ORG_MEMBER_AND_EMAIL_NOT_AUTHORIZED', 'AUTH0_CALLBACK_ERROR');

-- CreateEnum
CREATE TYPE "AccessAttemptType" AS ENUM ('LOGIN', 'SIGNUP', 'SESSION');

-- CreateTable
CREATE TABLE "AuthorizedEmail" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "status" "AuthorizedEmailStatus" NOT NULL DEFAULT 'ACTIVE',
    "note" TEXT,
    "addedById" TEXT,
    "addedByEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuthorizedEmail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UnauthorizedAccessAttempt" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "email" TEXT,
    "auth0UserId" TEXT,
    "provider" TEXT,
    "attemptType" "AccessAttemptType" NOT NULL,
    "organizationMember" BOOLEAN NOT NULL DEFAULT false,
    "emailAuthorized" BOOLEAN NOT NULL DEFAULT false,
    "reason" "AccessDenialReason" NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "notifiedAt" TIMESTAMP(3),
    "reviewedAt" TIMESTAMP(3),
    "reviewedByEmail" TEXT,

    CONSTRAINT "UnauthorizedAccessAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AuthorizedEmail_email_key" ON "AuthorizedEmail"("email");

-- CreateIndex
CREATE INDEX "AuthorizedEmail_createdAt_idx" ON "AuthorizedEmail"("createdAt");

-- CreateIndex
CREATE INDEX "UnauthorizedAccessAttempt_createdAt_idx" ON "UnauthorizedAccessAttempt"("createdAt");

-- CreateIndex
CREATE INDEX "UnauthorizedAccessAttempt_email_idx" ON "UnauthorizedAccessAttempt"("email");

-- CreateIndex
CREATE INDEX "UnauthorizedAccessAttempt_provider_idx" ON "UnauthorizedAccessAttempt"("provider");

-- CreateIndex
CREATE INDEX "UnauthorizedAccessAttempt_reason_idx" ON "UnauthorizedAccessAttempt"("reason");

-- CreateIndex
CREATE INDEX "UnauthorizedAccessAttempt_email_notifiedAt_idx" ON "UnauthorizedAccessAttempt"("email", "notifiedAt");

-- AddForeignKey
ALTER TABLE "AuthorizedEmail" ADD CONSTRAINT "AuthorizedEmail_addedById_fkey" FOREIGN KEY ("addedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Seed the allowlist from the access already granted, so enabling this layer
-- doesn't lock out every existing member on deploy. `User.authorized` was the
-- previous allowlist; every authorized account keeps its access, normalized to
-- lowercase to match the new unique index. New grants go through
-- AuthorizedEmail from here on.
INSERT INTO "AuthorizedEmail" ("id", "email", "status", "note", "createdAt", "updatedAt")
SELECT
    gen_random_uuid()::text,
    lower(btrim("email")),
    'ACTIVE',
    'Migrated from User.authorized',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "User"
WHERE "authorized" = true
ON CONFLICT ("email") DO NOTHING;
