-- Master-list refactor: projects have a single global position, a pair of
-- tab-visibility flags (image/immersive), and their Image-tab covers moved
-- inline. Backfills from the legacy project_tabs table.

ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "position" integer NOT NULL DEFAULT 0;
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "show_in_image" boolean NOT NULL DEFAULT false;
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "show_in_immersive" boolean NOT NULL DEFAULT false;
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "image_cover_desktop_url" text;
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "image_cover_mobile_url" text;

-- Backfill master ordering from whichever tab has the most complete order.
-- Prefer the Index tab (that's the master list); fall back to Image, then
-- alphabetical as last resort.
UPDATE "projects" p
SET "position" = pt."position"
FROM "project_tabs" pt
WHERE pt."project_id" = p."id" AND pt."tab" = 'index';

UPDATE "projects" p
SET "position" = pt."position"
FROM "project_tabs" pt
WHERE pt."project_id" = p."id"
  AND pt."tab" = 'image'
  AND p."position" = 0
  AND NOT EXISTS (
    SELECT 1 FROM "project_tabs" pi
    WHERE pi."project_id" = p."id" AND pi."tab" = 'index'
  );

-- Backfill Image visibility + covers from legacy memberships.
UPDATE "projects" p
SET
  "show_in_image" = true,
  "image_cover_desktop_url" = COALESCE(p."image_cover_desktop_url", pt."image_cover_desktop_url"),
  "image_cover_mobile_url" = COALESCE(p."image_cover_mobile_url", pt."image_cover_mobile_url")
FROM "project_tabs" pt
WHERE pt."project_id" = p."id"
  AND pt."tab" = 'image'
  AND pt."published" = true;

UPDATE "projects" p
SET "show_in_immersive" = true
FROM "project_tabs" pt
WHERE pt."project_id" = p."id"
  AND pt."tab" = 'immersive'
  AND pt."published" = true;

-- Site settings — key/value singleton store.
CREATE TABLE IF NOT EXISTS "settings" (
  "key" text PRIMARY KEY,
  "value" jsonb NOT NULL,
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
