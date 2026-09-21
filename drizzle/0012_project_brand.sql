-- The project's brand/client name, shown by the cursor-following label
-- on the Image carousel (ScrollScramble.jsx's CursorLabel) -- kept
-- separate from "title" so the two can read differently. Existing
-- projects are backfilled from their current title, per how the admin
-- seeds it for new ones too.
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "brand" text;
UPDATE "projects" SET "brand" = "title" WHERE "brand" IS NULL;
