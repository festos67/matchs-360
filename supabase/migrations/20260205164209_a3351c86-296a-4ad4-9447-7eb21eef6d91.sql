-- Add RLS policy for players/coaches to view their own team membership
CREATE POLICY "Users can view own team membership"
ON public.team_members
FOR SELECT
TO authenticated
USING (user_id = auth.uid());