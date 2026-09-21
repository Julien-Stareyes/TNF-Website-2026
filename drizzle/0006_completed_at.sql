-- Precise completion date on each project. The Index shows only the year,
-- but the sort key is the full date so operators can order same-year
-- projects exactly. Backfilled from `year` (Jan 1 of that year) so
-- existing projects keep a sensible position.

ALTER TABLE "projects"
  ADD COLUMN IF NOT EXISTS "completed_at" date;

UPDATE "projects"
SET "completed_at" = make_date(COALESCE("year", 2026), 1, 1)
WHERE "completed_at" IS NULL;
