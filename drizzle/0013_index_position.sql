-- Manual drag-to-reorder support for the Index page. null means "not
-- manually placed yet" -- listIndexTab() falls back to sorting by
-- completion date for any project without an explicit position.
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "index_position" integer;
