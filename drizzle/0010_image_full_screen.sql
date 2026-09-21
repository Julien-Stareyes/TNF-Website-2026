-- 16:9 projects on the Image tab used to always render full-bleed. This
-- adds a per-project toggle so a 16:9 project can instead use the same
-- blurred-background + centered-card treatment as 4:5 projects. Defaults
-- to true so every existing 16:9 project keeps its current look.
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "image_full_screen" boolean NOT NULL DEFAULT true;
