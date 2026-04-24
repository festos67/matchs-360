-- F6 — Verrou hard-delete clubs + RPC soft_delete_club
-- Empêche tout DELETE direct sur clubs (sauf service_role) et fournit
-- une RPC SECURITY DEFINER pour l'archivage propre avec cascade soft.

REVOKE DELETE ON public.clubs FROM authenticated, anon;

CREATE OR REPLACE FUNCTION public.block_hard_delete_clubs()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.role() = 'service_role' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'Hard DELETE forbidden on clubs — use UPDATE deleted_at = now()'
    USING ERRCODE = '42501';
END;
$$;

DROP TRIGGER IF EXISTS trg_block_hard_delete_clubs ON public.clubs;
CREATE TRIGGER trg_block_hard_delete_clubs
BEFORE DELETE ON public.clubs
FOR EACH ROW EXECUTE FUNCTION public.block_hard_delete_clubs();

CREATE OR REPLACE FUNCTION public.soft_delete_club(_club_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_caller UUID := auth.uid();
BEGIN
  IF NOT public.is_admin(v_caller) THEN
    RAISE EXCEPTION 'Forbidden: only super-admin can archive a club'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.clubs
     SET deleted_at = now()
   WHERE id = _club_id AND deleted_at IS NULL;

  UPDATE public.teams
     SET deleted_at = now()
   WHERE club_id = _club_id AND deleted_at IS NULL;

  UPDATE public.team_members tm
     SET deleted_at = now(), is_active = false, left_at = COALESCE(tm.left_at, now())
   WHERE tm.team_id IN (SELECT id FROM public.teams WHERE club_id = _club_id)
     AND tm.deleted_at IS NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.soft_delete_club(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.soft_delete_club(UUID) TO authenticated;