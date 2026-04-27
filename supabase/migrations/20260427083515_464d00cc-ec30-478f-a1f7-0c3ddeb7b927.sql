BEGIN;

-- ============================================================
-- R2 / A5-001 (2026-04-27): Fix path parsing in
-- can_write_objective_attachment.
-- The version in 20260425065836 (F-205+F-213) assumed layout
-- <objective_id>/<filename> but the frontend actually uploads:
--   - <team_id>/<objective_id>/<uuid>          (team objectives)
--   - player/<player_id>/<objective_id>/<uuid> (player objectives)
-- Result: ALL non-admin uploads have been refused since 25/04.
-- F-205/F-213 anti-oracle (silent RETURN false) is preserved
-- and runs BEFORE any parsing to avoid timing oracles.
-- ============================================================

CREATE OR REPLACE FUNCTION public.can_write_objective_attachment(
  _user_id uuid,
  _path text
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, storage
AS $$
DECLARE
  v_segments text[];
  v_first_segment text;
  v_objective_id uuid;
  v_team_id uuid;
BEGIN
  -- F-205/F-213 anti-oracle: silent refusal if a non-privileged
  -- caller probes for another user. Runs BEFORE parsing to avoid
  -- a timing oracle distinguishing "valid layout" from "invalid".
  IF _user_id IS DISTINCT FROM auth.uid()
     AND auth.role() IS DISTINCT FROM 'service_role'
     AND NOT EXISTS (
       SELECT 1 FROM public.user_roles ur
       WHERE ur.user_id = auth.uid() AND ur.role = 'admin'
     ) THEN
    RETURN false;
  END IF;

  IF _path IS NULL OR _path = '' THEN
    RETURN false;
  END IF;

  -- R2 (2026-04-27): support 2 known layouts
  --   Layout A (team)   : <team_id>/<objective_id>/<uuid>[...]
  --   Layout B (player) : player/<player_id>/<objective_id>/<uuid>[...]
  v_segments := string_to_array(_path, '/');

  IF v_segments IS NULL OR array_length(v_segments, 1) < 3 THEN
    RETURN false;
  END IF;

  v_first_segment := v_segments[1];

  IF v_first_segment = 'player' THEN
    -- Layout B: position 3 = objective_id
    BEGIN
      v_objective_id := v_segments[3]::uuid;
    EXCEPTION WHEN OTHERS THEN
      RETURN false;
    END;
  ELSE
    -- Layout A: position 2 = objective_id
    BEGIN
      v_objective_id := v_segments[2]::uuid;
    EXCEPTION WHEN OTHERS THEN
      RETURN false;
    END;
  END IF;

  -- Lookup team_objectives first
  SELECT team_id INTO v_team_id
  FROM public.team_objectives
  WHERE id = v_objective_id;

  IF v_team_id IS NOT NULL THEN
    RETURN public.is_admin(_user_id)
        OR public.is_club_admin_of_team(_user_id, v_team_id)
        OR public.is_referent_coach_of_team(_user_id, v_team_id);
  END IF;

  -- Fallback player_objectives
  SELECT team_id INTO v_team_id
  FROM public.player_objectives
  WHERE id = v_objective_id;

  IF v_team_id IS NOT NULL THEN
    RETURN public.is_admin(_user_id)
        OR public.is_club_admin_of_team(_user_id, v_team_id)
        OR public.is_referent_coach_of_team(_user_id, v_team_id);
  END IF;

  RETURN false;
EXCEPTION WHEN OTHERS THEN
  -- Ultimate safety net: any unexpected error → silent refusal
  -- (preserves anti-oracle even on unforeseen exception)
  RETURN false;
END;
$$;

COMMENT ON FUNCTION public.can_write_objective_attachment(uuid, text) IS
  'F-213 (2026-04-25, R2 fixed 2026-04-27): silently refuses identity probes by non-privileged callers. Path parsing supports both layouts: <team_id>/<objective_id>/<uuid> AND player/<player_id>/<objective_id>/<uuid>. Returns false silently for any other layout.';

-- GRANTS already applied by 20260425065836; no need to reapply.

COMMIT;