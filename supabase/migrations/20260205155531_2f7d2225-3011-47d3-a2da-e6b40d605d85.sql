-- Drop the overly broad policy and create explicit ones
DROP POLICY IF EXISTS "Club admin manage team_members" ON public.team_members;

-- Create explicit SELECT policy for club admins
CREATE POLICY "Club admin view team_members"
ON public.team_members
FOR SELECT
USING (
  team_id IN (
    SELECT t.id FROM teams t
    WHERE t.club_id IN (SELECT get_user_club_admin_ids(auth.uid()))
  )
);

-- Create explicit INSERT/UPDATE/DELETE policies for club admins
CREATE POLICY "Club admin insert team_members"
ON public.team_members
FOR INSERT
WITH CHECK (
  team_id IN (
    SELECT t.id FROM teams t
    WHERE t.club_id IN (SELECT get_user_club_admin_ids(auth.uid()))
  )
);

CREATE POLICY "Club admin update team_members"
ON public.team_members
FOR UPDATE
USING (
  team_id IN (
    SELECT t.id FROM teams t
    WHERE t.club_id IN (SELECT get_user_club_admin_ids(auth.uid()))
  )
);

CREATE POLICY "Club admin delete team_members"
ON public.team_members
FOR DELETE
USING (
  team_id IN (
    SELECT t.id FROM teams t
    WHERE t.club_id IN (SELECT get_user_club_admin_ids(auth.uid()))
  )
);