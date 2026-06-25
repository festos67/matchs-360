CREATE OR REPLACE FUNCTION public.get_coach_effective_club_id(
  p_user_id uuid,
  p_preferred_club_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH authorized AS (
    SELECT (auth.uid() = p_user_id OR public.is_admin(auth.uid())) AS ok
  ),
  active_coach_clubs AS (
    SELECT DISTINCT t.club_id
    FROM public.team_members tm
    JOIN public.teams t ON t.id = tm.team_id
    JOIN public.clubs c ON c.id = t.club_id
    CROSS JOIN authorized a
    WHERE a.ok
      AND tm.user_id = p_user_id
      AND tm.member_type = 'coach'
      AND tm.is_active = true
      AND tm.deleted_at IS NULL
      AND t.deleted_at IS NULL
      AND c.deleted_at IS NULL
  )
  SELECT CASE
    WHEN NOT EXISTS (SELECT 1 FROM authorized WHERE ok) THEN NULL
    ELSE COALESCE(
      (
        SELECT p_preferred_club_id
        FROM active_coach_clubs
        WHERE club_id = p_preferred_club_id
        LIMIT 1
      ),
      (
        SELECT club_id
        FROM active_coach_clubs
        ORDER BY club_id
        LIMIT 1
      ),
      p_preferred_club_id
    )
  END
$function$;

REVOKE EXECUTE ON FUNCTION public.get_coach_effective_club_id(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_coach_effective_club_id(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_coach_effective_club_id(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_coach_effective_club_id(uuid, uuid) TO service_role;