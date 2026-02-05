-- Add policy for supporters to view team_members of their linked players
CREATE POLICY "Supporters view team_members of linked players"
ON public.team_members
FOR SELECT
USING (
  user_id IN (
    SELECT player_id 
    FROM supporters_link 
    WHERE supporter_id = auth.uid()
  )
);