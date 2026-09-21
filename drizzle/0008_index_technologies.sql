-- The Index table lists what was built alongside what it was built with.
-- `category` already carries the first ("Branding, Website"); this adds the
-- second. Free text rather than a relation: it's a comma-separated label
-- that only ever renders as written.
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "technologies" text;
