CREATE OR REPLACE FUNCTION public.get_template_stats(p_framework_id uuid)
RETURNS TABLE(themes_count integer, skills_count integer)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    COALESCE((SELECT COUNT(*)::int FROM public.themes t WHERE t.framework_id = p_framework_id), 0) AS themes_count,
    COALESCE((SELECT COUNT(*)::int FROM public.skills s
              JOIN public.themes t ON t.id = s.theme_id
              WHERE t.framework_id = p_framework_id), 0) AS skills_count
  WHERE EXISTS (
    SELECT 1
    FROM public.competence_frameworks cf
    WHERE cf.id = p_framework_id
      AND cf.is_template = true
      AND cf.club_id IS NULL
      AND cf.team_id IS NULL
      AND cf.is_archived = false
  );
$$;

REVOKE EXECUTE ON FUNCTION public.get_template_stats(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_template_stats(uuid) TO anon, authenticated, service_role;