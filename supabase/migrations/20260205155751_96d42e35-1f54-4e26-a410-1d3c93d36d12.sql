-- Fix infinite recursion in RLS policies for team_members by avoiding direct SELECT on teams

-- 1) Helper: club admin scope check for a team (SECURITY DEFINER avoids RLS recursion)
CREATE OR REPLACE FUNCTION public.is_club_admin_of_team(_user_id uuid, _team_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.teams t
    WHERE t.id = _team_id
      AND public.is_club_admin(_user_id, t.club_id)
  );
$$;

-- 2) Drop existing policies on team_members (recreate cleanly)
DO $$
DECLARE
  p record;
BEGIN
  FOR p IN
    SELECT polname
    FROM pg_policy
    WHERE polrelid = 'public.team_members'::regclass
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.team_members', p.polname);
  END LOOP;
END
$$;

-- 3) Recreate policies with explicit TO authenticated

-- Admin full access
CREATE POLICY "Admin full access to team_members"
ON public.team_members
AS PERMISSIVE
FOR ALL
TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

-- Club admin view
CREATE POLICY "Club admin view team_members"
ON public.team_members
AS PERMISSIVE
FOR SELECT
TO authenticated
USING (public.is_club_admin_of_team(auth.uid(), team_id));

-- Club admin insert
CREATE POLICY "Club admin insert team_members"
ON public.team_members
AS PERMISSIVE
FOR INSERT
TO authenticated
WITH CHECK (public.is_club_admin_of_team(auth.uid(), team_id));

-- Club admin update
CREATE POLICY "Club admin update team_members"
ON public.team_members
AS PERMISSIVE
FOR UPDATE
TO authenticated
USING (public.is_club_admin_of_team(auth.uid(), team_id))
WITH CHECK (public.is_club_admin_of_team(auth.uid(), team_id));

-- Club admin delete
CREATE POLICY "Club admin delete team_members"
ON public.team_members
AS PERMISSIVE
FOR DELETE
TO authenticated
USING (public.is_club_admin_of_team(auth.uid(), team_id));

-- Coaches view team_members
CREATE POLICY "Coaches view team_members"
ON public.team_members
AS PERMISSIVE
FOR SELECT
TO authenticated
USING (public.is_coach_of_team(auth.uid(), team_id));

-- Coaches manage players in their teams
CREATE POLICY "Coaches manage players in their teams"
ON public.team_members
AS PERMISSIVE
FOR ALL
TO authenticated
USING (public.is_coach_of_team(auth.uid(), team_id) AND member_type = 'player')
WITH CHECK (public.is_coach_of_team(auth.uid(), team_id) AND member_type = 'player');

-- Players view teammates
CREATE POLICY "Players view teammates"
ON public.team_members
AS PERMISSIVE
FOR SELECT
TO authenticated
USING (public.is_player_in_team(auth.uid(), team_id));

-- Supporters view team_members of linked players
CREATE POLICY "Supporters view team_members of linked players"
ON public.team_members
AS PERMISSIVE
FOR SELECT
TO authenticated
USING (
  is_active = true
  AND user_id IN (
    SELECT sl.player_id
    FROM public.supporters_link sl
    WHERE sl.supporter_id = auth.uid()
  )
);
