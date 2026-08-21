-- Restores the book badge dropped in 20260821120000. A hymnal book can be
-- either a series (named, badged, with a cover) or a bare PDF, so the badge
-- has somewhere to live again for the series form.

-- AlterTable
ALTER TABLE "Series" ADD COLUMN "abbreviation" TEXT;
