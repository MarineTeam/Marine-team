-- Master switch for /auth/guest, so an admin can close it again without a
-- redeploy once the guest they invited no longer needs it. Defaults closed —
-- see the model comment in schema.prisma.

-- CreateTable
CREATE TABLE "AuthSettings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "guestLoginEnabled" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuthSettings_pkey" PRIMARY KEY ("id")
);
