-- A poster frame so a slide has something to show the moment it is on
-- screen, instead of black while its cover downloads. Mobile and desktop
-- covers are framed differently, so each needs its own still — the same
-- split the cover columns already make.
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "poster_mobile_url" text;
