-- The deployment's own name and accent colours, so re-skinning is an admin
-- action rather than a deploy. See the model comment in schema.prisma.

-- CreateTable
CREATE TABLE "BrandSettings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "name" TEXT NOT NULL DEFAULT 'Marine Team',
    "shortName" TEXT NOT NULL DEFAULT 'Marine Team',
    "brand" TEXT NOT NULL DEFAULT '#1a8fd1',
    "brandDeep" TEXT NOT NULL DEFAULT '#0288d1',
    "brandLight" TEXT NOT NULL DEFAULT '#4fc3f7',
    "logoUrl" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BrandSettings_pkey" PRIMARY KEY ("id")
);
