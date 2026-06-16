
SET session_replication_role = replica;

UPDATE public.team_members
SET is_active = false, deleted_at = now()
WHERE team_id IN (
  SELECT id FROM public.teams WHERE club_id = '9f941640-ebeb-4049-ad5d-c450da89c4d6'
)
AND deleted_at IS NULL;

UPDATE public.teams
SET deleted_at = now()
WHERE club_id = '9f941640-ebeb-4049-ad5d-c450da89c4d6'
  AND deleted_at IS NULL;

UPDATE public.clubs
SET deleted_at = now()
WHERE id = '9f941640-ebeb-4049-ad5d-c450da89c4d6'
  AND deleted_at IS NULL;

SET session_replication_role = origin;
