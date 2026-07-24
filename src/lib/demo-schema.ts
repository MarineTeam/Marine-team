/**
 * Schema DDL for the /demo database, split into individually-executable
 * statements. Used by /api/admin/demo/setup to initialize a separate demo
 * database from the deployed app itself (some environments, like this
 * project's own sandboxed dev tooling, can't reach a direct Postgres
 * connection or run `prisma db push`, but a deployed serverless function
 * always can). Kept as a plain TS export rather than reading a bundled
 * .sql file at runtime, so it's guaranteed to be included wherever this
 * module is imported.
 *
 * Excludes "CREATE SCHEMA" — some managed Postgres providers reject it
 * since "public" already exists by default.
 *
 * Regenerate by running (and dropping the CREATE SCHEMA statement):
 *   npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script
 */
export const DEMO_SCHEMA_STATEMENTS: string[] = [
  `CREATE TYPE "Role" AS ENUM ('MEMBER', 'ADMIN')`,
  `CREATE TYPE "VideoStatus" AS ENUM ('PROCESSING', 'READY', 'FAILED')`,
  `CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "auth0Id" TEXT,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "picture" TEXT,
    "role" "Role" NOT NULL DEFAULT 'MEMBER',
    "authorized" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE TABLE "Series" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "coverImageUrl" TEXT,
    "memberOnly" BOOLEAN NOT NULL DEFAULT false,
    "published" BOOLEAN NOT NULL DEFAULT true,
    "position" INTEGER NOT NULL DEFAULT 0,
    "categoryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Series_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE TABLE "Video" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "bunnyVideoId" TEXT NOT NULL,
    "bunnyLibraryId" TEXT NOT NULL,
    "thumbnailUrl" TEXT,
    "durationSeconds" INTEGER,
    "status" "VideoStatus" NOT NULL DEFAULT 'PROCESSING',
    "memberOnly" BOOLEAN NOT NULL DEFAULT false,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL DEFAULT 0,
    "seriesId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Video_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE TABLE "FileAsset" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "bunnyPath" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "sizeBytes" INTEGER,
    "mimeType" TEXT,
    "memberOnly" BOOLEAN NOT NULL DEFAULT false,
    "published" BOOLEAN NOT NULL DEFAULT true,
    "position" INTEGER NOT NULL DEFAULT 0,
    "seriesId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FileAsset_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE UNIQUE INDEX "User_auth0Id_key" ON "User"("auth0Id")`,
  `CREATE UNIQUE INDEX "User_email_key" ON "User"("email")`,
  `CREATE UNIQUE INDEX "Category_slug_key" ON "Category"("slug")`,
  `CREATE UNIQUE INDEX "Series_slug_key" ON "Series"("slug")`,
  `CREATE UNIQUE INDEX "Video_slug_key" ON "Video"("slug")`,
  `CREATE INDEX "Video_seriesId_idx" ON "Video"("seriesId")`,
  `CREATE INDEX "FileAsset_seriesId_idx" ON "FileAsset"("seriesId")`,
  `ALTER TABLE "Series" ADD CONSTRAINT "Series_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE`,
  `ALTER TABLE "Video" ADD CONSTRAINT "Video_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "Series"("id") ON DELETE SET NULL ON UPDATE CASCADE`,
  `ALTER TABLE "FileAsset" ADD CONSTRAINT "FileAsset_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "Series"("id") ON DELETE SET NULL ON UPDATE CASCADE`,
];
