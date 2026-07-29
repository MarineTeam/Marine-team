-- Enables trigram similarity operators/functions (similarity(), %, word_similarity())
-- used by the search fallback in src/lib/content.ts, moving the fuzzy-match
-- pass from an in-memory 500-row scan onto an indexed SQL query.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- GIN trigram indexes: each also accelerates the existing `contains`
-- (ILIKE-backed) exact-match pass, not just the fuzzy fallback.
CREATE INDEX IF NOT EXISTS "Series_title_trgm_idx" ON "Series" USING GIN ("title" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Series_description_trgm_idx" ON "Series" USING GIN ("description" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Video_title_trgm_idx" ON "Video" USING GIN ("title" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Video_description_trgm_idx" ON "Video" USING GIN ("description" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Video_transcript_trgm_idx" ON "Video" USING GIN ("transcript" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Speaker_name_trgm_idx" ON "Speaker" USING GIN ("name" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Category_name_trgm_idx" ON "Category" USING GIN ("name" gin_trgm_ops);
