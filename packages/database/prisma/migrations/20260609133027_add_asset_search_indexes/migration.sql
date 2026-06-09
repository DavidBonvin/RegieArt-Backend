-- Full-text search index on assets using GIN with tsvector
-- Covers: displayName, originalName, description (all optional, coalesced to empty string)
CREATE INDEX "assets_fts_idx" ON "assets" USING GIN (
  to_tsvector(
    'simple',
    coalesce("displayName", '') || ' ' ||
    coalesce("originalName", '') || ' ' ||
    coalesce("description", '')
  )
);