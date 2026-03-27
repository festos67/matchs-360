DROP POLICY IF EXISTS "Players view teammates in their team" ON public.team_members;

CREATE POLICY "Players view teammates in their team"
ON public.team_members
FOR SELECT
TO authenticated
USING (
  is_active = true 
  AND team_id IN (SELECT get_user_team_ids(auth.uid()))
);