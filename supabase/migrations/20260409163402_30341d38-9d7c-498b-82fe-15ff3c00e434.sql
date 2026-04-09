-- Add policy for club admins to manage team frameworks (via teams table)
CREATE POLICY "Club admin manage team frameworks" ON competence_frameworks
  FOR ALL TO authenticated
  USING (
    team_id IS NOT NULL 
    AND EXISTS (
      SELECT 1 FROM teams t 
      WHERE t.id = competence_frameworks.team_id 
        AND is_club_admin(auth.uid(), t.club_id)
    )
  )
  WITH CHECK (
    team_id IS NOT NULL 
    AND EXISTS (
      SELECT 1 FROM teams t 
      WHERE t.id = competence_frameworks.team_id 
        AND is_club_admin(auth.uid(), t.club_id)
    )
  );