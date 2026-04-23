-- =========================================================================
-- FIX cycle 4 #5 — Column-level guard on team_members scope-defining columns
-- Closes T-3 pattern (member_type swap silent) + T-3-bis (cross-team transfer
-- by multi-club club_admin). Mirrors fn_guard_privileged_role_grant pattern.
-- =========================================================================

CREATE OR REPLACE FUNCTION public.fn_guard_team_member_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Bypass 1: service_role (legitimate edge-function / migration jobs)
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- Bypass 2: super-admin
  IF public.is_admin(auth.uid()) THEN
    RETURN NEW;
  END IF;

  -- Authority check: caller must be club_admin of BOTH the source and
  -- destination team's clubs. For pure member_type / user_id swap (no
  -- team_id change), OLD.team_id = NEW.team_id so both checks resolve
  -- to the same club. For cross-team transfer (T-3-bis), both must hold.
  IF NOT (
    public.is_club_admin_of_team(auth.uid(), OLD.team_id)
    AND public.is_club_admin_of_team(auth.uid(), NEW.team_id)
  ) THEN
    RAISE EXCEPTION 'Forbidden: mutation of member_type / team_id / user_id on team_members requires club_admin authority over both source and destination teams clubs'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_team_member_mutation ON public.team_members;
CREATE TRIGGER trg_guard_team_member_mutation
  BEFORE UPDATE OF member_type, team_id, user_id
  ON public.team_members
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_guard_team_member_mutation();