-- Separate, heavily-compressed clip for the blurred full-bleed background
-- behind 4:5 (and non-full-screen 16:9) slides -- avoids decoding the
-- full-quality cover twice at once on the same slide, which matters most
-- on phones. Optional: falls back to the main cover when empty.
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "image_cover_blur_url" text;
