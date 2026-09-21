-- Restore per-tab curation for Image and Immersive: they need their own
-- ordering (not the global one) and their own membership picker. Index is
-- now derived automatically from every published project sorted by year,
-- so it drops its membership rows. Landing is a site setting, so it drops
-- its membership too.

-- Image: ensure a membership row for every project currently flagged as
-- show_in_image, preserving any pre-existing position. Falls back to the
-- master position when no legacy row exists.
INSERT INTO project_tabs (project_id, tab, position, published)
SELECT
  p.id,
  'image',
  COALESCE(
    (SELECT pt.position FROM project_tabs pt
      WHERE pt.project_id = p.id AND pt.tab = 'image'),
    p.position
  ),
  true
FROM projects p
WHERE COALESCE(p.show_in_image, false) = true
ON CONFLICT (project_id, tab) DO NOTHING;

DELETE FROM project_tabs
WHERE tab = 'image'
  AND project_id IN (
    SELECT id FROM projects WHERE COALESCE(show_in_image, false) = false
  );

-- Same for Immersive.
INSERT INTO project_tabs (project_id, tab, position, published)
SELECT
  p.id,
  'immersive',
  COALESCE(
    (SELECT pt.position FROM project_tabs pt
      WHERE pt.project_id = p.id AND pt.tab = 'immersive'),
    p.position
  ),
  true
FROM projects p
WHERE COALESCE(p.show_in_immersive, false) = true
ON CONFLICT (project_id, tab) DO NOTHING;

DELETE FROM project_tabs
WHERE tab = 'immersive'
  AND project_id IN (
    SELECT id FROM projects WHERE COALESCE(show_in_immersive, false) = false
  );

-- Drop legacy tabs the app no longer curates via memberships.
DELETE FROM project_tabs WHERE tab IN ('landing', 'index');
