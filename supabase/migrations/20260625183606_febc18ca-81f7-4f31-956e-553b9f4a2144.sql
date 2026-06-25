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
  WITH active_coach_clubs AS (
    SELECT DISTINCT t.club_id
    FROM public.team_members tm
    JOIN public.teams t ON t.id = tm.team_id
    JOIN public.clubs c ON c.id = t.club_id
    WHERE tm.user_id = p_user_id
      AND tm.member_type = 'coach'
      AND tm.is_active = true
      AND tm.deleted_at IS NULL
      AND t.deleted_at IS NULL
      AND c.deleted_at IS NULL
  )
  SELECT COALESCE(
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
$function$;

REVOKE EXECUTE ON FUNCTION public.get_coach_effective_club_id(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_coach_effective_club_id(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_coach_effective_club_id(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_coach_effective_club_id(uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.get_coach_my_club_dashboard_stats(p_user_id uuid, p_club_id uuid)
RETURNS TABLE(
  my_teams integer,
  my_players integer,
  my_supporters integer,
  total_teams integer,
  total_coaches integer,
  total_players integer,
  total_supporters integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH effective_club AS (
    SELECT public.get_coach_effective_club_id(p_user_id, p_club_id) AS club_id
  ),
  active_teams AS (
    SELECT t.id
    FROM public.teams t
    JOIN public.clubs c ON c.id = t.club_id
    JOIN effective_club ec ON ec.club_id = t.club_id
    WHERE t.deleted_at IS NULL
      AND c.deleted_at IS NULL
  ),
  my_team_ids AS (
    SELECT DISTINCT tm.team_id
    FROM public.team_members tm
    JOIN active_teams at ON at.id = tm.team_id
    WHERE tm.user_id = p_user_id
      AND tm.member_type = 'coach'
      AND tm.is_active = true
      AND tm.deleted_at IS NULL
  ),
  club_players AS (
    SELECT DISTINCT tm.user_id AS player_id
    FROM public.team_members tm
    JOIN active_teams at ON at.id = tm.team_id
    WHERE tm.member_type = 'player'
      AND tm.is_active = true
      AND tm.deleted_at IS NULL
      AND tm.user_id IS NOT NULL
  ),
  my_players AS (
    SELECT DISTINCT tm.user_id AS player_id
    FROM public.team_members tm
    JOIN my_team_ids mt ON mt.team_id = tm.team_id
    WHERE tm.member_type = 'player'
      AND tm.is_active = true
      AND tm.deleted_at IS NULL
      AND tm.user_id IS NOT NULL
  ),
  club_coaches AS (
    SELECT DISTINCT coach_id
    FROM (
      SELECT tm.user_id AS coach_id
      FROM public.team_members tm
      JOIN active_teams at ON at.id = tm.team_id
      WHERE tm.member_type = 'coach'
        AND tm.is_active = true
        AND tm.deleted_at IS NULL
        AND tm.user_id IS NOT NULL
      UNION
      SELECT ur.user_id AS coach_id
      FROM public.user_roles ur
      JOIN effective_club ec ON ec.club_id = ur.club_id
      WHERE ur.role = 'coach'
    ) c
    WHERE coach_id IS NOT NULL
  )
  SELECT
    (SELECT count(*)::int FROM my_team_ids) AS my_teams,
    (SELECT count(*)::int FROM my_players) AS my_players,
    (SELECT count(DISTINCT sl.supporter_id)::int
     FROM public.supporters_link sl
     JOIN my_players mp ON mp.player_id = sl.player_id) AS my_supporters,
    (SELECT count(*)::int FROM active_teams) AS total_teams,
    (SELECT count(*)::int FROM club_coaches) AS total_coaches,
    (SELECT count(*)::int FROM club_players) AS total_players,
    (SELECT count(DISTINCT sl.supporter_id)::int
     FROM public.supporters_link sl
     JOIN club_players cp ON cp.player_id = sl.player_id) AS total_supporters
$function$;

REVOKE EXECUTE ON FUNCTION public.get_coach_my_club_dashboard_stats(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_coach_my_club_dashboard_stats(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_coach_my_club_dashboard_stats(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_coach_my_club_dashboard_stats(uuid, uuid) TO service_role;