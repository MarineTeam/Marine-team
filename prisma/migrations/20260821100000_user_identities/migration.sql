-- CreateTable
CREATE TABLE "UserIdentity" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sub" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "lastLoginAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserIdentity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserIdentity_sub_key" ON "UserIdentity"("sub");

-- CreateIndex
CREATE INDEX "UserIdentity_userId_idx" ON "UserIdentity"("userId");

-- CreateIndex
CREATE INDEX "UserIdentity_email_idx" ON "UserIdentity"("email");

-- AddForeignKey
ALTER TABLE "UserIdentity" ADD CONSTRAINT "UserIdentity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Back-fill one identity per existing member from the auth0Id already on the
-- row, so nobody's current sign-in method appears "new" the first time they
-- log in after this ships. emailVerified is set true for these: they are
-- identities that have already been through the org + allowlist checks and
-- are in use, so treating them as unverified would lock existing members out
-- of their own accounts the moment the linking rule below starts applying.
INSERT INTO "UserIdentity" ("id", "userId", "sub", "provider", "email", "emailVerified", "lastLoginAt", "createdAt")
SELECT
    gen_random_uuid()::text,
    "id",
    "auth0Id",
    COALESCE(NULLIF(split_part("auth0Id", '|', 1), ''), 'unknown'),
    "email",
    true,
    "updatedAt",
    "createdAt"
FROM "User"
WHERE "auth0Id" IS NOT NULL;
