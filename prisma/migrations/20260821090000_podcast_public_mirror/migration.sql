-- AlterTable
ALTER TABLE "FileAsset" ADD COLUMN     "podcastPublished" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "publicPath" TEXT;

-- Existing audio in public series was previously published to the podcast
-- feed implicitly, with no admin ever opting in. It is deliberately NOT
-- back-filled to podcastPublished = true: publishing a file to a permanently
-- public, unauthenticated URL is a decision someone should make on purpose,
-- and an existing feed going quiet is a far better failure than files being
-- copied to a public zone nobody asked for. Re-tick the ones you want in
-- /admin/files.
