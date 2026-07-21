
-- Public read access for global templates (frameworks with no club_id and no team_id + is_template)
-- Fixes the case where users see "0 thématiques et 0 compétences" for platform-provided templates.

DROP POLICY IF EXISTS "Public templates readable" ON public.competence_frameworks;
CREATE POLICY "Public templates readable"
  ON public.competence_frameworks
  FOR SELECT
  TO authenticated
  USING (is_template = true AND club_id IS NULL AND team_id IS NULL);

DROP POLICY IF EXISTS "Public template themes readable" ON public.themes;
CREATE POLICY "Public template themes readable"
  ON public.themes
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.competence_frameworks cf
      WHERE cf.id = themes.framework_id
        AND cf.is_template = true
        AND cf.club_id IS NULL
        AND cf.team_id IS NULL
    )
  );

DROP POLICY IF EXISTS "Public template skills readable" ON public.skills;
CREATE POLICY "Public template skills readable"
  ON public.skills
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.themes th
      JOIN public.competence_frameworks cf ON cf.id = th.framework_id
      WHERE th.id = skills.theme_id
        AND cf.is_template = true
        AND cf.club_id IS NULL
        AND cf.team_id IS NULL
    )
  );

-- SECURITY DEFINER helper used as a robust fallback for the template selector UI.
CREATE OR REPLACE FUNCTION public.get_template_stats(p_framework_id uuid)
RETURNS TABLE(themes_count integer, skills_count integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COALESCE((SELECT COUNT(*)::int FROM public.themes t WHERE t.framework_id = p_framework_id), 0) AS themes_count,
    COALESCE((SELECT COUNT(*)::int FROM public.skills s
              JOIN public.themes t ON t.id = s.theme_id
              WHERE t.framework_id = p_framework_id), 0) AS skills_count
  WHERE EXISTS (
    SELECT 1 FROM public.competence_frameworks cf
    WHERE cf.id = p_framework_id
      AND cf.is_template = true
      AND cf.club_id IS NULL
      AND cf.team_id IS NULL
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_template_stats(uuid) TO authenticated;
