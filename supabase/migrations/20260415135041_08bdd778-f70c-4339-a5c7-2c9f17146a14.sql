
-- 1. Helper: get club_id for a player via team_members (source of truth)
CREATE OR REPLACE FUNCTION public.get_player_club_id(_player_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT t.club_id
  FROM public.team_members tm
  JOIN public.teams t ON t.id = tm.team_id
  WHERE tm.user_id = _player_id
    AND tm.member_type = 'player'
    AND tm.is_active = true
    AND tm.deleted_at IS NULL
  LIMIT 1;
$$;

-- 2. Trigger function: sync profiles.club_id when team_members changes
CREATE OR REPLACE FUNCTION public.sync_profile_club_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _club_id uuid;
BEGIN
  -- Only for players
  IF COALESCE(NEW.member_type, OLD.member_type) <> 'player' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Determine user_id
  DECLARE _user_id uuid := COALESCE(NEW.user_id, OLD.user_id);
  BEGIN
    SELECT t.club_id INTO _club_id
    FROM public.team_members tm
    JOIN public.teams t ON t.id = tm.team_id
    WHERE tm.user_id = _user_id
      AND tm.member_type = 'player'
      AND tm.is_active = true
      AND tm.deleted_at IS NULL
    LIMIT 1;

    UPDATE public.profiles
    SET club_id = _club_id
    WHERE id = _user_id AND (club_id IS DISTINCT FROM _club_id);
  END;

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Create the trigger
DROP TRIGGER IF EXISTS trg_sync_profile_club_id ON public.team_members;
CREATE TRIGGER trg_sync_profile_club_id
AFTER INSERT OR UPDATE OF is_active, deleted_at, team_id, member_type
ON public.team_members
FOR EACH ROW
EXECUTE FUNCTION public.sync_profile_club_id();

-- 3. Fix RLS: evaluations - club admin view via team_members instead of profiles.club_id
DROP POLICY IF EXISTS "Club admins can view evaluations in their club" ON public.evaluations;
CREATE POLICY "Club admins can view evaluations in their club"
ON public.evaluations
FOR SELECT
TO public
USING (
  is_admin(auth.uid())
  OR EXISTS (
    SELECT 1
    FROM public.team_members tm
    JOIN public.teams t ON t.id = tm.team_id
    WHERE tm.user_id = evaluations.player_id
      AND tm.member_type = 'player'
      AND tm.is_active = true
      AND tm.deleted_at IS NULL
      AND is_club_admin(auth.uid(), t.club_id)
  )
);

-- 3b. Fix RLS: evaluation_scores - club admin view via team_members
DROP POLICY IF EXISTS "Club admins can view evaluation scores in their club" ON public.evaluation_scores;
CREATE POLICY "Club admins can view evaluation scores in their club"
ON public.evaluation_scores
FOR SELECT
TO public
USING (
  is_admin(auth.uid())
  OR EXISTS (
    SELECT 1
    FROM public.evaluations e
    JOIN public.team_members tm ON tm.user_id = e.player_id
      AND tm.member_type = 'player'
      AND tm.is_active = true
      AND tm.deleted_at IS NULL
    JOIN public.teams t ON t.id = tm.team_id
    WHERE e.id = evaluation_scores.evaluation_id
      AND is_club_admin(auth.uid(), t.club_id)
  )
);

-- 3c. Fix RLS: evaluation_objectives - club admin view via team_members
DROP POLICY IF EXISTS "Club admins can view evaluation objectives in their club" ON public.evaluation_objectives;
CREATE POLICY "Club admins can view evaluation objectives in their club"
ON public.evaluation_objectives
FOR SELECT
TO public
USING (
  is_admin(auth.uid())
  OR EXISTS (
    SELECT 1
    FROM public.evaluations e
    JOIN public.team_members tm ON tm.user_id = e.player_id
      AND tm.member_type = 'player'
      AND tm.is_active = true
      AND tm.deleted_at IS NULL
    JOIN public.teams t ON t.id = tm.team_id
    WHERE e.id = evaluation_objectives.evaluation_id
      AND is_club_admin(auth.uid(), t.club_id)
  )
);

-- 3d. Fix RLS: supporter_evaluation_requests - club admin via team_members
DROP POLICY IF EXISTS "Club admins can manage supporter evaluation requests" ON public.supporter_evaluation_requests;
CREATE POLICY "Club admins can manage supporter evaluation requests"
ON public.supporter_evaluation_requests
FOR ALL
TO public
USING (
  EXISTS (
    SELECT 1
    FROM public.team_members tm
    JOIN public.teams t ON t.id = tm.team_id
    WHERE tm.user_id = supporter_evaluation_requests.player_id
      AND tm.member_type = 'player'
      AND tm.is_active = true
      AND tm.deleted_at IS NULL
      AND is_club_admin(auth.uid(), t.club_id)
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.team_members tm
    JOIN public.teams t ON t.id = tm.team_id
    WHERE tm.user_id = supporter_evaluation_requests.player_id
      AND tm.member_type = 'player'
      AND tm.is_active = true
      AND tm.deleted_at IS NULL
      AND is_club_admin(auth.uid(), t.club_id)
  )
);

-- 3e. Fix RLS: supporters_link - club admin via team_members
DROP POLICY IF EXISTS "Club admin manage supporters" ON public.supporters_link;
CREATE POLICY "Club admin manage supporters"
ON public.supporters_link
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.team_members tm
    JOIN public.teams t ON t.id = tm.team_id
    WHERE tm.user_id = supporters_link.player_id
      AND tm.member_type = 'player'
      AND tm.is_active = true
      AND tm.deleted_at IS NULL
      AND is_club_admin(auth.uid(), t.club_id)
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.team_members tm
    JOIN public.teams t ON t.id = tm.team_id
    WHERE tm.user_id = supporters_link.player_id
      AND tm.member_type = 'player'
      AND tm.is_active = true
      AND tm.deleted_at IS NULL
      AND is_club_admin(auth.uid(), t.club_id)
  )
);

-- 4. Repair existing data: sync all player profiles.club_id
UPDATE public.profiles p
SET club_id = sub.club_id
FROM (
  SELECT tm.user_id, t.club_id
  FROM public.team_members tm
  JOIN public.teams t ON t.id = tm.team_id
  WHERE tm.member_type = 'player'
    AND tm.is_active = true
    AND tm.deleted_at IS NULL
) sub
WHERE p.id = sub.user_id
  AND (p.club_id IS DISTINCT FROM sub.club_id);
