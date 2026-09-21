-- Project detail pages come in two shapes now. `image` is the existing
-- horizontal card carousel; `immersive` is a vertical case study built
-- from stacked blocks the operator arranges themselves.
--
-- blocks: [
--   { id, type: 'media', width: 'full'|'wide'|'narrow',
--     items: [{ url, mediaType: 'image'|'video', span: 1..12 }] },
--   { id, type: 'text', content, align: 'left'|'center', width: ... }
-- ]

ALTER TABLE "projects"
  ADD COLUMN IF NOT EXISTS "detail_mode" text NOT NULL DEFAULT 'image';

ALTER TABLE "projects"
  ADD COLUMN IF NOT EXISTS "blocks" jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Projects already curated into the Immersive tab default to the new
-- layout; everything else keeps the carousel.
UPDATE "projects" p
SET "detail_mode" = 'immersive'
FROM "project_tabs" pt
WHERE pt."project_id" = p."id" AND pt."tab" = 'immersive';
