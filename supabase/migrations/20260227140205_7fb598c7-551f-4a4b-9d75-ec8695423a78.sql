
-- Allow club admins to manage themes for club-level frameworks (where team_id is null)
CREATE POLICY "Club admin manage club framework themes"
  ON public.themes FOR ALL
  USING (
    framework_id IN (
      SELECT cf.id FROM competence_frameworks cf
      WHERE cf.club_id IS NOT NULL 
        AND cf.team_id IS NULL
        AND is_club_admin(auth.uid(), cf.club_id)
    )
  )
  WITH CHECK (
    framework_id IN (
      SELECT cf.id FROM competence_frameworks cf
      WHERE cf.club_id IS NOT NULL 
        AND cf.team_id IS NULL
        AND is_club_admin(auth.uid(), cf.club_id)
    )
  );

-- Allow club admins to manage skills for club-level frameworks
CREATE POLICY "Club admin manage club framework skills"
  ON public.skills FOR ALL
  USING (
    theme_id IN (
      SELECT th.id FROM themes th
      JOIN competence_frameworks cf ON th.framework_id = cf.id
      WHERE cf.club_id IS NOT NULL 
        AND cf.team_id IS NULL
        AND is_club_admin(auth.uid(), cf.club_id)
    )
  )
  WITH CHECK (
    theme_id IN (
      SELECT th.id FROM themes th
      JOIN competence_frameworks cf ON th.framework_id = cf.id
      WHERE cf.club_id IS NOT NULL 
        AND cf.team_id IS NULL
        AND is_club_admin(auth.uid(), cf.club_id)
    )
  );
