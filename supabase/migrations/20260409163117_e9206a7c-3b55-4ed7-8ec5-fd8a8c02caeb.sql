-- Update the "Team members view framework" policy to also allow club admins
-- who are not direct team members to view team frameworks
DROP POLICY IF EXISTS "Team members view framework" ON competence_frameworks;

CREATE POLICY "Team members view framework" ON competence_frameworks
  FOR SELECT TO authenticated
  USING (
    (is_template = true)
    OR (team_id IN (SELECT get_user_team_ids(auth.uid())))
    OR (
      team_id IS NOT NULL 
      AND EXISTS (
        SELECT 1 FROM teams t 
        WHERE t.id = competence_frameworks.team_id 
          AND is_club_admin(auth.uid(), t.club_id)
      )
    )
  );