-- Add policy for supporters to view framework of players they're linked to
CREATE POLICY "Supporters view framework of linked players"
ON public.competence_frameworks
FOR SELECT
USING (
  team_id IN (
    SELECT tm.team_id
    FROM supporters_link sl
    JOIN team_members tm ON tm.user_id = sl.player_id AND tm.is_active = true AND tm.member_type = 'player'
    WHERE sl.supporter_id = auth.uid()
  )
);